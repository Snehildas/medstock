import { Injectable, Logger } from "@nestjs/common";
import {
  CatalogStatus,
  ListingCurrency,
  ListingSource,
  ListingStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  PrismaClient,
  StockStatus,
} from "@medstock/database";
import type {
  CreateListingRequest,
  ListingSearchQuery,
  UpdateListingRequest,
} from "@medstock/shared-types";
import {
  DuplicateListingError,
  InvalidListingTransitionError,
  ListingForbiddenError,
  ListingNotFoundError,
  OrganizationIneligibleError,
  OrganizationNotDistributorError,
  PackNotFoundError,
} from "../identity/domain-error.js";
import { prismaErrorCode } from "../identity/prisma-error.js";
import { classifyFreshness, type ListingFreshness } from "./freshness.js";

type Tx = Prisma.TransactionClient;

const listingInclude = {
  organization: { select: { id: true, name: true, type: true, status: true } },
  medicinePack: {
    include: {
      medicine: {
        select: {
          id: true,
          displayName: true,
          brandName: true,
          genericName: true,
          dosageForm: true,
          status: true,
          searchVisible: true,
        },
      },
    },
  },
} satisfies Prisma.DistributorListingInclude;

export type ListingRecord = Prisma.DistributorListingGetPayload<{ include: typeof listingInclude }>;

const managerRoles = new Set<MembershipRole>([
  MembershipRole.DISTRIBUTOR_OWNER,
  MembershipRole.DISTRIBUTOR_STAFF,
]);

const retailerRoles = new Set<MembershipRole>([
  MembershipRole.RETAILER_OWNER,
  MembershipRole.RETAILER_STAFF,
]);

