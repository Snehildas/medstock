import {
  distributorListingPageSchema,
  distributorListingSchema,
  retailerListingPageSchema,
  retailerListingSchema,
  type DistributorListingPage,
  type DistributorListingResponse,
  type RetailerListing,
  type RetailerListingPage,
} from "@medstock/shared-types";
import { formatDecimal } from "../catalog/search-text.js";
import { freshnessFor, type ListingRecord } from "./listing.service.js";

export function toRetailerListing(listing: ListingRecord, now = new Date()): RetailerListing {
  const freshness = freshnessFor(listing, now);
  return retailerListingSchema.parse({
    id: listing.id,
    priceIsIndicative: true,
    unitPrice: formatMoney(listing.unitPrice),
    currency: listing.currency,
    minimumOrderQuantity: formatDecimal(listing.minimumOrderQuantity),
    stockStatus: listing.stockStatus,
    availableQuantity:
      listing.availableQuantity == null ? null : formatDecimal(listing.availableQuantity),
    priceFreshness: freshness.priceFreshness,
    stockFreshness: freshness.stockFreshness,
    priceUpdatedAt: listing.priceUpdatedAt?.toISOString() ?? null,
    stockUpdatedAt: listing.stockUpdatedAt?.toISOString() ?? null,
    source: listing.source,
    distributor: { id: listing.organization.id, name: listing.organization.name },
    pack: {
      id: listing.medicinePack.id,
      description: listing.medicinePack.description,
      quantity: formatDecimal(listing.medicinePack.quantity),
      unit: listing.medicinePack.unit,
    },
    medicine: {
      id: listing.medicinePack.medicine.id,
      displayName: listing.medicinePack.medicine.displayName,
      brandName: listing.medicinePack.medicine.brandName,
      genericName: listing.medicinePack.medicine.genericName,
      dosageForm: listing.medicinePack.medicine.dosageForm,
    },
  });
}

export function toDistributorListing(listing: ListingRecord, now = new Date()): DistributorListingResponse {
  return distributorListingSchema.parse({
    ...toRetailerListing(listing, now),
    status: listing.status,
    sourceNote: listing.sourceNote,
    organizationId: listing.organizationId,
  });
}

export function toRetailerPage(
  page: { items: ListingRecord[]; page: number; pageSize: number; total: number },
  now = new Date(),
): RetailerListingPage {
  return retailerListingPageSchema.parse({
    ...page,
    items: page.items.map((listing) => toRetailerListing(listing, now)),
  });
}

export function toDistributorPage(
  page: { items: ListingRecord[]; page: number; pageSize: number; total: number },
  now = new Date(),
): DistributorListingPage {
  return distributorListingPageSchema.parse({
    ...page,
    items: page.items.map((listing) => toDistributorListing(listing, now)),
  });
}

function formatMoney(value: { toString(): string }): string {
  const [whole, fraction = ""] = value.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
