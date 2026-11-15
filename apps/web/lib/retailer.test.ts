import assert from "node:assert/strict";
import test from "node:test";
import { interpretHttpError } from "./api-client.ts";
import { shouldDiscardWorkspace } from "./distributor.ts";
import {
  canCloseEnquiry,
  canRespondToEnquiry,
  catalogSearchState,
  comparisonView,
  enquiryBelongsToOrganization,
  enquiryCreateTarget,
  enquiryCreatedPath,
  enquiryDetailView,
  enquiryListTarget,
  retailerAccess,
  retailerListingSearch,
  medicineSearchPresentation,
  phoneHref,
  searchResultView,
  wholesalerDirectoryState,
  submitLocked,
  validateCreateEnquiry,
  validateEnquiryResponse,
} from "./retailer.ts";

const retailerId = "00000000-0000-4000-8000-000000000010";
const distributorId = "00000000-0000-4000-8000-000000000020";
const listingId = "00000000-0000-4000-8000-000000000030";
const medicineId = "00000000-0000-4000-8000-000000000040";
const packId = "00000000-0000-4000-8000-000000000050";

test("retailer and distributor features stay on their own organization types", () => {
  assert.equal(retailerAccess("RETAILER"), "allowed");
  assert.equal(retailerAccess("DISTRIBUTOR"), "blocked");
  assert.equal(retailerAccess("PLATFORM"), "blocked");
  assert.equal(retailerAccess(undefined), "blocked");
});

test("medicine search shows the name, salts, strength, and wholesaler link", () => {
  const medicineId = "00000000-0000-4000-8000-0000000000b1";
  const combined = medicineSearchPresentation({
    id: medicineId,
    displayName: "Augmentin 625",
    brandName: "Augmentin",
    dosageForm: "Tablet",
    compositions: [
      { ingredientName: "Amoxicillin", strengthValue: "500", strengthUnit: "MG" },
      { ingredientName: "Clavulanic Acid", strengthValue: "125", strengthUnit: "MG" },
    ],
    eligibleWholesalerCount: 2,
  });
  assert.equal(combined.name, "Augmentin 625");
  assert.equal(combined.salts, "Amoxicillin + Clavulanic Acid");
  assert.equal(combined.salts?.includes("Augmentin"), false);
  assert.equal(combined.strength, "500 MG + 125 MG · Tablet");
  assert.equal(combined.wholesalerHref, `/app/discover/medicines/${medicineId}/wholesalers`);
  assert.equal(combined.wholesalerCount, 2);
  const missing = medicineSearchPresentation({
    id: medicineId,
    displayName: "Plain Tablet",
    brandName: "Plain Tablet",
    dosageForm: "Tablet",
    compositions: [],
    eligibleWholesalerCount: 0,
  });
  assert.equal(missing.salts, null);
  assert.equal(missing.strength, "Tablet");
  assert.equal(wholesalerDirectoryState(0), "empty");
  assert.equal(wholesalerDirectoryState(1), "results");
  assert.equal(phoneHref("+919812345678"), "tel:+919812345678");
  assert.equal(phoneHref(null), null);
});

test("catalog search distinguishes a prompt, loading, an error, no results, and results", () => {
  assert.equal(catalogSearchState({ query: "  ", phase: "ready", total: 3 }), "prompt");
  assert.equal(catalogSearchState({ query: "para", phase: "loading", total: 0 }), "loading");
  assert.equal(catalogSearchState({ query: "para", phase: "error", total: 0 }), "error");
  assert.equal(catalogSearchState({ query: "para", phase: "ready", total: 0 }), "empty");
  assert.equal(catalogSearchState({ query: "para", phase: "ready", total: 2 }), "results");
  const view = searchResultView({
    displayName: "Para 500",
    dosageForm: "Tablet",
    compositions: [{ ingredientName: "Paracetamol", strengthValue: "500", strengthUnit: "MG" }],
    packs: [{ id: packId, description: "Strip of 10", quantity: "10", unit: "TABLET" }],
  });
  assert.deepEqual(view.composition, ["Paracetamol 500 MG"]);
  assert.deepEqual(view.packs, ["Strip of 10 · 10 TABLET"]);
  assert.equal(view.advice, false);
});

