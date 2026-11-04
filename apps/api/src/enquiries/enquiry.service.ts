import { Injectable, Logger } from "@nestjs/common";
import {
  CatalogStatus,
  EnquiryStatus,
  ListingStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  PrismaClient,
} from "@medstock/database";
import type { CreateEnquiryRequest } from "@medstock/shared-types";
import {
  EnquiryForbiddenError,
  EnquiryNotFoundError,
  EnquiryTargetUnavailableError,
  InvalidEnquiryTransitionError,
  OrganizationIneligibleError,
  OrganizationNotRetailerError,
  SelfEnquiryError,
} from "../identity/domain-error.js";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

const enquiryInclude = {
  listing: {
    include: {
      organization: { select: { id: true, name: true, type: true, status: true } },
      medicinePack: {
        include: {
          medicine: { select: { displayName: true, status: true, searchVisible: true } },
        },
      },
    },
  },
  retailerOrganization: { select: { id: true, name: true, type: true, status: true } },
  distributorOrganization: { select: { id: true, name: true, type: true, status: true } },
} satisfies Prisma.ProcurementEnquiryInclude;

export type EnquiryRecord = Prisma.ProcurementEnquiryGetPayload<{ include: typeof enquiryInclude }>;

const retailerRoles = new Set<MembershipRole>([
  MembershipRole.RETAILER_OWNER,
  MembershipRole.RETAILER_STAFF,
]);

const distributorRoles = new Set<MembershipRole>([
  MembershipRole.DISTRIBUTOR_OWNER,
  MembershipRole.DISTRIBUTOR_STAFF,
]);

