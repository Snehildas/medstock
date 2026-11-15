import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  medicineSubmissionPageSchema,
  medicineSubmissionSchema,
  rejectMedicineSubmissionSchema,
  type MedicineSubmissionPage,
  type MedicineSubmissionResponse,
  type RejectMedicineSubmissionRequest,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { SubmissionService } from "./submission.service.js";

const idPipe = new ZodValidationPipe(z.uuid());
const pageQueryPipe = new ZodValidationPipe(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
);

@Controller("admin/medicine-submissions")
@UseGuards(IdentityGuard)
export class SubmissionAdminController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly submissions: SubmissionService,
  ) {}

  @Get()
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(pageQueryPipe) query: { page: number; pageSize: number },
  ): Promise<MedicineSubmissionPage> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionPageSchema.parse(
      await this.submissions.listForAdmin(actor.id, query.page, query.pageSize),
    );
  }

  @Get(":submissionId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("submissionId", idPipe) submissionId: string,
  ): Promise<MedicineSubmissionResponse> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionSchema.parse(await this.submissions.getForAdmin(actor.id, submissionId));
  }

  @Post(":submissionId/approve")
  async approve(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("submissionId", idPipe) submissionId: string,
  ): Promise<MedicineSubmissionResponse> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionSchema.parse(await this.submissions.approve(actor.id, submissionId));
  }

  @Post(":submissionId/reject")
  async reject(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("submissionId", idPipe) submissionId: string,
    @Body(new ZodValidationPipe(rejectMedicineSubmissionSchema)) body: RejectMedicineSubmissionRequest,
  ): Promise<MedicineSubmissionResponse> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionSchema.parse(await this.submissions.reject(actor.id, submissionId, body.reason));
  }
}
