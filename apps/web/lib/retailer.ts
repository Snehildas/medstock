import { createEnquiryRequestSchema, listingSearchQuerySchema, respondEnquiryRequestSchema } from "@medstock/shared-types";

export type EnquiryStatus = "OPEN" | "RESPONDED" | "CLOSED";

const requestBodyKeys = new Set(["listingId", "requestedPackQuantity", "message"]);

export function retailerAccess(organizationType: string | undefined): "allowed" | "blocked" {
  return organizationType === "RETAILER" ? "allowed" : "blocked";
}

export function catalogSearchState(input: {
  query: string;
  phase: "idle" | "loading" | "error" | "ready";
  total: number;
}): "prompt" | "loading" | "error" | "empty" | "results" {
  if (input.query.trim().length === 0) {
    return "prompt";
  }
  if (input.phase === "loading") {
    return "loading";
  }
  if (input.phase === "error") {
    return "error";
  }
  return input.total === 0 ? "empty" : "results";
}

export function searchResultView(medicine: {
  displayName: string;
  dosageForm: string;
  compositions: Array<{ ingredientName: string; strengthValue: string; strengthUnit: string }>;
  packs: Array<{ id: string; description: string; quantity: string; unit: string }>;
}): { name: string; dosageForm: string; composition: string[]; packs: string[]; advice: false } {
  return {
    name: medicine.displayName,
    dosageForm: medicine.dosageForm,
    composition: medicine.compositions.map(
      (line) => `${line.ingredientName} ${line.strengthValue} ${line.strengthUnit}`,
    ),
    packs: medicine.packs.map((pack) => `${pack.description} · ${pack.quantity} ${pack.unit}`),
    advice: false,
  };
}

export function retailerListingSearch(input: {
  q?: string;
  medicineId?: string;
  medicinePackId?: string;
  distributorOrganizationId?: string;
  stockStatus?: string;
  minPrice?: string;
  maxPrice?: string;
  page?: number;
}): { ok: true; path: string } | { ok: false; fieldErrors: Record<string, string> } {
  const query: Record<string, unknown> = {
    q: input.q?.trim() ?? "",
    page: input.page ?? 1,
    pageSize: 20,
  };
  if (input.medicineId) {
    query.medicineId = input.medicineId;
  }
  if (input.medicinePackId) {
    query.medicinePackId = input.medicinePackId;
  }
  if (input.distributorOrganizationId) {
    query.organizationId = input.distributorOrganizationId;
  }
  if (input.stockStatus) {
    query.stockStatus = input.stockStatus;
  }
  if (input.minPrice?.trim()) {
    query.minPrice = input.minPrice.trim();
  }
  if (input.maxPrice?.trim()) {
    query.maxPrice = input.maxPrice.trim();
  }
  const parsed = listingSearchQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, fieldErrors: issues(parsed.error.issues) };
  }
  if (
    parsed.data.minPrice &&
    parsed.data.maxPrice &&
    Number(parsed.data.minPrice) > Number(parsed.data.maxPrice)
  ) {
    return { ok: false, fieldErrors: { minPrice: "Minimum price cannot be above the maximum." } };
  }
  const params = new URLSearchParams();
  params.set("q", parsed.data.q);
  if (parsed.data.medicineId) {
    params.set("medicineId", parsed.data.medicineId);
  }
  if (parsed.data.medicinePackId) {
    params.set("medicinePackId", parsed.data.medicinePackId);
  }
  if (parsed.data.organizationId) {
    params.set("organizationId", parsed.data.organizationId);
  }
  if (parsed.data.stockStatus) {
    params.set("stockStatus", parsed.data.stockStatus);
  }
  if (parsed.data.minPrice) {
    params.set("minPrice", parsed.data.minPrice);
  }
  if (parsed.data.maxPrice) {
    params.set("maxPrice", parsed.data.maxPrice);
  }
  params.set("page", String(parsed.data.page));
  params.set("pageSize", String(parsed.data.pageSize));
  const path = `/listings?${params.toString()}`;
  return { ok: true, path };
}