test("listing comparison keeps indicative price and does not recommend or guarantee stock", () => {
  const filters = retailerListingSearch({
    q: "para",
    medicineId,
    medicinePackId: packId,
    distributorOrganizationId: distributorId,
    stockStatus: "IN_STOCK",
    minPrice: "1",
    maxPrice: "20",
    page: 2,
  });
  assert.equal(filters.ok, true);
  if (filters.ok) {
    assert.match(filters.path, /^\/listings\?/);
    assert.match(filters.path, /medicineId=/);
    assert.match(filters.path, /organizationId=/);
    assert.equal(filters.path.includes("role"), false);
    assert.equal(filters.path.includes("userId"), false);
    assert.equal(filters.path.includes(retailerId), false);
  }
  const invalid = retailerListingSearch({ minPrice: "30", maxPrice: "10" });
  assert.equal(invalid.ok, false);
  const row = comparisonView({
    distributor: { name: "North Depot" },
    medicine: { displayName: "Para 500" },
    pack: { description: "Strip of 10" },
    currency: "INR",
    unitPrice: "12.50",
    minimumOrderQuantity: "2",
    stockStatus: "UNKNOWN",
    availableQuantity: null,
    priceFreshness: "STALE",
    stockFreshness: "UNKNOWN",
  });
  assert.equal(row.priceLabel, "Indicative INR 12.50");
  assert.equal(row.priceFreshness, "STALE");
  assert.equal(row.stockFreshness, "UNKNOWN");
  assert.equal(row.availableQuantity, "Not supplied");
  assert.equal(row.recommendation, false);
  assert.equal(row.stockGuaranteed, false);
  assert.equal("sourceNote" in row, false);
});

test("an enquiry body names the listing and catalog-pack quantity only", () => {
  const invalid = validateCreateEnquiry({ listingId: "", quantity: "0", message: "" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.fieldErrors.requestedPackQuantity);
  }
  const valid = validateCreateEnquiry({
    listingId,
    quantity: "3",
    message: "  Need this week  ",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(Object.keys(valid.body).sort(), ["listingId", "message", "requestedPackQuantity"]);
    assert.equal(valid.body.requestedPackQuantity, 3);
    assert.equal("role" in valid.body, false);
    assert.equal("userId" in valid.body, false);
    assert.equal("organizationId" in valid.body, false);
  }
  assert.equal(enquiryCreateTarget(retailerId), `/retailer/enquiries?organizationId=${retailerId}`);
  assert.equal(enquiryCreatedPath(listingId), `/app/enquiries/${listingId}?notice=created`);
  assert.equal(submitLocked(true), true);
  assert.equal(submitLocked(false), false);
});

test("retailer history stays on the selected organization and close follows status", () => {
  const path = enquiryListTarget("retailer", retailerId, 2);
  assert.match(path, /^\/retailer\/enquiries\?/);
  assert.match(path, new RegExp(retailerId));
  assert.equal(path.includes("role"), false);
  const other = "00000000-0000-4000-8000-000000000099";
  const enquiry = {
    id: "00000000-0000-4000-8000-000000000060",
    retailerOrganizationId: retailerId,
    distributorOrganizationId: distributorId,
    requestedPackQuantity: 4,
    responseMessage: "We can discuss this.",
    notice: "This is an enquiry only. It is not an order, quote, or stock reservation.",
  };
  assert.equal(enquiryBelongsToOrganization(enquiry, retailerId, "retailer"), true);
  assert.equal(enquiryBelongsToOrganization(enquiry, other, "retailer"), false);
  const detail = enquiryDetailView(enquiry);
  assert.equal(detail.quantityLabel, "4 catalog packs");
  assert.equal(detail.hasResponse, true);
  assert.equal(detail.presentedAsOrder, false);
  assert.match(detail.notice, /not an order/i);
  assert.equal(canCloseEnquiry("OPEN"), true);
  assert.equal(canCloseEnquiry("RESPONDED"), true);
  assert.equal(canCloseEnquiry("CLOSED"), false);
});

test("distributor replies are limited to an open enquiry for that organization", () => {
  const path = enquiryListTarget("distributor", distributorId);
  assert.match(path, /^\/distributor\/enquiries\?/);
  assert.equal(path.includes("userId"), false);
  const enquiry = {
    retailerOrganizationId: retailerId,
    distributorOrganizationId: distributorId,
  };
  assert.equal(enquiryBelongsToOrganization(enquiry, distributorId, "distributor"), true);
  assert.equal(enquiryBelongsToOrganization(enquiry, retailerId, "distributor"), false);
  assert.equal(canRespondToEnquiry("OPEN"), true);
  assert.equal(canRespondToEnquiry("RESPONDED"), false);
  assert.equal(canRespondToEnquiry("CLOSED"), false);
  const empty = validateEnquiryResponse("   ");
  assert.equal(empty.ok, false);
  const message = validateEnquiryResponse("Available against the next order cycle.");
  assert.equal(message.ok, true);
  if (message.ok) {
    assert.deepEqual(message.body, { message: "Available against the next order cycle." });
  }
  assert.equal(shouldDiscardWorkspace(retailerId, distributorId), true);
});

test("enquiry 401 and 403 responses stay user-facing", () => {
  const denied = interpretHttpError(403, {
    error: { code: "enquiry_forbidden", message: "You cannot read this enquiry." },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.message, "You cannot read this enquiry.");
  const expired = interpretHttpError(401, { message: "Error at session secret" });
  assert.equal(expired.message.includes("secret"), false);
  const invalid = interpretHttpError(400, {
    message: { fieldErrors: { requestedPackQuantity: ["Quantity must be a whole number."] }, formErrors: [] },
  });
  assert.equal(invalid.fieldErrors?.requestedPackQuantity, "Quantity must be a whole number.");
});
