import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createListingRequestSchema,
  distributorListingPageSchema,
  distributorListingQuerySchema,
  distributorListingSchema,
  listingSearchQuerySchema,
  retailerListingPageSchema,
  retailerListingSchema,
  updateListingRequestSchema,
  type CreateListingRequest,
  type DistributorListingPage,
  type DistributorListingQuery,
  type DistributorListingResponse,
  type ListingSearchQuery,
  type RetailerListing,
  type RetailerListingPage,
  type UpdateListingRequest,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import {
  toDistributorListing,
  toDistributorPage,
  toRetailerListing,
  toRetailerPage,
} from "./listing-response.js";
import { ListingService } from "./listing.service.js";

const listingIdPipe = new ZodValidationPipe(z.uuid());
const distributorQueryPipe = new ZodValidationPipe(distributorListingQuerySchema);
const searchQueryPipe = new ZodValidationPipe(listingSearchQuerySchema);
const organizationQueryPipe = new ZodValidationPipe(z.object({ organizationId: z.uuid() }));

@Controller()
@UseGuards(IdentityGuard)
export class ListingController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly listings: ListingService,
  ) {}

  @Post("distributor/listings")
  async create(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: { organizationId: string },
    @Body(new ZodValidationPipe(createListingRequestSchema)) body: CreateListingRequest,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    const listing = await this.listings.create(actor.id, query.organizationId, body);
    return distributorListingSchema.parse(toDistributorListing(listing));
  }

  @Get("distributor/listings")
  async listOwn(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(distributorQueryPipe) query: DistributorListingQuery,
  ): Promise<DistributorListingPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.listings.listForDistributor(
      actor.id,
      query.organizationId,
      query.page,
      query.pageSize,
      {
        q: query.q,
        ...(query.status ? { status: query.status } : {}),
        ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
      },
    );
    return distributorListingPageSchema.parse(toDistributorPage(page));
  }

  @Get("distributor/listings/:listingId")
  async getOwn(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    const listing = await this.listings.getForDistributor(actor.id, listingId);
    return distributorListingSchema.parse(toDistributorListing(listing));
  }

  @Patch("distributor/listings/:listingId")
  async update(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
    @Body(new ZodValidationPipe(updateListingRequestSchema)) body: UpdateListingRequest,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    const listing = await this.listings.update(actor.id, listingId, body);
    return distributorListingSchema.parse(toDistributorListing(listing));
  }

  @Post("distributor/listings/:listingId/pause")
  async pause(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    return distributorListingSchema.parse(toDistributorListing(await this.listings.pause(actor.id, listingId)));
  }

  @Post("distributor/listings/:listingId/resume")
  async resume(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    return distributorListingSchema.parse(
      toDistributorListing(await this.listings.resume(actor.id, listingId)),
    );
  }

  @Post("distributor/listings/:listingId/archive")
  async archive(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<DistributorListingResponse> {
    const actor = await this.identityService.provision(identity);
    return distributorListingSchema.parse(
      toDistributorListing(await this.listings.archive(actor.id, listingId)),
    );
  }

  @Get("listings")
  async search(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(searchQueryPipe) query: ListingSearchQuery,
  ): Promise<RetailerListingPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.listings.searchForRetailer(actor.id, query);
    return retailerListingPageSchema.parse(toRetailerPage(page));
  }

  @Get("listings/:listingId")
  async getPublic(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("listingId", listingIdPipe) listingId: string,
  ): Promise<RetailerListing> {
    const actor = await this.identityService.provision(identity);
    const listing = await this.listings.getForRetailer(actor.id, listingId);
    return retailerListingSchema.parse(toRetailerListing(listing));
  }
}
