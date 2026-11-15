import { z } from "zod";
import { normalizeContactNumber } from "./phone.js";

export { normalizeContactNumber } from "./phone.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  status: z.enum(["ready", "unavailable"]),
  service: z.literal("medstock-api"),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const membershipRoleSchema = z.enum([
  "PLATFORM_ADMIN",
  "RETAILER_OWNER",
  "RETAILER_STAFF",
  "DISTRIBUTOR_OWNER",
  "DISTRIBUTOR_STAFF",
]);

export const membershipStatusSchema = z.enum(["INVITED", "ACTIVE", "SUSPENDED"]);

export const userStatusSchema = z.enum(["INVITED", "ACTIVE", "DISABLED"]);

export const createMembershipRequestSchema = z
  .object({
    userId: z.uuid(),
    role: membershipRoleSchema,
  })
  .strict();

export type CreateMembershipRequest = z.infer<typeof createMembershipRequestSchema>;

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  status: userStatusSchema,
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const membershipResponseSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  user: userResponseSchema,
});

export type MembershipResponse = z.infer<typeof membershipResponseSchema>;

export const organizationTypeSchema = z.enum(["PLATFORM", "RETAILER", "DISTRIBUTOR"]);
export const organizationStatusSchema = z.enum([
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
]);

export const organizationSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: organizationTypeSchema,
  status: organizationStatusSchema,
});

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const currentUserMembershipSchema = membershipResponseSchema.extend({
  organization: organizationSummarySchema,
});

export const currentUserResponseSchema = userResponseSchema.extend({
  memberships: z.array(currentUserMembershipSchema),
});

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

export const catalogStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const ingredientKindSchema = z.enum(["ACTIVE", "SALT"]);
export const strengthUnitSchema = z.enum(["MG", "MCG", "G", "ML", "IU", "PERCENT"]);
export const packUnitSchema = z.enum(["TABLET", "CAPSULE", "ML", "G", "VIAL", "BOTTLE", "PIECE"]);
export const medicineCompanyRoleSchema = z.enum(["MANUFACTURER", "MARKETER"]);

const catalogNameSchema = z.string().trim().min(1).max(200);
const catalogDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const createIngredientRequestSchema = z
  .object({
    canonicalName: catalogNameSchema,
    kind: ingredientKindSchema.optional().default("ACTIVE"),
    aliases: z.array(catalogNameSchema).max(20).optional().default([]),
  })
  .strict();

export const updateIngredientRequestSchema = createIngredientRequestSchema;

export const createManufacturerRequestSchema = z
  .object({
    canonicalName: catalogNameSchema,
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

export const updateManufacturerRequestSchema = createManufacturerRequestSchema;

export const createMedicineRequestSchema = z
  .object({
    displayName: catalogNameSchema,
    brandName: catalogNameSchema.nullable().optional(),
    genericName: catalogNameSchema,
    dosageForm: catalogNameSchema,
    presentation: catalogNameSchema.nullable().optional(),
    sourceLabel: z.string().trim().min(1).max(80).optional(),
    sourceReference: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const updateMedicineRequestSchema = z
  .object({
    displayName: catalogNameSchema.optional(),
    brandName: catalogNameSchema.nullable().optional(),
    genericName: catalogNameSchema.optional(),
    dosageForm: catalogNameSchema.optional(),
    presentation: catalogNameSchema.nullable().optional(),
    sourceLabel: z.string().trim().min(1).max(80).optional(),
    sourceReference: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const publishMedicineRequestSchema = z
  .object({
    searchVisible: z.boolean().optional().default(true),
  })
  .strict();

export const medicineSubmissionStatusSchema = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]);

const submissionIngredientSchema = z
  .object({
    ingredientName: catalogNameSchema,
    kind: ingredientKindSchema,
    strengthValue: catalogDecimalSchema,
    strengthUnit: strengthUnitSchema,
    basis: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();

const submissionPackSchema = z
  .object({
    description: catalogNameSchema,
    quantity: catalogDecimalSchema,
    unit: packUnitSchema,
  })
  .strict();

export const createMedicineSubmissionSchema = z
  .object({
    displayName: catalogNameSchema,
    brandName: catalogNameSchema.nullable().optional(),
    genericName: catalogNameSchema.nullable().optional(),
    dosageForm: catalogNameSchema,
    presentation: catalogNameSchema.nullable().optional(),
    manufacturerName: catalogNameSchema.nullable().optional(),
    marketerName: catalogNameSchema.nullable().optional(),
    indicativeUnitPrice: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/),
    minimumOrderQuantity: z.string().regex(/^[1-9]\d*$/),
    stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]),
    availableQuantity: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
      .refine((value) => Number(value) >= 0)
      .nullable()
      .optional(),
    sourceNote: z.string().trim().min(1).max(200).nullable().optional(),
    ingredients: z.array(submissionIngredientSchema).min(1).max(12),
    packs: z.array(submissionPackSchema).min(1).max(12),
  })
  .strict()
  .superRefine((value, context) => {
    const ingredientNames = value.ingredients.map((line) => line.ingredientName.trim().toLowerCase().replace(/\s+/g, " "));
    if (new Set(ingredientNames).size !== ingredientNames.length) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message: "Each ingredient name must stay separate. Enter a different name instead of repeating one.",
      });
    }
    const descriptions = value.packs.map((pack) => pack.description.trim().toLowerCase().replace(/\s+/g, " "));
    if (new Set(descriptions).size !== descriptions.length) {
      context.addIssue({
        code: "custom",
        path: ["packs"],
        message: "Each pack needs its own description.",
      });
    }
  });

export const rejectMedicineSubmissionSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const medicineSubmissionIngredientResponseSchema = z.object({
  ingredientName: z.string(),
  kind: ingredientKindSchema,
  strengthValue: z.string(),
  strengthUnit: strengthUnitSchema,
  basis: z.string().nullable(),
  sequence: z.number().int(),
});

export const medicineSubmissionPackResponseSchema = z.object({
  description: z.string(),
  quantity: z.string(),
  unit: packUnitSchema,
});

export const medicineSubmissionCandidateSchema = z.object({
  kind: z.enum(["medicine", "submission"]),
  id: z.uuid(),
  displayName: z.string(),
  match: z.enum(["exact", "similar"]),
});

export const medicineSubmissionSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  status: medicineSubmissionStatusSchema,
  displayName: z.string(),
  brandName: z.string().nullable(),
  genericName: z.string().nullable(),
  dosageForm: z.string(),
  presentation: z.string().nullable(),
  manufacturerName: z.string().nullable(),
  marketerName: z.string().nullable(),
  indicativeUnitPrice: z.string().nullable(),
  minimumOrderQuantity: z.string().nullable(),
  stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]).nullable(),
  availableQuantity: z.string().nullable(),
  sourceNote: z.string().nullable(),
  reviewReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  approvedMedicineId: z.uuid().nullable(),
  createdAt: z.string(),
  ingredients: z.array(medicineSubmissionIngredientResponseSchema),
  packs: z.array(medicineSubmissionPackResponseSchema),
  candidates: z.array(medicineSubmissionCandidateSchema),
  notice: z.literal(
    "Your medicine submission must be approved before it becomes available in the shared medicine directory and can be listed for procurement.",
  ),
});

