import { Controller, Get, UseGuards } from "@nestjs/common";
import { currentUserResponseSchema, type CurrentUserResponse } from "@medstock/shared-types";
import { MembershipService } from "../membership/membership.service.js";
import { CurrentIdentity } from "./current-identity.decorator.js";
import { IdentityGuard } from "./identity.guard.js";
import { IdentityService } from "./identity.service.js";
import type { VerifiedIdentity } from "./identity-verifier.js";

@Controller("identity")
@UseGuards(IdentityGuard)
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly membershipService: MembershipService,
  ) {}

  @Get("me")
  async me(@CurrentIdentity() identity: VerifiedIdentity): Promise<CurrentUserResponse> {
    const user = await this.identityService.provision(identity);
    const memberships = await this.membershipService.listForUser(user.id);
    return currentUserResponseSchema.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      memberships: memberships.map((membership) => ({
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
        },
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          type: membership.organization.type,
          status: membership.organization.status,
        },
      })),
    });
  }
}
