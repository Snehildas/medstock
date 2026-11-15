import type { ZodType } from "zod";
import type { ApiFailure, ApiSuccess } from "./api-client";

export const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000a01";
export const PREVIEW_RETAILER_ID = "00000000-0000-4000-8000-000000000a11";
export const PREVIEW_DISTRIBUTOR_ID = "00000000-0000-4000-8000-000000000a21";
const NORTH_ID = "00000000-0000-4000-8000-000000000a22";
const SOUTH_ID = "00000000-0000-4000-8000-000000000a23";
const OTHER_RETAILER_ID = "00000000-0000-4000-8000-000000000a12";

const PARACETAMOL_ID = "00000000-0000-4000-8000-000000000b01";
const AMOXICILLIN_ID = "00000000-0000-4000-8000-000000000b02";
const PARA_STRIP_ID = "00000000-0000-4000-8000-000000000c01";
const PARA_BOTTLE_ID = "00000000-0000-4000-8000-000000000c02";
const AMOX_STRIP_ID = "00000000-0000-4000-8000-000000000c03";
const INGREDIENT_PARA = "00000000-0000-4000-8000-000000000d01";
const INGREDIENT_AMOX = "00000000-0000-4000-8000-000000000d02";
const INGREDIENT_CLAV = "00000000-0000-4000-8000-000000000d03";
const COMPANY_ID = "00000000-0000-4000-8000-000000000d11";

const LISTING_NORTH_STRIP = "00000000-0000-4000-8000-000000000e01";
const LISTING_SOUTH_STRIP = "00000000-0000-4000-8000-000000000e02";
const LISTING_OWN_STRIP = "00000000-0000-4000-8000-000000000e03";
const LISTING_OWN_AMOX = "00000000-0000-4000-8000-000000000e04";
const ENQUIRY_OPEN = "00000000-0000-4000-8000-000000000f01";
const ENQUIRY_RESPONDED = "00000000-0000-4000-8000-000000000f02";
const IMPORT_PREVIEW = "00000000-0000-4000-8000-000000000f11";
const SUBMISSION_PENDING = "00000000-0000-4000-8000-000000000f21";
const SUBMISSION_APPROVED = "00000000-0000-4000-8000-000000000f22";
const SUBMISSION_REJECTED = "00000000-0000-4000-8000-000000000f23";

const NOTICE = "This is an enquiry only. It is not an order, quote, or stock reservation." as const;
const CREATED = "2026-11-01T09:00:00.000Z";

const previewUser = {
  id: PREVIEW_USER_ID,
  email: "local-preview@medstock.invalid",
  name: "Local preview user (mock, not a real account)",
  status: "ACTIVE" as const,
};

