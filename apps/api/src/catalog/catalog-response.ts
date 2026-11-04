import type {
  IngredientResponse,
  ManufacturerResponse,
  MedicineResponse,
} from "@medstock/shared-types";
import {
  ingredientResponseSchema,
  manufacturerResponseSchema,
  medicineResponseSchema,
} from "@medstock/shared-types";
import type { CatalogService, MedicineDetail } from "./catalog.service.js";
import { formatDecimal } from "./search-text.js";

type IngredientRecord = Awaited<ReturnType<CatalogService["createIngredient"]>>;
type ManufacturerRecord = Awaited<ReturnType<CatalogService["createManufacturer"]>>;

export function toIngredientResponse(ingredient: IngredientRecord): IngredientResponse {
  return ingredientResponseSchema.parse({
    id: ingredient.id,
    canonicalName: ingredient.canonicalName,
    kind: ingredient.kind,
    aliases: ingredient.aliases.map((alias) => alias.alias),
  });
}

export function toManufacturerResponse(manufacturer: ManufacturerRecord): ManufacturerResponse {
  return manufacturerResponseSchema.parse({
    id: manufacturer.id,
    canonicalName: manufacturer.canonicalName,
    countryCode: manufacturer.countryCode,
  });
}

export function toMedicineResponse(medicine: MedicineDetail): MedicineResponse {
  return medicineResponseSchema.parse({
    id: medicine.id,
    displayName: medicine.displayName,
    brandName: medicine.brandName,
    genericName: medicine.genericName,
    dosageForm: medicine.dosageForm,
    presentation: medicine.presentation,
    status: medicine.status,
    searchVisible: medicine.searchVisible,
    sourceLabel: medicine.sourceLabel,
    sourceReference: medicine.sourceReference,
    compositions: medicine.compositions.map((line) => ({
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient.canonicalName,
      strengthValue: formatDecimal(line.strengthValue),
      strengthUnit: line.strengthUnit,
      basis: line.basis,
      sequence: line.sequence,
    })),
    packs: medicine.packs.map((pack) => ({
      id: pack.id,
      description: pack.description,
      quantity: formatDecimal(pack.quantity),
      unit: pack.unit,
    })),
    companies: medicine.companies.map((company) => ({
      manufacturerId: company.manufacturerId,
      name: company.manufacturer.canonicalName,
      role: company.role,
    })),
  });
}
