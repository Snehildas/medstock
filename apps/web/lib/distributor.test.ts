import assert from "node:assert/strict";
import test from "node:test";
import { interpretHttpError } from "./api-client.ts";
import {
  changedListingUpdate,
  commitOutcome,
  distributorAccess,
  importActions,
  importRowView,
  listingActions,
  listingQuery,
  organizationStillSelected,
  shouldDiscardWorkspace,
  uploadCommitsImport,
  validateCreateListing,
} from "./distributor.ts";

const packId = "00000000-0000-4000-8000-000000000010";

test("distributor features are blocked for other organization types", () => {
  assert.equal(distributorAccess("DISTRIBUTOR"), "allowed");
  assert.equal(distributorAccess("RETAILER"), "blocked");
  assert.equal(distributorAccess("PLATFORM"), "blocked");
  assert.equal(distributorAccess(undefined), "blocked");
});

test("a changed organization does not keep the previous selection", () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  assert.equal(organizationStillSelected(first, first), true);
  assert.equal(organizationStillSelected(first, second), false);
  assert.equal(organizationStillSelected("", first), false);
  assert.equal(shouldDiscardWorkspace(first, second), true);
  assert.equal(shouldDiscardWorkspace(first, first), false);
  assert.equal(shouldDiscardWorkspace(null, first), false);
});

test("listing queries name the organization and never send a role or user id", () => {
  const path = listingQuery({
    organizationId: "00000000-0000-4000-8000-000000000003",
    q: "para",
    status: "ACTIVE",
    stockStatus: "IN_STOCK",
    page: 2,
  });
  assert.match(path, /^\/distributor\/listings\?/);
  assert.match(path, /organizationId=00000000-0000-4000-8000-000000000003/);
  assert.match(path, /q=para/);
  assert.equal(path.includes("role"), false);
  assert.equal(path.includes("userId"), false);
});

test("create validation reports field errors and accepts a complete listing", () => {
  const invalid = validateCreateListing({
    medicinePackId: "",
    unitPrice: "-1",
    minimumOrderQuantity: "0",
    stockStatus: "PLENTY",
    availableQuantity: "",
    sourceNote: "",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.fieldErrors.unitPrice);
    assert.ok(invalid.fieldErrors.minimumOrderQuantity);
    assert.ok(invalid.fieldErrors.stockStatus);
  }
  const valid = validateCreateListing({
    medicinePackId: packId,
    unitPrice: "12.50",
    minimumOrderQuantity: "2",
    stockStatus: "IN_STOCK",
    availableQuantity: "4",
    sourceNote: "counter",
  });
  assert.equal(valid.ok, true);
});

test("pause and resume follow the listing lifecycle", () => {
  assert.deepEqual(listingActions("ACTIVE"), {
    canEdit: true,
    canPause: true,
    canResume: false,
    canArchive: true,
  });
  assert.deepEqual(listingActions("PAUSED"), {
    canEdit: true,
    canPause: false,
    canResume: true,
    canArchive: true,
  });
  assert.equal(listingActions("ARCHIVED").canEdit, false);
  assert.equal(listingActions("SUSPENDED").canPause, false);
  assert.equal(listingActions("SUSPENDED").canResume, false);
});

test("an update sends only changed commercial fields", () => {
  const unchanged = changedListingUpdate(
    {
      unitPrice: "10",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN",
      availableQuantity: null,
      sourceNote: null,
    },
    {
      unitPrice: "10",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN",
      availableQuantity: "",
      sourceNote: "",
      clearAvailableQuantity: false,
    },
  );
  assert.equal(unchanged.ok, false);
  const changed = changedListingUpdate(
    {
      unitPrice: "10",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN",
      availableQuantity: "5",
      sourceNote: null,
    },
    {
      unitPrice: "11",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN",
      availableQuantity: "",
      sourceNote: "",
      clearAvailableQuantity: false,
    },
  );
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.deepEqual(changed.body, { unitPrice: "11" });
  }
});

test("upload previews only, and commit or cancel follow the import status", () => {
  assert.equal(uploadCommitsImport(), false);
  assert.deepEqual(importActions("PREVIEW_READY"), { canCommit: true, canCancel: true });
  assert.deepEqual(importActions("COMMITTED"), { canCommit: false, canCancel: false });
  assert.deepEqual(importActions("CANCELLED"), { canCommit: false, canCancel: false });
  assert.equal(commitOutcome("COMMITTED"), "show-summary");
  assert.equal(commitOutcome("PREVIEW_READY"), "needs-commit");
});

test("invalid import rows keep errors and warnings separate from a create or update", () => {
  const invalid = importRowView({ errors: ["No canonical pack matches this row."], warnings: [], action: null });
  assert.deepEqual(invalid.errors, ["No canonical pack matches this row."]);
  assert.equal(invalid.effect, "Will not be imported");
  const warned = importRowView({
    errors: [],
    warnings: ["pack_description does not match the canonical pack and was ignored."],
    action: "UPDATE",
  });
  assert.equal(warned.effect, "Update listing");
  assert.equal(warned.warnings.length, 1);
});

test("401 and 403 responses stay user-facing", () => {
  const denied = interpretHttpError(403, {
    error: { code: "listing_forbidden", message: "You cannot change this listing." },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.message, "You cannot change this listing.");
  const invalid = interpretHttpError(400, {
    message: { fieldErrors: { unitPrice: ["Price is invalid."] }, formErrors: [] },
  });
  assert.equal(invalid.fieldErrors?.unitPrice, "Price is invalid.");
  const expired = interpretHttpError(401, { message: "Error at session secret" });
  assert.equal(expired.status, 401);
  assert.equal(expired.message.includes("secret"), false);
  assert.equal(invalid.message.includes("at "), false);
});