export const previewCurrentUser = {
  ...previewUser,
  memberships: [
    {
      id: "00000000-0000-4000-8000-000000000a31",
      organizationId: PREVIEW_RETAILER_ID,
      role: "RETAILER_OWNER" as const,
      status: "ACTIVE" as const,
      user: previewUser,
      organization: {
        id: PREVIEW_RETAILER_ID,
        name: "Preview Retail Pharmacy (mock organization)",
        type: "RETAILER" as const,
        status: "ACTIVE" as const,
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000a32",
      organizationId: PREVIEW_DISTRIBUTOR_ID,
      role: "DISTRIBUTOR_OWNER" as const,
      status: "ACTIVE" as const,
      user: previewUser,
      organization: {
        id: PREVIEW_DISTRIBUTOR_ID,
        name: "Preview Distributor (mock organization)",
        type: "DISTRIBUTOR" as const,
        status: "ACTIVE" as const,
      },
    },
  ],
};

const medicines = [
  {
    id: PARACETAMOL_ID,
    displayName: "Preview Paracetamol 500 (mock catalog)",
    brandName: "PreviewCeta",
    genericName: "Paracetamol",
    dosageForm: "Tablet",
    presentation: "Oral tablet",
    status: "PUBLISHED" as const,
    searchVisible: true,
    sourceLabel: "Local preview catalog",
    sourceReference: null,
    compositions: [
      {
        ingredientId: INGREDIENT_PARA,
        ingredientName: "Paracetamol",
        strengthValue: "500",
        strengthUnit: "MG" as const,
        basis: "per tablet",
        sequence: 1,
      },
    ],
    packs: [
      { id: PARA_STRIP_ID, description: "Strip of 10 tablets", quantity: "10", unit: "TABLET" as const },
      { id: PARA_BOTTLE_ID, description: "Bottle of 100 tablets", quantity: "100", unit: "TABLET" as const },
    ],
    companies: [{ manufacturerId: COMPANY_ID, name: "Preview Labs (mock)", role: "MANUFACTURER" as const }],
  },
  {
    id: AMOXICILLIN_ID,
    displayName: "Preview Amoxicillin 250 (mock catalog)",
    brandName: "PreviewMox",
    genericName: "Amoxicillin",
    dosageForm: "Capsule",
    presentation: "Oral capsule",
    status: "PUBLISHED" as const,
    searchVisible: true,
    sourceLabel: "Local preview catalog",
    sourceReference: null,
    compositions: [
      {
        ingredientId: INGREDIENT_AMOX,
        ingredientName: "Amoxicillin",
        strengthValue: "250",
        strengthUnit: "MG" as const,
        basis: "per capsule",
        sequence: 1,
      },
      {
        ingredientId: INGREDIENT_CLAV,
        ingredientName: "Clavulanic Acid",
        strengthValue: "125",
        strengthUnit: "MG" as const,
        basis: "per capsule",
        sequence: 2,
      },
    ],
    packs: [{ id: AMOX_STRIP_ID, description: "Strip of 10 capsules", quantity: "10", unit: "CAPSULE" as const }],
    companies: [{ manufacturerId: COMPANY_ID, name: "Preview Labs (mock)", role: "MANUFACTURER" as const }],
  },
];

const retailerListings = [
  listing({
    id: LISTING_NORTH_STRIP,
    distributorId: NORTH_ID,
    distributorName: "Preview North Distributors (mock)",
    medicineId: PARACETAMOL_ID,
    packId: PARA_STRIP_ID,
    unitPrice: "18.50",
    minimumOrderQuantity: "5",
    stockStatus: "IN_STOCK",
    availableQuantity: "240",
    priceFreshness: "FRESH",
    stockFreshness: "FRESH",
  }),
  listing({
    id: LISTING_SOUTH_STRIP,
    distributorId: SOUTH_ID,
    distributorName: "Preview South Distributors (mock)",
    medicineId: PARACETAMOL_ID,
    packId: PARA_STRIP_ID,
    unitPrice: "21.00",
    minimumOrderQuantity: "20",
    stockStatus: "LOW_STOCK",
    availableQuantity: "12",
    priceFreshness: "STALE",
    stockFreshness: "UNKNOWN",
  }),
  listing({
    id: LISTING_OWN_STRIP,
    distributorId: PREVIEW_DISTRIBUTOR_ID,
    distributorName: "Preview Distributor (mock organization)",
    medicineId: PARACETAMOL_ID,
    packId: PARA_STRIP_ID,
    unitPrice: "19.75",
    minimumOrderQuantity: "10",
    stockStatus: "OUT_OF_STOCK",
    availableQuantity: "0",
    priceFreshness: "FRESH",
    stockFreshness: "FRESH",
  }),
  listing({
    id: LISTING_OWN_AMOX,
    distributorId: PREVIEW_DISTRIBUTOR_ID,
    distributorName: "Preview Distributor (mock organization)",
    medicineId: AMOXICILLIN_ID,
    packId: AMOX_STRIP_ID,
    unitPrice: "42.00",
    minimumOrderQuantity: "2",
    stockStatus: "UNKNOWN",
    availableQuantity: null,
    priceFreshness: "UNKNOWN",
    stockFreshness: "UNKNOWN",
  }),
];

const distributorListings = retailerListings
  .filter((item) => item.distributor.id === PREVIEW_DISTRIBUTOR_ID)
  .map((item) => ({
    ...item,
    status: item.id === LISTING_OWN_AMOX ? ("PAUSED" as const) : ("ACTIVE" as const),
    sourceNote: "Local preview mock listing",
    organizationId: PREVIEW_DISTRIBUTOR_ID,
  }));

const enquiries = [
  {
    kind: "enquiry" as const,
    notice: NOTICE,
    id: ENQUIRY_OPEN,
    status: "OPEN" as const,
    requestedPackQuantity: 8,
    quantityMeaning: "catalog_packs" as const,
    message: "Preview request for the 10-tablet strip. This message is mock data.",
    responseMessage: null,
    respondedAt: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    listingId: LISTING_NORTH_STRIP,
    medicineName: "Preview Paracetamol 500 (mock catalog)",
    packDescription: "Strip of 10 tablets",
    retailerOrganizationId: PREVIEW_RETAILER_ID,
    distributorOrganizationId: NORTH_ID,
    counterpartyName: "Preview North Distributors (mock)",
  },
  {
    kind: "enquiry" as const,
    notice: NOTICE,
    id: ENQUIRY_RESPONDED,
    status: "RESPONDED" as const,
    requestedPackQuantity: 4,
    quantityMeaning: "catalog_packs" as const,
    message: "Preview incoming enquiry. This is not an order.",
    responseMessage: "Preview reply only. Indicative price is unchanged and stock is not reserved.",
    respondedAt: "2026-11-02T11:30:00.000Z",
    createdAt: "2026-11-02T08:15:00.000Z",
    updatedAt: "2026-11-02T11:30:00.000Z",
    listingId: LISTING_OWN_STRIP,
    medicineName: "Preview Paracetamol 500 (mock catalog)",
    packDescription: "Strip of 10 tablets",
    retailerOrganizationId: OTHER_RETAILER_ID,
    distributorOrganizationId: PREVIEW_DISTRIBUTOR_ID,
    counterpartyName: "Preview Counter Pharmacy (mock)",
  },
];

const importRecord = {
  id: IMPORT_PREVIEW,
  organizationId: PREVIEW_DISTRIBUTOR_ID,
  status: "PREVIEW_READY" as const,
  fileName: "preview-inventory.csv",
  checksum: "local-preview-not-a-file",
  byteSize: 128,
  totalRows: 2,
  validRows: 1,
  invalidRows: 1,
  createdRows: 0,
  updatedRows: 0,
  skippedRows: 0,
  failedRows: 0,
  createdAt: CREATED,
  completedAt: null,
  rows: [
    {
      rowNumber: 2,
      medicineName: "Preview Paracetamol 500 (mock catalog)",
      packDescription: "Strip of 10 tablets",
      packId: PARA_STRIP_ID,
      matchedPackId: PARA_STRIP_ID,
      matchedMedicineName: "Preview Paracetamol 500 (mock catalog)",
      matchedPackDescription: "Strip of 10 tablets",
      indicativeUnitPrice: "19.75",
      currency: "INR",
      minimumOrderQuantity: "10",
      stockStatus: "OUT_OF_STOCK",
      availableQuantity: "0",
      sourceNote: "Mock preview row",
      action: "UPDATE" as const,
      errors: [],
      warnings: ["Local preview only. This row is not stored."],
      outcome: null,
    },
    {
      rowNumber: 3,
      medicineName: "Unknown mock medicine",
      packDescription: null,
      packId: null,
      matchedPackId: null,
      matchedMedicineName: null,
      matchedPackDescription: null,
      indicativeUnitPrice: null,
      currency: null,
      minimumOrderQuantity: null,
      stockStatus: null,
      availableQuantity: null,
      sourceNote: null,
      action: null,
      errors: ["No canonical pack matched this mock row."],
      warnings: [],
      outcome: null,
    },
  ],
};

export function previewOrganizationId(requested: string | undefined): string {
  if (requested === PREVIEW_DISTRIBUTOR_ID) {
    return PREVIEW_DISTRIBUTOR_ID;
  }
  return PREVIEW_RETAILER_ID;
}

export function previewApiResult<T>(
  path: string,
  schema: ZodType<T>,
  method: string,
): ApiSuccess<T> | ApiFailure {
  if (method !== "GET") {
    return {
      ok: false,
      status: 403,
      code: "preview_read_only",
      message: "Local preview does not send changes to the API.",
    };
  }
  const body = previewGet(path);
  if (body === null) {
    return {
      ok: false,
      status: 404,
      code: "preview_not_found",
      message: "That record is not in the local preview data.",
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 500,
      code: "preview_invalid",
      message: "Local preview data did not match this screen.",
    };
  }
  return { ok: true, data: parsed.data };
}

function previewGet(path: string): unknown | null {
  const url = new URL(path, "http://preview.local");
  const page = positive(url.searchParams.get("page"));
  const pageSize = positive(url.searchParams.get("pageSize"));
  const medicineMatch = /^\/catalog\/medicines\/([^/]+)$/.exec(url.pathname);
  if (medicineMatch) {
    return medicines.find((medicine) => medicine.id === medicineMatch[1]) ?? null;
  }
  if (url.pathname === "/catalog/medicines") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const matched = medicines.filter((medicine) => medicineMatches(medicine, q));
    return pageOf(
      matched.map((medicine) => ({
        id: medicine.id,
        displayName: medicine.displayName,
        brandName: medicine.brandName,
        genericName: medicine.genericName,
        dosageForm: medicine.dosageForm,
        presentation: medicine.presentation,
        status: medicine.status,
        searchVisible: medicine.searchVisible,
        eligibleWholesalerCount: eligibleWholesalerCount(medicine.id),
      })),
      page,
      pageSize,
    );
  }
  const retailerListing = /^\/listings\/([^/]+)$/.exec(url.pathname);
  if (retailerListing) {
    return retailerListings.find((item) => item.id === retailerListing[1]) ?? null;
  }
  if (url.pathname === "/listings") {
    return pageOf(filterRetailerListings(url), page, pageSize);
  }
  const distributorListing = /^\/distributor\/listings\/([^/]+)$/.exec(url.pathname);
  if (distributorListing) {
    const item = distributorListings.find((listingItem) => listingItem.id === distributorListing[1]);
    return item ?? null;
  }
  if (url.pathname === "/distributor/listings") {
    if (url.searchParams.get("organizationId") !== PREVIEW_DISTRIBUTOR_ID) {
      return pageOf([], page, pageSize);
    }
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const stockStatus = url.searchParams.get("stockStatus");
    const matched = distributorListings.filter((item) => {
      const text = `${item.medicine.displayName} ${item.pack.description}`.toLowerCase();
      return (
        (q.length === 0 || text.includes(q)) &&
        (!status || item.status === status) &&
        (!stockStatus || item.stockStatus === stockStatus)
      );
    });
    return pageOf(matched, page, pageSize);
  }
  const enquiry = /^\/(retailer|distributor)\/enquiries\/([^/]+)$/.exec(url.pathname);
  if (enquiry) {
    const side = enquiry[1];
    const found = enquiries.find((item) => item.id === enquiry[2]);
    if (!found) {
      return null;
    }
    return side === "distributor" ? distributorView(found) : found;
  }
  if (url.pathname === "/retailer/enquiries" || url.pathname === "/distributor/enquiries") {
    const side = url.pathname.startsWith("/retailer") ? "retailer" : "distributor";
    const organizationId = url.searchParams.get("organizationId");
    const expected = side === "retailer" ? PREVIEW_RETAILER_ID : PREVIEW_DISTRIBUTOR_ID;
    if (organizationId !== expected) {
      return pageOf([], page, pageSize);
    }
    const items = enquiries
      .filter((item) =>
        side === "retailer"
          ? item.retailerOrganizationId === PREVIEW_RETAILER_ID
          : item.distributorOrganizationId === PREVIEW_DISTRIBUTOR_ID,
      )
      .map((item) => (side === "distributor" ? distributorView(item) : item));
    return pageOf(items, page, pageSize);
  }
  const importDetail = /^\/distributor\/imports\/([^/]+)$/.exec(url.pathname);
  if (importDetail) {
    return importRecord.id === importDetail[1] ? importRecord : null;
  }
  const wholesalers = /^\/retailer\/medicines\/([^/]+)\/wholesalers$/.exec(url.pathname);
  if (wholesalers) {
    return previewWholesalers(wholesalers[1] ?? "", url, page, pageSize);
  }
  if (url.pathname === "/distributor/profile") {
    const organizationId = url.searchParams.get("organizationId");
    if (organizationId !== PREVIEW_DISTRIBUTOR_ID) {
      return {
        organizationId,
        proprietorName: null,
        landlineNumber: null,
        mobileNumber: null,
        published: false,
      };
    }
    return {
      organizationId: PREVIEW_DISTRIBUTOR_ID,
      proprietorName: "Preview Proprietor (mock)",
      landlineNumber: null,
      mobileNumber: "+919800000001",
      published: true,
    };
  }
  if (url.pathname === "/distributor/imports") {
    if (url.searchParams.get("organizationId") !== PREVIEW_DISTRIBUTOR_ID) {
      return pageOf([], page, pageSize);
    }
    return pageOf([importSummary()], page, pageSize);
  }
  const submissionDetail = /^\/distributor\/medicine-submissions\/([^/]+)$/.exec(url.pathname);
  if (submissionDetail) {
    if (url.searchParams.get("organizationId") !== PREVIEW_DISTRIBUTOR_ID) {
      return null;
    }
    return previewSubmissions().find((item) => item.id === submissionDetail[1]) ?? null;
  }
  if (url.pathname === "/distributor/medicine-submissions") {
    if (url.searchParams.get("organizationId") !== PREVIEW_DISTRIBUTOR_ID) {
      return pageOf([], page, pageSize);
    }
    return pageOf(previewSubmissions(), page, pageSize);
  }
  return null;
}

