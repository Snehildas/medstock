import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { MembershipRole } from "@medstock/database";
import {
  createMembershipRequestSchema,
  membershipResponseSchema,
  type CreateMembershipRequest,
  type MembershipResponse,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { MembershipService } from "./membership.service.js";

const organizationIdPipe = new ZodValidationPipe(z.uuid());

type MembershipWithUser = Awaited<ReturnType<MembershipService["listForOrganization"]>>[number];

function toMembershipResponse(membership: MembershipWithUser): MembershipResponse {
  return membershipResponseSchema.parse({
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.status,
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      status: membership.user.status,
    },
  });
}

@Controller("organizations/:organizationId/memberships")
@UseGuards(IdentityGuard)
export class MembershipController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly membershipService: MembershipService,
  ) {}

  @Get()
  async list(
    @Param("organizationId", organizationIdPipe) organizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<MembershipResponse[]> {
    const actor = await this.identityService.provision(identity);
    const memberships = await this.membershipService.listForOrganization(actor.id, organizationId);
    return memberships.map((membership) => toMembershipResponse(membership));
  }

  @Post()
  async create(
    @Param("organizationId", organizationIdPipe) organizationId: string,
    @Body(new ZodValidationPipe(createMembershipRequestSchema))
    body: CreateMembershipRequest,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<MembershipResponse> {
    const actor = await this.identityService.provision(identity);
    const membership = await this.membershipService.createMembership({
      actorUserId: actor.id,
      organizationId,
      userId: body.userId,
      role: body.role as MembershipRole,
    });
    return toMembershipResponse(membership);
  }
}
