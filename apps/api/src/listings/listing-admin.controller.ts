import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  distributorListingPageSchema,
  distributorListingSchema,
  distributorProfileSchema,
  type DistributorListingPage,
  type DistributorListingResponse,
  type DistributorProfile,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { toDistributorListing, toDistributorPage } from "./listing-response.js";
import { ListingService } from "./listing.service.js";

const listingIdPipe = new ZodValidationPipe(z.uuid());
const pageQueryPipe = new ZodValidationPipe(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
);

@Controller("admin/listings")
@UseGuards(IdentityGuard)
export class ListingAdminController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly listings: ListingService,
  ) {}

  @Get()
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(pageQueryPipe) query: { page: number; pageSize: number },
  ): Promise<DistributorListingPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.listings.listForAdmin(actor.id, query.page, query.pageSize);
    return distributorListingPageSchema.parse(toDistributorPage(page));
  }

  @Post(":listingId/suspend")
  async suspend(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    const listing = await this.listings.suspend(actor.id, listingId);
    return distributorListingSchema.parse(toDistributorListing(listing));
  }
}

@Controller("admin/distributor-profiles")
@UseGuards(IdentityGuard)
export class DistributorProfileAdminController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly listings: ListingService,
  ) {}

  @Get(":organizationId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("organizationId", listingIdPipe) organizationId: string,
  ): Promise<DistributorProfile> {
    const actor = await this.identityService.provision(identity);
    return distributorProfileSchema.parse(await this.listings.getProfile(actor.id, organizationId));
  }
}