function previewSubmissions() {
  const notice =
    "Your medicine submission must be approved before it becomes available in the shared medicine directory and can be listed for procurement." as const;
  const ingredient = {
    ingredientName: "Paracetamol (mock)",
    kind: "ACTIVE" as const,
    strengthValue: "500",
    strengthUnit: "MG" as const,
    basis: null,
    sequence: 1,
  };
  const pack = { description: "Strip of 10 tablets (mock)", quantity: "10", unit: "TABLET" as const };
  return [
    {
      id: SUBMISSION_PENDING,
      organizationId: PREVIEW_DISTRIBUTOR_ID,
      status: "PENDING_REVIEW" as const,
      displayName: "Preview Pending Tablet (mock submission)",
      brandName: "PreviewBrand",
      genericName: "Paracetamol",
      dosageForm: "Tablet",
      presentation: null,
      manufacturerName: "Preview Labs (mock)",
      marketerName: null,
      indicativeUnitPrice: "18.50",
      minimumOrderQuantity: "4",
      stockStatus: "IN_STOCK" as const,
      availableQuantity: "20",
      sourceNote: "Mock counter stock",
      reviewReason: null,
      reviewedAt: null,
      approvedMedicineId: null,
      createdAt: CREATED,
      ingredients: [ingredient],
      packs: [pack],
      candidates: [],
      notice,
    },
    {
      id: SUBMISSION_APPROVED,
      organizationId: PREVIEW_DISTRIBUTOR_ID,
      status: "APPROVED" as const,
      displayName: "Preview Approved Capsule (mock submission)",
      brandName: null,
      genericName: "Amoxicillin",
      dosageForm: "Capsule",
      presentation: null,
      manufacturerName: null,
      marketerName: null,
      indicativeUnitPrice: "42.00",
      minimumOrderQuantity: "2",
      stockStatus: "LOW_STOCK" as const,
      availableQuantity: null,
      sourceNote: null,
      reviewReason: null,
      reviewedAt: CREATED,
      approvedMedicineId: PARACETAMOL_ID,
      createdAt: CREATED,
      ingredients: [ingredient],
      packs: [pack],
      candidates: [],
      notice,
    },
    {
      id: SUBMISSION_REJECTED,
      organizationId: PREVIEW_DISTRIBUTOR_ID,
      status: "REJECTED" as const,
      displayName: "Preview Rejected Syrup (mock submission)",
      brandName: null,
      genericName: null,
      dosageForm: "Syrup",
      presentation: null,
      manufacturerName: null,
      marketerName: null,
      indicativeUnitPrice: "10.00",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN" as const,
      availableQuantity: null,
      sourceNote: null,
      reviewReason: "Mock review: this name is too close to an existing catalog medicine.",
      reviewedAt: CREATED,
      approvedMedicineId: null,
      createdAt: CREATED,
      ingredients: [ingredient],
      packs: [pack],
      candidates: [],
      notice,
    },
  ];
}

