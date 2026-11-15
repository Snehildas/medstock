export type OrganizationChoice = {
  organizationId: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  role: string;
  organization: {
    id: string;
    name: string;
    type: "PLATFORM" | "RETAILER" | "DISTRIBUTOR";
    status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  };
};

export type OrganizationResolution =
  | { kind: "selected"; membership: OrganizationChoice }
  | { kind: "choose"; memberships: OrganizationChoice[] }
  | { kind: "empty"; inactiveCount: number };

export function activeMemberships(memberships: OrganizationChoice[]): OrganizationChoice[] {
  return memberships.filter((membership) => membership.status === "ACTIVE");
}

export function resolveOrganization(
  memberships: OrganizationChoice[],
  selectedId: string | undefined,
): OrganizationResolution {
  const active = activeMemberships(memberships);
  const inactiveCount = memberships.length - active.length;
  if (active.length === 0) {
    return { kind: "empty", inactiveCount };
  }
  const selected = active.find((membership) => membership.organizationId === selectedId);
  if (selected) {
    return { kind: "selected", membership: selected };
  }
  if (active.length === 1) {
    const only = active[0];
    if (only) {
      return { kind: "selected", membership: only };
    }
  }
  return { kind: "choose", memberships: active };
}

export function membershipForSelection(
  memberships: OrganizationChoice[],
  organizationId: string,
): OrganizationChoice | null {
  return activeMemberships(memberships).find((membership) => membership.organizationId === organizationId) ?? null;
}

export function workspaceLanding(organizationType: string | undefined): "/app" | "/app/discover" {
  if (organizationType === "RETAILER" || organizationType === "DISTRIBUTOR") {
    return "/app/discover";
  }
  return "/app";
}