@Injectable()
export class ListingService {
  private readonly logger = new Logger(ListingService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async create(
    actorUserId: string,
    organizationId: string,
    input: CreateListingRequest,
  ): Promise<ListingRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireManager(tx, actorUserId, organizationId);
      const pack = await tx.medicinePack.findUnique({ where: { id: input.medicinePackId } });
      if (!pack) {
        throw new PackNotFoundError();
      }
      const now = new Date();
      try {
        const listing = await tx.distributorListing.create({
          data: {
            organizationId,
            medicinePackId: input.medicinePackId,
            status: ListingStatus.ACTIVE,
            unitPrice: input.unitPrice,
            currency: ListingCurrency.INR,
            minimumOrderQuantity: input.minimumOrderQuantity,
            stockStatus: input.stockStatus as StockStatus,
            availableQuantity: input.availableQuantity ?? null,
            priceUpdatedAt: now,
            stockUpdatedAt: now,
            source: ListingSource.MANUAL,
            sourceNote: input.sourceNote ?? null,
          },
        });
        await this.audit(tx, actorUserId, organizationId, listing.id, "listing.create");
        return this.load(tx, listing.id);
      } catch (error) {
        if (prismaErrorCode(error) === "P2002") {
          throw new DuplicateListingError();
        }
        throw error;
      }
    });
  }

  async update(
    actorUserId: string,
    listingId: string,
    input: UpdateListingRequest,
  ): Promise<ListingRecord> {
    return this.prisma.$transaction(async (tx) => {
      const listing = await this.load(tx, listingId);
      await this.requireManager(tx, actorUserId, listing.organizationId);
      this.assertEditable(listing.status);
      const now = new Date();
      const data: Prisma.DistributorListingUpdateInput = {};
      const priceChanged =
        input.unitPrice !== undefined && !sameDecimal(listing.unitPrice, input.unitPrice);
      const stockStatusChanged =
        input.stockStatus !== undefined && input.stockStatus !== listing.stockStatus;
      const quantityChanged =
        input.availableQuantity !== undefined &&
        !sameDecimal(listing.availableQuantity, input.availableQuantity);
      if (priceChanged && input.unitPrice !== undefined) {
        data.unitPrice = input.unitPrice;
        data.priceUpdatedAt = now;
      }
      if (input.minimumOrderQuantity !== undefined) {
        data.minimumOrderQuantity = input.minimumOrderQuantity;
      }
      if (stockStatusChanged) {
        data.stockStatus = input.stockStatus as StockStatus;
      }
      if (quantityChanged && input.availableQuantity !== undefined) {
        data.availableQuantity = input.availableQuantity;
      }
      if (stockStatusChanged || quantityChanged) {
        data.stockUpdatedAt = now;
      }
      if (input.sourceNote !== undefined) {
        data.sourceNote = input.sourceNote;
      }
      if (Object.keys(data).length === 0) {
        return listing;
      }
      await tx.distributorListing.update({ where: { id: listingId }, data });
      if (priceChanged) {
        await this.audit(tx, actorUserId, listing.organizationId, listingId, "listing.price_update");
      }
      if (stockStatusChanged || quantityChanged) {
        await this.audit(tx, actorUserId, listing.organizationId, listingId, "listing.stock_update");
      }
      if (!priceChanged && !stockStatusChanged && !quantityChanged) {
        await this.audit(tx, actorUserId, listing.organizationId, listingId, "listing.update");
      }
      return this.load(tx, listingId);
    });
  }

  async pause(actorUserId: string, listingId: string): Promise<ListingRecord> {
    return this.transition(actorUserId, listingId, ListingStatus.ACTIVE, ListingStatus.PAUSED, "listing.pause");
  }

  async resume(actorUserId: string, listingId: string): Promise<ListingRecord> {
    return this.transition(actorUserId, listingId, ListingStatus.PAUSED, ListingStatus.ACTIVE, "listing.resume");
  }

  async archive(actorUserId: string, listingId: string): Promise<ListingRecord> {
    return this.prisma.$transaction(async (tx) => {
      const listing = await this.load(tx, listingId);
      await this.requireManager(tx, actorUserId, listing.organizationId);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.PAUSED) {
        throw new InvalidListingTransitionError();
      }
      await tx.distributorListing.update({
        where: { id: listingId },
        data: { status: ListingStatus.ARCHIVED },
      });
      await this.audit(tx, actorUserId, listing.organizationId, listingId, "listing.archive");
      return this.load(tx, listingId);
    });
  }

  async suspend(actorUserId: string, listingId: string): Promise<ListingRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.requirePlatformAdmin(tx, actorUserId);
      const listing = await this.load(tx, listingId);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.PAUSED) {
        throw new InvalidListingTransitionError();
      }
      await tx.distributorListing.update({
        where: { id: listingId },
        data: { status: ListingStatus.SUSPENDED },
      });
      await this.audit(tx, actorUserId, listing.organizationId, listingId, "listing.suspend");
      this.logger.log(
        `platform_admin.listings.suspend actor=${actorUserId} organization=${listing.organizationId} listing=${listingId}`,
      );
      return this.load(tx, listingId);
    });
  }

  async getForDistributor(actorUserId: string, listingId: string): Promise<ListingRecord> {
    const listing = await this.prisma.distributorListing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing) {
      throw new ListingNotFoundError();
    }
    const admin = await this.findPlatformAdmin(this.prisma, actorUserId);
    if (admin) {
      this.logger.log(
        `platform_admin.listings.read actor=${actorUserId} organization=${listing.organizationId} listing=${listingId}`,
      );
      return listing;
    }
    await this.requireManager(this.prisma, actorUserId, listing.organizationId);
    return listing;
  }

  async listForDistributor(
    actorUserId: string,
    organizationId: string,
    page: number,
    pageSize: number,
    filters: {
      q?: string;
      status?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "SUSPENDED";
      stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
    } = {},
  ) {
    await this.requireManager(this.prisma, actorUserId, organizationId);
    const where: Prisma.DistributorListingWhereInput = { organizationId };
    if (filters.status) {
      where.status = filters.status as ListingStatus;
    }
    if (filters.stockStatus) {
      where.stockStatus = filters.stockStatus as StockStatus;
    }
    const text = filters.q?.trim() ?? "";
    if (text.length > 0) {
      where.OR = [
        { medicinePack: { description: { contains: text, mode: "insensitive" } } },
        { medicinePack: { medicine: { displayName: { contains: text, mode: "insensitive" } } } },
        { medicinePack: { medicine: { genericName: { contains: text, mode: "insensitive" } } } },
      ];
    }
    const items = await this.prisma.distributorListing.findMany({
      where,
      include: listingInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.distributorListing.count({ where });
    return { items, page, pageSize, total };
  }

  async listForAdmin(actorUserId: string, page: number, pageSize: number) {
    await this.requirePlatformAdmin(this.prisma, actorUserId);
    this.logger.log(`platform_admin.listings.read actor=${actorUserId}`);
    const items = await this.prisma.distributorListing.findMany({
      include: listingInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.distributorListing.count();
    return { items, page, pageSize, total };
  }

  async getForRetailer(actorUserId: string, listingId: string): Promise<ListingRecord> {
    await this.requireReader(actorUserId);
    const listing = await this.prisma.distributorListing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing || !isDiscoverable(listing)) {
      throw new ListingNotFoundError();
    }
    return listing;
  }

  async searchForRetailer(actorUserId: string, query: ListingSearchQuery) {
    await this.requireReader(actorUserId);
    const where: Prisma.DistributorListingWhereInput = {
      status: ListingStatus.ACTIVE,
      organization: { type: OrganizationType.DISTRIBUTOR, status: OrganizationStatus.ACTIVE },
      medicinePack: {
        ...(query.medicinePackId ? { id: query.medicinePackId } : {}),
        medicine: {
          status: CatalogStatus.PUBLISHED,
          searchVisible: true,
          ...(query.medicineId ? { id: query.medicineId } : {}),
          ...(query.q.trim().length > 0
            ? { searchText: { contains: query.q.trim().toLowerCase() } }
            : {}),
        },
      },
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.stockStatus ? { stockStatus: query.stockStatus as StockStatus } : {}),
      ...(query.minPrice || query.maxPrice
        ? {
            unitPrice: {
              ...(query.minPrice ? { gte: query.minPrice } : {}),
              ...(query.maxPrice ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };
    const items = await this.prisma.distributorListing.findMany({
      where,
      include: listingInclude,
      orderBy: [
        { medicinePack: { medicine: { displayName: "asc" } } },
        { unitPrice: "asc" },
        { id: "asc" },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await this.prisma.distributorListing.count({ where });
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  private async transition(
    actorUserId: string,
    listingId: string,
    from: ListingStatus,
    to: ListingStatus,
    action: string,
  ): Promise<ListingRecord> {
    return this.prisma.$transaction(async (tx) => {
      const listing = await this.load(tx, listingId);
      await this.requireManager(tx, actorUserId, listing.organizationId);
      if (listing.status !== from) {
        throw new InvalidListingTransitionError();
      }
      await tx.distributorListing.update({ where: { id: listingId }, data: { status: to } });
      await this.audit(tx, actorUserId, listing.organizationId, listingId, action);
      return this.load(tx, listingId);
    });
  }

  private async requireManager(tx: Tx | PrismaClient, actorUserId: string, organizationId: string) {
    const membership = await tx.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: actorUserId, organizationId } },
      include: { organization: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ListingForbiddenError();
    }
    if (membership.organization.type !== OrganizationType.DISTRIBUTOR) {
      throw new OrganizationNotDistributorError();
    }
    if (!managerRoles.has(membership.role)) {
      throw new ListingForbiddenError();
    }
    if (membership.organization.status === OrganizationStatus.SUSPENDED) {
      throw new OrganizationIneligibleError();
    }
    return membership;
  }

  private async requirePlatformAdmin(tx: Tx | PrismaClient, actorUserId: string): Promise<void> {
    const admin = await this.findPlatformAdmin(tx, actorUserId);
    if (!admin) {
      throw new ListingForbiddenError();
    }
  }

  private async requireReader(actorUserId: string): Promise<void> {
    const retailer = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        status: MembershipStatus.ACTIVE,
        role: { in: [...retailerRoles] },
        organization: { type: OrganizationType.RETAILER, status: OrganizationStatus.ACTIVE },
      },
    });
    const admin = await this.findPlatformAdmin(this.prisma, actorUserId);
    if (!retailer && !admin) {
      throw new ListingForbiddenError();
    }
  }

  private findPlatformAdmin(tx: Tx | PrismaClient, actorUserId: string) {
    return tx.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
  }

  private assertEditable(status: ListingStatus): void {
    if (status === ListingStatus.ARCHIVED || status === ListingStatus.SUSPENDED) {
      throw new InvalidListingTransitionError();
    }
  }

  private async load(tx: Tx | PrismaClient, listingId: string): Promise<ListingRecord> {
    const listing = await tx.distributorListing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing) {
      throw new ListingNotFoundError();
    }
    return listing;
  }

  private async audit(
    tx: Tx,
    actorUserId: string,
    organizationId: string,
    listingId: string,
    action: string,
  ): Promise<void> {
    await tx.listingAuditEvent.create({
      data: { actorUserId, organizationId, listingId, action },
    });
  }
}

export function isDiscoverable(listing: ListingRecord): boolean {
  return (
    listing.status === ListingStatus.ACTIVE &&
    listing.organization.type === OrganizationType.DISTRIBUTOR &&
    listing.organization.status === OrganizationStatus.ACTIVE &&
    listing.medicinePack.medicine.status === CatalogStatus.PUBLISHED &&
    listing.medicinePack.medicine.searchVisible
  );
}

export function freshnessFor(listing: ListingRecord, now = new Date()): {
  priceFreshness: ListingFreshness;
  stockFreshness: ListingFreshness;
} {
  return {
    priceFreshness: classifyFreshness(listing.priceUpdatedAt, now),
    stockFreshness: classifyFreshness(listing.stockUpdatedAt, now),
  };
}

function sameDecimal(
  current: { toString(): string } | null,
  next: string | null,
): boolean {
  if (current == null || next == null) {
    return current == null && next == null;
  }
  return Number(current.toString()) === Number(next);
}
