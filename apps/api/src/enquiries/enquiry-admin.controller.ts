import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  adminEnquiryPageSchema,
  enquiryPageQuerySchema,
  type AdminEnquiryPage,
} from "@medstock/shared-types";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { toAdminPage } from "./enquiry-response.js";
import { EnquiryService } from "./enquiry.service.js";

const pageQueryPipe = new ZodValidationPipe(enquiryPageQuerySchema);

@Controller("admin/enquiries")
@UseGuards(IdentityGuard)
export class EnquiryAdminController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly enquiries: EnquiryService,
  ) {}

  @Get()
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(pageQueryPipe) query: { page: number; pageSize: number },
  ): Promise<AdminEnquiryPage> {
    const actor = await this.identityService.provision(identity);
    const page = await this.enquiries.listForAdmin(actor.id, query.page, query.pageSize);
    return adminEnquiryPageSchema.parse(toAdminPage(page));
  }
}