export const medicineSubmissionPageSchema = z.object({
  items: z.array(medicineSubmissionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type CreateMedicineSubmissionRequest = z.infer<typeof createMedicineSubmissionSchema>;
export type RejectMedicineSubmissionRequest = z.infer<typeof rejectMedicineSubmissionSchema>;
export type MedicineSubmissionResponse = z.infer<typeof medicineSubmissionSchema>;
export type MedicineSubmissionPage = z.infer<typeof medicineSubmissionPageSchema>;

export const replaceCompositionRequestSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            ingredientId: z.uuid(),
            strengthValue: catalogDecimalSchema,
            strengthUnit: strengthUnitSchema,
            basis: catalogNameSchema.nullable().optional(),
            sequence: z.number().int().min(1).max(50),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

export const replacePacksRequestSchema = z
  .object({
    packs: z
      .array(
        z
          .object({
            description: catalogNameSchema,
            quantity: catalogDecimalSchema,
            unit: packUnitSchema,
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

export const replaceManufacturersRequestSchema = z
  .object({
    companies: z
      .array(
        z
          .object({
            manufacturerId: z.uuid(),
            role: medicineCompanyRoleSchema,
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export const catalogSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const ingredientResponseSchema = z.object({
  id: z.uuid(),
  canonicalName: z.string(),
  kind: ingredientKindSchema,
  aliases: z.array(z.string()),
});

export const manufacturerResponseSchema = z.object({
  id: z.uuid(),
  canonicalName: z.string(),
  countryCode: z.string().nullable(),
});

export const medicineCompositionResponseSchema = z.object({
  ingredientId: z.uuid(),
  ingredientName: z.string(),
  strengthValue: z.string(),
  strengthUnit: strengthUnitSchema,
  basis: z.string().nullable(),
  sequence: z.number().int(),
});

export const medicinePackResponseSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  quantity: z.string(),
  unit: packUnitSchema,
});

export const medicineCompanyResponseSchema = z.object({
  manufacturerId: z.uuid(),
  name: z.string(),
  role: medicineCompanyRoleSchema,
});

export const medicineResponseSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  brandName: z.string().nullable(),
  genericName: z.string(),
  dosageForm: z.string(),
  presentation: z.string().nullable(),
  status: catalogStatusSchema,
  searchVisible: z.boolean(),
  sourceLabel: z.string(),
  sourceReference: z.string().nullable(),
  compositions: z.array(medicineCompositionResponseSchema),
  packs: z.array(medicinePackResponseSchema),
  companies: z.array(medicineCompanyResponseSchema),
});

export const medicineSummarySchema = medicineResponseSchema
  .pick({
    id: true,
    displayName: true,
    brandName: true,
    genericName: true,
    dosageForm: true,
    presentation: true,
    status: true,
    searchVisible: true,
  })
  .extend({
    eligibleWholesalerCount: z.number().int().nonnegative(),
  });

export const medicinePageSchema = z.object({
  items: z.array(medicineSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type CreateIngredientRequest = z.infer<typeof createIngredientRequestSchema>;
export type UpdateIngredientRequest = z.infer<typeof updateIngredientRequestSchema>;
export type CreateManufacturerRequest = z.infer<typeof createManufacturerRequestSchema>;
export type UpdateManufacturerRequest = z.infer<typeof updateManufacturerRequestSchema>;
export type CreateMedicineRequest = z.infer<typeof createMedicineRequestSchema>;
export type UpdateMedicineRequest = z.infer<typeof updateMedicineRequestSchema>;
export type PublishMedicineRequest = z.infer<typeof publishMedicineRequestSchema>;
export type ReplaceCompositionRequest = z.infer<typeof replaceCompositionRequestSchema>;
export type ReplacePacksRequest = z.infer<typeof replacePacksRequestSchema>;
export type ReplaceManufacturersRequest = z.infer<typeof replaceManufacturersRequestSchema>;
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;
export type MedicineResponse = z.infer<typeof medicineResponseSchema>;
export type MedicinePage = z.infer<typeof medicinePageSchema>;
export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;
export type ManufacturerResponse = z.infer<typeof manufacturerResponseSchema>;

export const listingStatusSchema = z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "SUSPENDED"]);
export const stockStatusSchema = z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);
export const listingFreshnessSchema = z.enum(["FRESH", "STALE", "UNKNOWN"]);
export const listingSourceSchema = z.enum([
  "MANUAL",
  "CSV_IMPORT",
  "API_INTEGRATION",
  "SFTP_IMPORT",
  "ERP_INTEGRATION",
  "POS_INTEGRATION",
]);

const listingMoneySchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
const listingQuantitySchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => Number(value) > 0, "Minimum order quantity must be a whole number of packs.");
const listingAvailableSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((value) => Number(value) >= 0, "Quantity cannot be negative.");

export const createListingRequestSchema = z
  .object({
    medicinePackId: z.uuid(),
    unitPrice: listingMoneySchema,
    currency: z.literal("INR").optional().default("INR"),
    minimumOrderQuantity: listingQuantitySchema,
    stockStatus: stockStatusSchema.optional().default("UNKNOWN"),
    availableQuantity: listingAvailableSchema.nullable().optional(),
    sourceNote: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const updateListingRequestSchema = z
  .object({
    unitPrice: listingMoneySchema.optional(),
    minimumOrderQuantity: listingQuantitySchema.optional(),
    stockStatus: stockStatusSchema.optional(),
    availableQuantity: listingAvailableSchema.nullable().optional(),
    sourceNote: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const distributorListingQuerySchema = z.object({
  organizationId: z.uuid(),
  q: z.string().trim().max(200).optional().default(""),
  status: listingStatusSchema.optional(),
  stockStatus: stockStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const listingSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  medicineId: z.uuid().optional(),
  medicinePackId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  stockStatus: stockStatusSchema.optional(),
  minPrice: listingMoneySchema.optional(),
  maxPrice: listingMoneySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const listingPackSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  quantity: z.string(),
  unit: packUnitSchema,
});

const listingMedicineSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  brandName: z.string().nullable(),
  genericName: z.string(),
  dosageForm: z.string(),
});

export const retailerListingSchema = z.object({
  id: z.uuid(),
  priceIsIndicative: z.literal(true),
  unitPrice: z.string(),
  currency: z.literal("INR"),
  minimumOrderQuantity: z.string(),
  stockStatus: stockStatusSchema,
  availableQuantity: z.string().nullable(),
  priceFreshness: listingFreshnessSchema,
  stockFreshness: listingFreshnessSchema,
  priceUpdatedAt: z.string().nullable(),
  stockUpdatedAt: z.string().nullable(),
  source: listingSourceSchema,
  distributor: z.object({ id: z.uuid(), name: z.string() }),
  pack: listingPackSchema,
  medicine: listingMedicineSchema,
});

export const distributorListingSchema = retailerListingSchema.extend({
  status: listingStatusSchema,
  sourceNote: z.string().nullable(),
  organizationId: z.uuid(),
});

export const wholesalerContactSchema = z.object({
  proprietorName: z.string(),
  landlineNumber: z.string().nullable(),
  mobileNumber: z.string().nullable(),
});

export const wholesalerListingSchema = retailerListingSchema.extend({
  contact: wholesalerContactSchema.nullable(),
});

export const wholesalerQuerySchema = z.object({
  medicinePackId: z.uuid().optional(),
  q: z.string().trim().max(200).optional().default(""),
  stockStatus: stockStatusSchema.optional(),
  minPrice: listingMoneySchema.optional(),
  maxPrice: listingMoneySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const wholesalerPageSchema = z.object({
  medicineId: z.uuid(),
  eligibleWholesalerCount: z.number().int().nonnegative(),
  items: z.array(wholesalerListingSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int().nonnegative(),
});

function blankContact(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

export const distributorProfileRequestSchema = z
  .object({
    proprietorName: z.string().trim().min(1).max(120),
    landlineNumber: z.string().trim().max(24).nullable().optional(),
    mobileNumber: z.string().trim().max(24).nullable().optional(),
    publish: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const landline = blankContact(value.landlineNumber)
      ? null
      : normalizeContactNumber("landline", value.landlineNumber ?? "");
    const mobile = blankContact(value.mobileNumber)
      ? null
      : normalizeContactNumber("mobile", value.mobileNumber ?? "");
    if (!blankContact(value.landlineNumber) && landline === null) {
      context.addIssue({ code: "custom", path: ["landlineNumber"], message: "Enter a valid landline number." });
    }
    if (!blankContact(value.mobileNumber) && mobile === null) {
      context.addIssue({ code: "custom", path: ["mobileNumber"], message: "Enter a valid mobile number." });
    }
    if (value.publish && landline === null && mobile === null) {
      context.addIssue({
        code: "custom",
        path: ["publish"],
        message: "A published profile needs a landline or a mobile number.",
      });
    }
  })
  .transform((value) => ({
    proprietorName: value.proprietorName,
    landlineNumber: blankContact(value.landlineNumber)
      ? null
      : normalizeContactNumber("landline", value.landlineNumber ?? ""),
    mobileNumber: blankContact(value.mobileNumber)
      ? null
      : normalizeContactNumber("mobile", value.mobileNumber ?? ""),
    publish: value.publish,
  }));

export const distributorProfileSchema = z.object({
  organizationId: z.uuid(),
  proprietorName: z.string().nullable(),
  landlineNumber: z.string().nullable(),
  mobileNumber: z.string().nullable(),
  published: z.boolean(),
});

export const retailerListingPageSchema = z.object({
  items: z.array(retailerListingSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const distributorListingPageSchema = z.object({
  items: z.array(distributorListingSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type CreateListingRequest = z.infer<typeof createListingRequestSchema>;
export type UpdateListingRequest = z.infer<typeof updateListingRequestSchema>;
export type DistributorListingQuery = z.infer<typeof distributorListingQuerySchema>;
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
export type RetailerListing = z.infer<typeof retailerListingSchema>;
export type DistributorListingResponse = z.infer<typeof distributorListingSchema>;
export type RetailerListingPage = z.infer<typeof retailerListingPageSchema>;
export type DistributorListingPage = z.infer<typeof distributorListingPageSchema>;
export type WholesalerQuery = z.infer<typeof wholesalerQuerySchema>;
export type WholesalerListing = z.infer<typeof wholesalerListingSchema>;
export type WholesalerPage = z.infer<typeof wholesalerPageSchema>;
export type DistributorProfileRequest = z.infer<typeof distributorProfileRequestSchema>;
export type DistributorProfile = z.infer<typeof distributorProfileSchema>;

export const enquiryStatusSchema = z.enum(["OPEN", "RESPONDED", "CLOSED"]);

const enquiryMessageSchema = z.string().trim().min(1).max(1000);

export const createEnquiryRequestSchema = z
  .object({
    listingId: z.uuid(),
    requestedPackQuantity: z.number().int().positive().max(1_000_000),
    message: enquiryMessageSchema.optional(),
  })
  .strict();

export const respondEnquiryRequestSchema = z
  .object({
    message: enquiryMessageSchema,
  })
  .strict();

export const enquiryOrganizationQuerySchema = z.object({
  organizationId: z.uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const enquiryPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const enquiryResponseSchema = z.object({
  kind: z.literal("enquiry"),
  notice: z.literal(
    "This is an enquiry only. It is not an order, quote, or stock reservation.",
  ),
  id: z.uuid(),
  status: enquiryStatusSchema,
  requestedPackQuantity: z.number().int().positive(),
  quantityMeaning: z.literal("catalog_packs"),
  message: z.string().nullable(),
  responseMessage: z.string().nullable(),
  respondedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  listingId: z.uuid(),
  medicineName: z.string(),
  packDescription: z.string(),
  retailerOrganizationId: z.uuid(),
  distributorOrganizationId: z.uuid(),
  counterpartyName: z.string(),
});

export const adminEnquiryResponseSchema = enquiryResponseSchema.omit({ counterpartyName: true }).extend({
  retailerName: z.string(),
  distributorName: z.string(),
});

export const enquiryPageSchema = z.object({
  items: z.array(enquiryResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const adminEnquiryPageSchema = z.object({
  items: z.array(adminEnquiryResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type CreateEnquiryRequest = z.infer<typeof createEnquiryRequestSchema>;
export type RespondEnquiryRequest = z.infer<typeof respondEnquiryRequestSchema>;
export type EnquiryOrganizationQuery = z.infer<typeof enquiryOrganizationQuerySchema>;
export type EnquiryResponse = z.infer<typeof enquiryResponseSchema>;
export type AdminEnquiryResponse = z.infer<typeof adminEnquiryResponseSchema>;
export type EnquiryPage = z.infer<typeof enquiryPageSchema>;
export type AdminEnquiryPage = z.infer<typeof adminEnquiryPageSchema>;

export const importOrganizationQuerySchema = z.object({
  organizationId: z.uuid(),
});

export const importListQuerySchema = importOrganizationQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ImportOrganizationQuery = z.infer<typeof importOrganizationQuerySchema>;

export const listingImportStatusSchema = z.enum([
  "PREVIEW_READY",
  "COMMITTED",
  "FAILED",
  "CANCELLED",
]);

export const listingImportRowSchema = z.object({
  rowNumber: z.number().int(),
  medicineName: z.string().nullable(),
  packDescription: z.string().nullable(),
  packId: z.string().nullable(),
  matchedPackId: z.uuid().nullable(),
  matchedMedicineName: z.string().nullable(),
  matchedPackDescription: z.string().nullable(),
  indicativeUnitPrice: z.string().nullable(),
  currency: z.string().nullable(),
  minimumOrderQuantity: z.string().nullable(),
  stockStatus: z.string().nullable(),
  availableQuantity: z.string().nullable(),
  sourceNote: z.string().nullable(),
  action: z.enum(["CREATE", "UPDATE"]).nullable(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  outcome: z.enum(["APPLIED", "FAILED", "SKIPPED"]).nullable(),
});

export const listingImportSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  status: listingImportStatusSchema,
  fileName: z.string(),
  checksum: z.string(),
  byteSize: z.number().int(),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  createdRows: z.number().int(),
  updatedRows: z.number().int(),
  skippedRows: z.number().int(),
  failedRows: z.number().int(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  rows: z.array(listingImportRowSchema),
});

export type ListingImportResponse = z.infer<typeof listingImportSchema>;

export const listingImportSummarySchema = listingImportSchema.omit({
  checksum: true,
  byteSize: true,
  rows: true,
});

export const listingImportPageSchema = z.object({
  items: z.array(listingImportSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type ListingImportSummary = z.infer<typeof listingImportSummarySchema>;
export type ListingImportPage = z.infer<typeof listingImportPageSchema>;
export type ImportListQuery = z.infer<typeof importListQuerySchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  area: z.enum(["catalog", "submission", "listing", "enquiry"]),
  action: z.string().min(1),
  createdAt: z.string(),
});

export const auditEventPageSchema = z.object({
  items: z.array(auditEventSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventPage = z.infer<typeof auditEventPageSchema>;

export { demoPersonaKey, demoPersonas, type DemoPersona } from "./demo-personas.js";
export { demoModeConflict, demoModeEnabled } from "./demo-mode.js";
export {
  DEMO_ACCESS_TOKEN_PREFIX,
  DEMO_ACCESS_TOKEN_TTL_SECONDS,
  createDemoAccessToken,
  verifyDemoAccessToken,
  type VerifiedDemoAccessToken,
} from "./demo-access-token.js";