@Injectable()
export class EnquiryService {
  private readonly logger = new Logger(EnquiryService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async create(actorUserId: string, retailerOrganizationId: string, input: CreateEnquiryRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireRetailer(tx, actorUserId, retailerOrganizationId);
      const listing = await tx.distributorListing.findUnique({
        where: { id: input.listingId },
        include: enquiryInclude.listing.include,
      });
      if (!listing) {
        throw new EnquiryTargetUnavailableError();
      }
      if (listing.organizationId === retailerOrganizationId) {
        throw new SelfEnquiryError();
      }
      if (
        listing.status !== ListingStatus.ACTIVE ||
        listing.organization.type !== OrganizationType.DISTRIBUTOR ||
        listing.organization.status !== OrganizationStatus.ACTIVE ||
        listing.medicinePack.medicine.status !== CatalogStatus.PUBLISHED ||
        !listing.medicinePack.medicine.searchVisible
      ) {
        throw new EnquiryTargetUnavailableError();
      }
      const enquiry = await tx.procurementEnquiry.create({
        data: {
          retailerOrganizationId,
          distributorOrganizationId: listing.organizationId,
          listingId: listing.id,
          requestedQuantity: input.requestedPackQuantity,
          message: input.message ?? null,
          status: EnquiryStatus.OPEN,
          createdByUserId: actorUserId,
        },
      });
      await this.audit(tx, {
        actorUserId,
        retailerOrganizationId,
        distributorOrganizationId: listing.organizationId,
        enquiryId: enquiry.id,
        action: "enquiry.create",
      });
      return this.load(tx, enquiry.id);
    });
  }

  async listForRetailer(actorUserId: string, organizationId: string, page: number, pageSize: number) {
    await this.requireRetailer(this.prisma, actorUserId, organizationId);
    return this.page(this.prisma, { retailerOrganizationId: organizationId }, page, pageSize);
  }

  async getForRetailer(actorUserId: string, enquiryId: string) {
    const enquiry = await this.find(enquiryId);
    await this.requireRetailer(this.prisma, actorUserId, enquiry.retailerOrganizationId);
    return enquiry;
  }

  async close(actorUserId: string, enquiryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const enquiry = await this.findIn(tx, enquiryId);
      await this.requireRetailer(tx, actorUserId, enquiry.retailerOrganizationId);
      const updated = await tx.procurementEnquiry.updateMany({
        where: {
          id: enquiryId,
          status: { in: [EnquiryStatus.OPEN, EnquiryStatus.RESPONDED] },
        },
        data: { status: EnquiryStatus.CLOSED },
      });
      if (updated.count !== 1) {
        throw new InvalidEnquiryTransitionError();
      }
      await this.audit(tx, {
        actorUserId,
        retailerOrganizationId: enquiry.retailerOrganizationId,
        distributorOrganizationId: enquiry.distributorOrganizationId,
        enquiryId,
        action: "enquiry.close",
      });
      return this.load(tx, enquiryId);
    });
  }

  async listForDistributor(actorUserId: string, organizationId: string, page: number, pageSize: number) {
    await this.requireDistributor(this.prisma, actorUserId, organizationId);
    return this.page(this.prisma, { distributorOrganizationId: organizationId }, page, pageSize);
  }

  async getForDistributor(actorUserId: string, enquiryId: string) {
    const enquiry = await this.find(enquiryId);
    await this.requireDistributor(this.prisma, actorUserId, enquiry.distributorOrganizationId);
    return enquiry;
  }

  async respond(actorUserId: string, enquiryId: string, message: string) {
    return this.prisma.$transaction(async (tx) => {
      const enquiry = await this.findIn(tx, enquiryId);
      await this.requireDistributor(tx, actorUserId, enquiry.distributorOrganizationId);
      const updated = await tx.procurementEnquiry.updateMany({
        where: { id: enquiryId, status: EnquiryStatus.OPEN },
        data: {
          status: EnquiryStatus.RESPONDED,
          responseMessage: message,
          respondedByUserId: actorUserId,
          respondedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new InvalidEnquiryTransitionError();
      }
      await this.audit(tx, {
        actorUserId,
        retailerOrganizationId: enquiry.retailerOrganizationId,
        distributorOrganizationId: enquiry.distributorOrganizationId,
        enquiryId,
        action: "enquiry.respond",
      });
      return this.load(tx, enquiryId);
    });
  }

  async listForAdmin(actorUserId: string, page: number, pageSize: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.requirePlatformAdmin(tx, actorUserId);
      const pageResult = await this.page(tx, {}, page, pageSize);
      if (pageResult.items.length > 0) {
        await tx.procurementEnquiryAuditEvent.createMany({
          data: pageResult.items.map((enquiry) => ({
            actorUserId,
            retailerOrganizationId: enquiry.retailerOrganizationId,
            distributorOrganizationId: enquiry.distributorOrganizationId,
            enquiryId: enquiry.id,
            action: "enquiry.admin_read",
          })),
        });
      }
      this.logger.log(`platform_admin.enquiries.read actor=${actorUserId} count=${pageResult.items.length}`);
      return pageResult;
    });
  }

  private async page(
    db: Db,
    where: Prisma.ProcurementEnquiryWhereInput,
    page: number,
    pageSize: number,
  ) {
    const items = await db.procurementEnquiry.findMany({
      where,
      include: enquiryInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await db.procurementEnquiry.count({ where });
    return { items, page, pageSize, total };
  }

  private async requireRetailer(db: Db, actorUserId: string, organizationId: string) {
    const membership = await db.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: actorUserId, organizationId } },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !retailerRoles.has(membership.role)
    ) {
      throw new EnquiryForbiddenError();
    }
    if (membership.organization.type !== OrganizationType.RETAILER) {
      throw new OrganizationNotRetailerError();
    }
    if (membership.organization.status !== OrganizationStatus.ACTIVE) {
      throw new OrganizationIneligibleError();
    }
  }

  private async requireDistributor(db: Db, actorUserId: string, organizationId: string) {
    const membership = await db.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: actorUserId, organizationId } },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.organization.type !== OrganizationType.DISTRIBUTOR ||
      !distributorRoles.has(membership.role)
    ) {
      throw new EnquiryForbiddenError();
    }
    if (membership.organization.status !== OrganizationStatus.ACTIVE) {
      throw new OrganizationIneligibleError();
    }
  }

  private async requirePlatformAdmin(db: Db, actorUserId: string) {
    const admin = await db.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
    if (!admin) {
      throw new EnquiryForbiddenError();
    }
  }

  private async find(enquiryId: string) {
    return this.findIn(this.prisma, enquiryId);
  }

  private async findIn(db: Db, enquiryId: string) {
    const enquiry = await db.procurementEnquiry.findUnique({
      where: { id: enquiryId },
      include: enquiryInclude,
    });
    if (!enquiry) {
      throw new EnquiryNotFoundError();
    }
    return enquiry;
  }

  private async load(db: Db, enquiryId: string) {
    return this.findIn(db, enquiryId);
  }

  private async audit(
    tx: Tx,
    input: {
      actorUserId: string;
      retailerOrganizationId: string;
      distributorOrganizationId: string;
      enquiryId: string;
      action: string;
    },
  ) {
    await tx.procurementEnquiryAuditEvent.create({ data: input });
  }
}
