import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  createEnquiryRequestSchema,
  enquiryOrganizationQuerySchema,
  enquiryPageSchema,
  enquiryResponseSchema,
  respondEnquiryRequestSchema,
  type CreateEnquiryRequest,
  type EnquiryOrganizationQuery,
  type EnquiryPage,
  type EnquiryResponse,
  type RespondEnquiryRequest,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import {
  toDistributorEnquiry,
  toEnquiryPage,
  toRetailerEnquiry,
} from "./enquiry-response.js";
import { EnquiryService } from "./enquiry.service.js";

const enquiryIdPipe = new ZodValidationPipe(z.uuid());
const organizationQueryPipe = new ZodValidationPipe(enquiryOrganizationQuerySchema);

@Controller()
@UseGuards(IdentityGuard)
export class EnquiryController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly enquiries: EnquiryService,
  ) {}

  @Post("retailer/enquiries")
  async create(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: EnquiryOrganizationQuery,
    @Body(new ZodValidationPipe(createEnquiryRequestSchema)) body: CreateEnquiryRequest,
  ): Promise<EnquiryResponse> {
    const actor = await this.identityService.provision(identity);
    const enquiry = await this.enquiries.create(actor.id, query.organizationId, body);
    return enquiryResponseSchema.parse(toRetailerEnquiry(enquiry));
  }

  @Get("retailer/enquiries")
  async listRetailer(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: EnquiryOrganizationQuery,
  ): Promise<EnquiryPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.enquiries.listForRetailer(
      actor.id,
      query.organizationId,
      query.page,
      query.pageSize,
    );
    return enquiryPageSchema.parse(toEnquiryPage(page, toRetailerEnquiry));
  }

  @Get("retailer/enquiries/:enquiryId")
  async getRetailer(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("enquiryId", enquiryIdPipe) enquiryId: string,
  ): Promise<EnquiryResponse> {
    const actor = await this.identityService.provision(identity);
    const enquiry = await this.enquiries.getForRetailer(actor.id, enquiryId);
    return enquiryResponseSchema.parse(toRetailerEnquiry(enquiry));
  }

  @Post("retailer/enquiries/:enquiryId/close")
  async close(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("enquiryId", enquiryIdPipe) enquiryId: string,
  ): Promise<EnquiryResponse> {
    const actor = await this.identityService.provision(identity);
    const enquiry = await this.enquiries.close(actor.id, enquiryId);
    return enquiryResponseSchema.parse(toRetailerEnquiry(enquiry));
  }

  @Get("distributor/enquiries")
  async listDistributor(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: EnquiryOrganizationQuery,
  ): Promise<EnquiryPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.enquiries.listForDistributor(
      actor.id,
      query.organizationId,
      query.page,
      query.pageSize,
    );
    return enquiryPageSchema.parse(toEnquiryPage(page, toDistributorEnquiry));
  }

  @Get("distributor/enquiries/:enquiryId")
  async getDistributor(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("enquiryId", enquiryIdPipe) enquiryId: string,
  ): Promise<EnquiryResponse> {
    const actor = await this.identityService.provision(identity);
    const enquiry = await this.enquiries.getForDistributor(actor.id, enquiryId);
    return enquiryResponseSchema.parse(toDistributorEnquiry(enquiry));
  }

  @Post("distributor/enquiries/:enquiryId/respond")
  async respond(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("enquiryId", enquiryIdPipe) enquiryId: string,
    @Body(new ZodValidationPipe(respondEnquiryRequestSchema)) body: RespondEnquiryRequest,
  ): Promise<EnquiryResponse> {
    const actor = await this.identityService.provision(identity);
    const enquiry = await this.enquiries.respond(actor.id, enquiryId, body.message);
    return enquiryResponseSchema.parse(toDistributorEnquiry(enquiry));
  }
}
