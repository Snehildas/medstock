import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  createMedicineSubmissionSchema,
  medicineSubmissionPageSchema,
  medicineSubmissionSchema,
  type CreateMedicineSubmissionRequest,
  type MedicineSubmissionPage,
  type MedicineSubmissionResponse,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { SubmissionService } from "./submission.service.js";

const organizationQueryPipe = new ZodValidationPipe(z.object({ organizationId: z.uuid() }));
const pageQueryPipe = new ZodValidationPipe(
  z.object({
    organizationId: z.uuid(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
);
const idPipe = new ZodValidationPipe(z.uuid());

@Controller("distributor/medicine-submissions")
@UseGuards(IdentityGuard)
export class SubmissionController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly submissions: SubmissionService,
  ) {}

  @Post()
  async create(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: { organizationId: string },
    @Body(new ZodValidationPipe(createMedicineSubmissionSchema)) body: CreateMedicineSubmissionRequest,
  ): Promise<MedicineSubmissionResponse> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionSchema.parse(
      await this.submissions.create(actor.id, query.organizationId, body),
    );
  }

  @Get()
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(pageQueryPipe) query: { organizationId: string; page: number; pageSize: number },
  ): Promise<MedicineSubmissionPage> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionPageSchema.parse(
      await this.submissions.listForDistributor(actor.id, query.organizationId, query.page, query.pageSize),
    );
  }

  @Get(":submissionId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: { organizationId: string },
    @Param("submissionId", idPipe) submissionId: string,
  ): Promise<MedicineSubmissionResponse> {
    const actor = await this.identityService.provision(identity);
    return medicineSubmissionSchema.parse(
      await this.submissions.getForDistributor(actor.id, query.organizationId, submissionId),
    );
  }
}