export function comparisonView(listing: {
  distributor: { name: string };
  medicine: { displayName: string };
  pack: { description: string };
  currency: string;
  unitPrice: string;
  minimumOrderQuantity: string;
  stockStatus: string;
  availableQuantity: string | null;
  priceFreshness: string;
  stockFreshness: string;
}): {
  distributor: string;
  medicine: string;
  pack: string;
  priceLabel: string;
  minimumOrderQuantity: string;
  stockStatus: string;
  availableQuantity: string;
  priceFreshness: string;
  stockFreshness: string;
  recommendation: false;
  stockGuaranteed: false;
} {
  return {
    distributor: listing.distributor.name,
    medicine: listing.medicine.displayName,
    pack: listing.pack.description,
    priceLabel: `Indicative ${listing.currency} ${listing.unitPrice}`,
    minimumOrderQuantity: listing.minimumOrderQuantity,
    stockStatus: listing.stockStatus,
    availableQuantity: listing.availableQuantity ?? "Not supplied",
    priceFreshness: listing.priceFreshness,
    stockFreshness: listing.stockFreshness,
    recommendation: false,
    stockGuaranteed: false,
  };
}

export function validateCreateEnquiry(input: {
  listingId: string;
  quantity: string;
  message: string;
}): { ok: true; body: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const quantity = Number(input.quantity.trim());
  const body: Record<string, unknown> = {
    listingId: input.listingId,
    requestedPackQuantity: Number.isInteger(quantity) ? quantity : input.quantity.trim(),
  };
  if (input.message.trim().length > 0) {
    body.message = input.message.trim();
  }
  const parsed = createEnquiryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, fieldErrors: issues(parsed.error.issues) };
  }
  const sent: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (requestBodyKeys.has(key)) {
      sent[key] = value;
    }
  }
  return { ok: true, body: sent };
}

export function enquiryCreateTarget(organizationId: string): string {
  return `/retailer/enquiries?organizationId=${encodeURIComponent(organizationId)}`;
}

export function enquiryCreatedPath(enquiryId: string): string {
  return `/app/enquiries/${enquiryId}?notice=created`;
}

export function submitLocked(pending: boolean): boolean {
  return pending;
}

export function enquiryListTarget(side: "retailer" | "distributor", organizationId: string, page = 1): string {
  const prefix = side === "retailer" ? "/retailer/enquiries" : "/distributor/enquiries";
  const params = new URLSearchParams();
  params.set("organizationId", organizationId);
  params.set("page", String(page));
  params.set("pageSize", "20");
  return `${prefix}?${params.toString()}`;
}

export function enquiryBelongsToOrganization(
  enquiry: { retailerOrganizationId: string; distributorOrganizationId: string },
  organizationId: string,
  side: "retailer" | "distributor",
): boolean {
  return side === "retailer"
    ? enquiry.retailerOrganizationId === organizationId
    : enquiry.distributorOrganizationId === organizationId;
}

export function enquiryDetailView(enquiry: {
  id: string;
  requestedPackQuantity: number;
  responseMessage: string | null;
  notice: string;
}): { reference: string; quantityLabel: string; hasResponse: boolean; presentedAsOrder: false; notice: string } {
  return {
    reference: enquiry.id,
    quantityLabel: `${enquiry.requestedPackQuantity} catalog packs`,
    hasResponse: enquiry.responseMessage !== null && enquiry.responseMessage.length > 0,
    presentedAsOrder: false,
    notice: enquiry.notice,
  };
}

export function canCloseEnquiry(status: EnquiryStatus): boolean {
  return status === "OPEN" || status === "RESPONDED";
}

export function canRespondToEnquiry(status: EnquiryStatus): boolean {
  return status === "OPEN";
}

export function validateEnquiryResponse(
  message: string,
): { ok: true; body: { message: string } } | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = respondEnquiryRequestSchema.safeParse({ message });
  if (!parsed.success) {
    return { ok: false, fieldErrors: issues(parsed.error.issues) };
  }
  return { ok: true, body: { message: parsed.data.message } };
}

function issues(items: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of items) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
