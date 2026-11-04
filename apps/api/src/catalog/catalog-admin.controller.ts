import { Body, Controller, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import {
  createIngredientRequestSchema,
  createManufacturerRequestSchema,
  createMedicineRequestSchema,
  ingredientResponseSchema,
  manufacturerResponseSchema,
  medicineResponseSchema,
  publishMedicineRequestSchema,
  replaceCompositionRequestSchema,
  replaceManufacturersRequestSchema,
  replacePacksRequestSchema,
  updateIngredientRequestSchema,
  updateManufacturerRequestSchema,
  updateMedicineRequestSchema,
  type CreateIngredientRequest,
  type CreateManufacturerRequest,
  type CreateMedicineRequest,
  type IngredientResponse,
  type ManufacturerResponse,
  type MedicineResponse,
  type PublishMedicineRequest,
  type ReplaceCompositionRequest,
  type ReplaceManufacturersRequest,
  type ReplacePacksRequest,
  type UpdateIngredientRequest,
  type UpdateManufacturerRequest,
  type UpdateMedicineRequest,
} from "@medstock/shared-types";
import { z } from "zod";
import { IdentityGuard } from "../identity/identity.guard.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import {
  toIngredientResponse,
  toManufacturerResponse,
  toMedicineResponse,
} from "./catalog-response.js";
import { CatalogService } from "./catalog.service.js";
import { CurrentActor } from "./current-actor.decorator.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

const medicineIdPipe = new ZodValidationPipe(z.uuid());
const ingredientIdPipe = new ZodValidationPipe(z.uuid());
const manufacturerIdPipe = new ZodValidationPipe(z.uuid());

@Controller("admin/catalog")
@UseGuards(IdentityGuard, PlatformAdminGuard)
export class CatalogAdminController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post("ingredients")
  async createIngredient(
    @CurrentActor() actorUserId: string,
    @Body(new ZodValidationPipe(createIngredientRequestSchema)) body: CreateIngredientRequest,
  ): Promise<IngredientResponse> {
    const ingredient = await this.catalogService.createIngredient(actorUserId, body);
    return ingredientResponseSchema.parse(toIngredientResponse(ingredient));
  }

  @Patch("ingredients/:ingredientId")
  async updateIngredient(
    @CurrentActor() actorUserId: string,
    @Param("ingredientId", ingredientIdPipe) ingredientId: string,
    @Body(new ZodValidationPipe(updateIngredientRequestSchema)) body: UpdateIngredientRequest,
  ): Promise<IngredientResponse> {
    const ingredient = await this.catalogService.updateIngredient(actorUserId, ingredientId, body);
    return ingredientResponseSchema.parse(toIngredientResponse(ingredient));
  }

  @Post("manufacturers")
  async createManufacturer(
    @CurrentActor() actorUserId: string,
    @Body(new ZodValidationPipe(createManufacturerRequestSchema)) body: CreateManufacturerRequest,
  ): Promise<ManufacturerResponse> {
    const manufacturer = await this.catalogService.createManufacturer(actorUserId, body);
    return manufacturerResponseSchema.parse(toManufacturerResponse(manufacturer));
  }

  @Patch("manufacturers/:manufacturerId")
  async updateManufacturer(
    @CurrentActor() actorUserId: string,
    @Param("manufacturerId", manufacturerIdPipe) manufacturerId: string,
    @Body(new ZodValidationPipe(updateManufacturerRequestSchema)) body: UpdateManufacturerRequest,
  ): Promise<ManufacturerResponse> {
    const manufacturer = await this.catalogService.updateManufacturer(
      actorUserId,
      manufacturerId,
      body,
    );
    return manufacturerResponseSchema.parse(toManufacturerResponse(manufacturer));
  }

  @Post("medicines")
  async createMedicine(
    @CurrentActor() actorUserId: string,
    @Body(new ZodValidationPipe(createMedicineRequestSchema)) body: CreateMedicineRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.createMedicine(actorUserId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Patch("medicines/:medicineId")
  async updateMedicine(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
    @Body(new ZodValidationPipe(updateMedicineRequestSchema)) body: UpdateMedicineRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.updateMedicine(actorUserId, medicineId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Put("medicines/:medicineId/composition")
  async replaceComposition(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
    @Body(new ZodValidationPipe(replaceCompositionRequestSchema)) body: ReplaceCompositionRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.replaceComposition(actorUserId, medicineId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Put("medicines/:medicineId/packs")
  async replacePacks(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
    @Body(new ZodValidationPipe(replacePacksRequestSchema)) body: ReplacePacksRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.replacePacks(actorUserId, medicineId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Put("medicines/:medicineId/manufacturers")
  async replaceManufacturers(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
    @Body(new ZodValidationPipe(replaceManufacturersRequestSchema))
    body: ReplaceManufacturersRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.replaceManufacturers(actorUserId, medicineId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Post("medicines/:medicineId/publish")
  async publish(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
    @Body(new ZodValidationPipe(publishMedicineRequestSchema)) body: PublishMedicineRequest,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.publishMedicine(actorUserId, medicineId, body);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }

  @Post("medicines/:medicineId/archive")
  async archive(
    @CurrentActor() actorUserId: string,
    @Param("medicineId", medicineIdPipe) medicineId: string,
  ): Promise<MedicineResponse> {
    const medicine = await this.catalogService.archiveMedicine(actorUserId, medicineId);
    return medicineResponseSchema.parse(toMedicineResponse(medicine));
  }
}
