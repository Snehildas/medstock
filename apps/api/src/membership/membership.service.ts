import { Injectable, Logger } from "@nestjs/common";
import {
  assertMembershipRole,
  MembershipRole,
  MembershipRoleError,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PrismaClient,
  UserStatus,
  type PrismaClient as MedstockPrisma,
} from "@medstock/database";
import {
  DuplicateMembershipError,
  InvalidMembershipRoleError,
  MembershipNotFoundError,
  InvalidMembershipTransitionError,
  OrganizationIneligibleError,
  OrganizationNotFoundError,
  UnauthorizedOrganizationError,
  UserIneligibleError,
  UserNotFoundError,
} from "../identity/domain-error.js";
import { prismaErrorCode } from "../identity/prisma-error.js";

type MembershipRecord = Awaited<ReturnType<MedstockPrisma["organizationMembership"]["create"]>>;
type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const ownerRoles = new Set<MembershipRole>([
  MembershipRole.RETAILER_OWNER,
  MembershipRole.DISTRIBUTOR_OWNER,
]);

const allowedTransitions: Record<MembershipStatus, readonly MembershipStatus[]> = {
  INVITED: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED],
  ACTIVE: [MembershipStatus.SUSPENDED],
  SUSPENDED: [MembershipStatus.ACTIVE],
};

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async createMembership(input: {
    actorUserId: string;
    organizationId: string;
    userId: string;
    role: MembershipRole;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
      });
      if (!organization) {
        throw new OrganizationNotFoundError();
      }
      if (organization.status === OrganizationStatus.SUSPENDED) {
        throw new OrganizationIneligibleError();
      }

      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user) {
        throw new UserNotFoundError();
      }
      if (user.status === UserStatus.DISABLED) {
        throw new UserIneligibleError();
      }

      try {
        assertMembershipRole(organization.type, input.role);
      } catch (error) {
        if (error instanceof MembershipRoleError) {
          throw new InvalidMembershipRoleError(error.message);
        }
        throw error;
      }

      await this.assertCanManage(tx, input.actorUserId, organization.id, organization.type, input.role);

      try {
        const membership = await tx.organizationMembership.create({
          data: {
            userId: input.userId,
            organizationId: organization.id,
            role: input.role,
            status: MembershipStatus.INVITED,
          },
        });
        return { ...membership, user };
      } catch (error) {
        if (prismaErrorCode(error) === "P2002") {
          throw new DuplicateMembershipError();
        }
        throw error;
      }
    });
  }

  async listForOrganization(actorUserId: string, organizationId: string) {
    await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        throw new OrganizationNotFoundError();
      }
      const member = await this.findActiveMembership(tx, actorUserId, organizationId);
      if (member) {
        return;
      }
      const platformAdmin = await this.findActivePlatformAdmin(tx, actorUserId);
      if (!platformAdmin) {
        throw new UnauthorizedOrganizationError();
      }
      this.logger.log(
        `platform_admin.memberships.read actor=${actorUserId} organization=${organizationId}`,
      );
    });

    return this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async transitionStatus(input: {
    actorUserId: string;
    membershipId: string;
    nextStatus: MembershipStatus;
  }): Promise<MembershipRecord> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findUnique({
        where: { id: input.membershipId },
        include: { organization: true },
      });
      if (!membership) {
        throw new MembershipNotFoundError();
      }
      const allowed = allowedTransitions[membership.status];
      if (!allowed.includes(input.nextStatus)) {
        throw new InvalidMembershipTransitionError();
      }
      await this.assertCanManage(
        tx,
        input.actorUserId,
        membership.organizationId,
        membership.organization.type,
        membership.role,
      );
      return tx.organizationMembership.update({
        where: { id: membership.id },
        data: { status: input.nextStatus },
      });
    });
  }

  private async assertCanManage(
    tx: Transaction,
    actorUserId: string,
    organizationId: string,
    organizationType: OrganizationType,
    role: MembershipRole,
  ): Promise<void> {
    if (role === MembershipRole.PLATFORM_ADMIN) {
      const platformAdmin = await this.findActivePlatformAdmin(tx, actorUserId);
      if (!platformAdmin || organizationType !== OrganizationType.PLATFORM) {
        throw new UnauthorizedOrganizationError();
      }
      this.logger.log(
        `platform_admin.memberships.write actor=${actorUserId} organization=${organizationId}`,
      );
      return;
    }

    const actorMembership = await this.findActiveMembership(tx, actorUserId, organizationId);
    if (!actorMembership || !ownerRoles.has(actorMembership.role)) {
      throw new UnauthorizedOrganizationError();
    }
  }

  private async findActiveMembership(
    tx: Transaction,
    userId: string,
    organizationId: string,
  ): Promise<MembershipRecord | null> {
    const membership = await tx.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    return membership?.status === MembershipStatus.ACTIVE ? membership : null;
  }

  private async findActivePlatformAdmin(
    tx: Transaction,
    userId: string,
  ): Promise<MembershipRecord | null> {
    return tx.organizationMembership.findFirst({
      where: {
        userId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
  }
}
