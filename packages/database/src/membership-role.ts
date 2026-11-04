import { MembershipRole, OrganizationType } from "./generated/prisma/client.js";

const rolesForOrganizationType: Record<OrganizationType, readonly MembershipRole[]> = {
  PLATFORM: [MembershipRole.PLATFORM_ADMIN],
  RETAILER: [MembershipRole.RETAILER_OWNER, MembershipRole.RETAILER_STAFF],
  DISTRIBUTOR: [MembershipRole.DISTRIBUTOR_OWNER, MembershipRole.DISTRIBUTOR_STAFF],
};

export class MembershipRoleError extends Error {
  constructor(organizationType: OrganizationType, role: MembershipRole) {
    super(`Role ${role} is not valid for a ${organizationType} organization.`);
    this.name = "MembershipRoleError";
  }
}

export function assertMembershipRole(
  organizationType: OrganizationType,
  role: MembershipRole,
): void {
  const allowed = rolesForOrganizationType[organizationType];
  if (!allowed.includes(role)) {
    throw new MembershipRoleError(organizationType, role);
  }
}
