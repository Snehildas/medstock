import {
  adminEnquiryPageSchema,
  adminEnquiryResponseSchema,
  enquiryPageSchema,
  enquiryResponseSchema,
  type AdminEnquiryPage,
  type AdminEnquiryResponse,
  type EnquiryPage,
  type EnquiryResponse,
} from "@medstock/shared-types";
import type { EnquiryRecord } from "./enquiry.service.js";

const ENQUIRY_NOTICE =
  "This is an enquiry only. It is not an order, quote, or stock reservation." as const;

function base(enquiry: EnquiryRecord) {
  return {
    kind: "enquiry" as const,
    notice: ENQUIRY_NOTICE,
    id: enquiry.id,
    status: enquiry.status,
    requestedPackQuantity: enquiry.requestedQuantity,
    quantityMeaning: "catalog_packs" as const,
    message: enquiry.message,
    responseMessage: enquiry.responseMessage,
    respondedAt: enquiry.respondedAt?.toISOString() ?? null,
    createdAt: enquiry.createdAt.toISOString(),
    updatedAt: enquiry.updatedAt.toISOString(),
    listingId: enquiry.listingId,
    medicineName: enquiry.listing.medicinePack.medicine.displayName,
    packDescription: enquiry.listing.medicinePack.description,
    retailerOrganizationId: enquiry.retailerOrganizationId,
    distributorOrganizationId: enquiry.distributorOrganizationId,
  };
}

export function toRetailerEnquiry(enquiry: EnquiryRecord): EnquiryResponse {
  return enquiryResponseSchema.parse({
    ...base(enquiry),
    counterpartyName: enquiry.distributorOrganization.name,
  });
}

export function toDistributorEnquiry(enquiry: EnquiryRecord): EnquiryResponse {
  return enquiryResponseSchema.parse({
    ...base(enquiry),
    counterpartyName: enquiry.retailerOrganization.name,
  });
}

export function toAdminEnquiry(enquiry: EnquiryRecord): AdminEnquiryResponse {
  return adminEnquiryResponseSchema.parse({
    ...base(enquiry),
    retailerName: enquiry.retailerOrganization.name,
    distributorName: enquiry.distributorOrganization.name,
  });
}

export function toEnquiryPage(
  page: { items: EnquiryRecord[]; page: number; pageSize: number; total: number },
  mapItem: (enquiry: EnquiryRecord) => EnquiryResponse,
): EnquiryPage {
  return enquiryPageSchema.parse({ ...page, items: page.items.map(mapItem) });
}

export function toAdminPage(page: {
  items: EnquiryRecord[];
  page: number;
  pageSize: number;
  total: number;
}): AdminEnquiryPage {
  return adminEnquiryPageSchema.parse({
    ...page,
    items: page.items.map(toAdminEnquiry),
  });
}