function importSummary() {
  return {
    id: importRecord.id,
    organizationId: importRecord.organizationId,
    status: importRecord.status,
    fileName: importRecord.fileName,
    totalRows: importRecord.totalRows,
    validRows: importRecord.validRows,
    invalidRows: importRecord.invalidRows,
    createdRows: importRecord.createdRows,
    updatedRows: importRecord.updatedRows,
    skippedRows: importRecord.skippedRows,
    failedRows: importRecord.failedRows,
    createdAt: importRecord.createdAt,
    completedAt: importRecord.completedAt,
  };
}

function distributorView(enquiry: (typeof enquiries)[number]) {
  if (enquiry.id === ENQUIRY_RESPONDED) {
    return { ...enquiry, counterpartyName: "Preview Counter Pharmacy (mock)" };
  }
  return { ...enquiry, counterpartyName: "Preview Retail Pharmacy (mock organization)" };
}

const mockContacts: Record<string, { proprietorName: string; landlineNumber: string | null; mobileNumber: string | null }> = {
  [NORTH_ID]: {
    proprietorName: "Mr. Manjunath (mock)",
    landlineNumber: "+918212445566",
    mobileNumber: "+919812345678",
  },
  [PREVIEW_DISTRIBUTOR_ID]: {
    proprietorName: "Preview Proprietor (mock)",
    landlineNumber: null,
    mobileNumber: "+919800000001",
  },
};

