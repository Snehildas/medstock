import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  catalogSearchQuerySchema,
  medicinePageSchema,
  medicineResponseSchema,
  type CatalogSearchQuery,
  type MedicinePage,
  type MedicineResponse,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { toMedicineResponse } from "./catalog-response.js";
import { CatalogService } from "./catalog.service.js";

const medicineIdPipe = new ZodValidationPipe(z.uuid());
const searchQueryPipe = new ZodValidationPipe(catalogSearchQuerySchema);

@Controller("catalog/medicines")
@UseGuards(IdentityGuard)
export class CatalogController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly catalogService: CatalogService,
  ) {}

  @Get()
  async search(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(searchQueryPipe) query: CatalogSearchQuery,
  ): Promise<MedicinePage> {
    await this.identityService.provision(identity);
    const page = await this.catalogService.searchMedicines(query.q, query.page, query.pageSize);
    return medicinePageSchema.parse(page);
  }

  @Get(":medicineId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("medicineId", medicineIdPipe) medicineId: string,
  ): Promise<MedicineResponse> {
    const user = await this.identityService.provision(identity);
    const medicine = await this.catalogService.getMedicine(user.id, medicineId);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }
}