function eligibleWholesalerCount(medicineId: string): number {
  return new Set(
    retailerListings
      .filter((item) => item.medicine.id === medicineId && item.id !== LISTING_OWN_AMOX)
      .map((item) => item.distributor.id),
  ).size;
}

function previewWholesalers(medicineId: string, url: URL, page: number, pageSize: number) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const packId = url.searchParams.get("medicinePackId");
  const stockStatus = url.searchParams.get("stockStatus");
  const minPrice = url.searchParams.get("minPrice");
  const maxPrice = url.searchParams.get("maxPrice");
  const matched = retailerListings.filter((item) => {
    if (item.medicine.id !== medicineId || item.id === LISTING_OWN_AMOX) {
      return false;
    }
    const text = `${item.distributor.name} ${item.medicine.displayName} ${item.pack.description}`.toLowerCase();
    const price = Number(item.unitPrice);
    return (
      (q.length === 0 || text.includes(q)) &&
      (!packId || item.pack.id === packId) &&
      (!stockStatus || item.stockStatus === stockStatus) &&
      (!minPrice || price >= Number(minPrice)) &&
      (!maxPrice || price <= Number(maxPrice))
    );
  });
  const paged = pageOf(
    matched.map((item) => ({
      ...item,
      contact: mockContacts[item.distributor.id] ?? null,
    })),
    page,
    pageSize,
  );
  return {
    ...paged,
    medicineId,
    eligibleWholesalerCount: new Set(matched.map((item) => item.distributor.id)).size,
  };
}

function filterRetailerListings(url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const medicineId = url.searchParams.get("medicineId");
  const packId = url.searchParams.get("medicinePackId");
  const organizationId = url.searchParams.get("organizationId");
  const stockStatus = url.searchParams.get("stockStatus");
  const minPrice = url.searchParams.get("minPrice");
  const maxPrice = url.searchParams.get("maxPrice");
  return retailerListings.filter((item) => {
    const text = `${item.medicine.displayName} ${item.medicine.genericName} ${item.pack.description}`.toLowerCase();
    const price = Number(item.unitPrice);
    return (
      (q.length === 0 || text.includes(q)) &&
      (!medicineId || item.medicine.id === medicineId) &&
      (!packId || item.pack.id === packId) &&
      (!organizationId || item.distributor.id === organizationId) &&
      (!stockStatus || item.stockStatus === stockStatus) &&
      (!minPrice || price >= Number(minPrice)) &&
      (!maxPrice || price <= Number(maxPrice))
    );
  });
}

function medicineMatches(
  medicine: (typeof medicines)[number],
  q: string,
): boolean {
  if (q.length === 0) {
    return false;
  }
  const haystack = [
    medicine.displayName,
    medicine.genericName,
    medicine.brandName ?? "",
    ...medicine.compositions.map((line) => line.ingredientName),
    ...medicine.packs.map((pack) => pack.description),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function pageOf<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function positive(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function listing(input: {
  id: string;
  distributorId: string;
  distributorName: string;
  medicineId: string;
  packId: string;
  unitPrice: string;
  minimumOrderQuantity: string;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  availableQuantity: string | null;
  priceFreshness: "FRESH" | "STALE" | "UNKNOWN";
  stockFreshness: "FRESH" | "STALE" | "UNKNOWN";
}) {
  const medicine = medicines.find((item) => item.id === input.medicineId);
  const pack = medicine?.packs.find((item) => item.id === input.packId);
  if (!medicine || !pack) {
    throw new Error("Preview listing is missing its mock medicine.");
  }
  return {
    id: input.id,
    priceIsIndicative: true as const,
    unitPrice: input.unitPrice,
    currency: "INR" as const,
    minimumOrderQuantity: input.minimumOrderQuantity,
    stockStatus: input.stockStatus,
    availableQuantity: input.availableQuantity,
    priceFreshness: input.priceFreshness,
    stockFreshness: input.stockFreshness,
    priceUpdatedAt: CREATED,
    stockUpdatedAt: CREATED,
    source: "MANUAL" as const,
    distributor: { id: input.distributorId, name: input.distributorName },
    pack,
    medicine: {
      id: medicine.id,
      displayName: medicine.displayName,
      brandName: medicine.brandName,
      genericName: medicine.genericName,
      dosageForm: medicine.dosageForm,
    },
  };
}
