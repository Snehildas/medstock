import assert from "node:assert/strict";
import test from "node:test";
import {
  distributorProfileSchema,
  enquiryPageSchema,
  medicinePageSchema,
  medicineResponseSchema,
  medicineSubmissionPageSchema,
  retailerListingPageSchema,
  wholesalerPageSchema,
} from "@medstock/shared-types";
import { decideRequest } from "./route-guard.ts";
import { assertProductionWebConfig } from "./production-config.ts";
import {
  PREVIEW_DISTRIBUTOR_ID,
  PREVIEW_RETAILER_ID,
  previewApiResult,
  previewCurrentUser,
  previewOrganizationId,
} from "./preview-data.ts";
import { localPreviewAllowed } from "./preview-mode.ts";

test("preview mode is explicit and refused in production", () => {
  assert.equal(localPreviewAllowed({ NODE_ENV: "development" }), false);
  assert.equal(localPreviewAllowed({ NODE_ENV: "development", MEDSTOCK_LOCAL_PREVIEW: "false" }), false);
  assert.equal(localPreviewAllowed({ NODE_ENV: "development", MEDSTOCK_LOCAL_PREVIEW: "true" }), true);
  assert.equal(localPreviewAllowed({ NODE_ENV: "production", MEDSTOCK_LOCAL_PREVIEW: "true" }), false);
  assert.throws(() =>
    assertProductionWebConfig({ NODE_ENV: "production", MEDSTOCK_LOCAL_PREVIEW: "true" }),
  );
  assert.equal(decideRequest("/app", undefined).kind, "redirect");
  assert.equal(decideRequest("/app", undefined, true).kind, "continue");
});

test("preview identity is labeled mock data and only accepts the two preview organizations", () => {
  assert.match(previewCurrentUser.email, /preview/i);
  assert.match(previewCurrentUser.name ?? "", /mock/i);
  assert.equal(previewOrganizationId(undefined), PREVIEW_RETAILER_ID);
  assert.equal(previewOrganizationId("00000000-0000-4000-8000-000000000099"), PREVIEW_RETAILER_ID);
  assert.equal(previewOrganizationId(PREVIEW_DISTRIBUTOR_ID), PREVIEW_DISTRIBUTOR_ID);
  assert.equal(previewCurrentUser.memberships.some((membership) => membership.organization.type === "RETAILER"), true);
  assert.equal(
    previewCurrentUser.memberships.some((membership) => membership.organization.type === "DISTRIBUTOR"),
    true,
  );
});

test("preview reads return mock catalog data and writes do not succeed", () => {
  const search = previewApiResult(
    "/catalog/medicines?q=paracetamol&page=1&pageSize=10",
    medicinePageSchema,
    "GET",
  );
  assert.equal(search.ok, true);
  if (search.ok) {
    assert.equal(search.data.total, 1);
    const detail = previewApiResult(`/catalog/medicines/${search.data.items[0]?.id}`, medicineResponseSchema, "GET");
    assert.equal(detail.ok, true);
    if (detail.ok) {
      assert.ok(detail.data.compositions.length > 0);
      assert.ok(detail.data.packs.length > 1);
    }
  }
  const listings = previewApiResult("/listings?q=&page=1&pageSize=20", retailerListingPageSchema, "GET");
  assert.equal(listings.ok, true);
  if (listings.ok) {
    const prices = new Set(listings.data.items.map((item) => item.unitPrice));
    const stock = new Set(listings.data.items.map((item) => item.stockStatus));
    assert.ok(prices.size > 1);
    assert.ok(stock.size > 1);
  }
  const enquiries = previewApiResult(
    `/retailer/enquiries?organizationId=${PREVIEW_RETAILER_ID}&page=1&pageSize=20`,
    enquiryPageSchema,
    "GET",
  );
  assert.equal(enquiries.ok, true);
  const directory = previewApiResult(
    `/retailer/medicines/${search.ok ? search.data.items[0]?.id : ""}/wholesalers?page=1&pageSize=20`,
    wholesalerPageSchema,
    "GET",
  );
  assert.equal(directory.ok, true);
  if (directory.ok) {
    assert.ok(directory.data.eligibleWholesalerCount > 1);
    assert.ok(directory.data.items.some((item) => item.contact?.proprietorName.includes("mock")));
    assert.ok(directory.data.items.some((item) => item.contact === null));
    assert.equal(JSON.stringify(directory.data).includes("00000000-0000-4000-8000-000000000e04"), false);
  }
  const empty = previewApiResult(
    "/retailer/medicines/00000000-0000-4000-8000-000000000b02/wholesalers?page=1&pageSize=20",
    wholesalerPageSchema,
    "GET",
  );
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.data.total, 0);
  }
  const profileWrite = previewApiResult(
    `/distributor/profile?organizationId=${PREVIEW_DISTRIBUTOR_ID}`,
    distributorProfileSchema,
    "PATCH",
  );
  assert.equal(profileWrite.ok, false);
  if (!profileWrite.ok) {
    assert.equal(profileWrite.code, "preview_read_only");
  }
  const submissions = previewApiResult(
    `/distributor/medicine-submissions?organizationId=${PREVIEW_DISTRIBUTOR_ID}&page=1&pageSize=20`,
    medicineSubmissionPageSchema,
    "GET",
  );
  assert.equal(submissions.ok, true);
  if (submissions.ok) {
    const statuses = submissions.data.items.map((item) => item.status).sort();
    assert.deepEqual(statuses, ["APPROVED", "PENDING_REVIEW", "REJECTED"]);
    assert.ok(submissions.data.items.every((item) => item.displayName.toLowerCase().includes("mock")));
    const pending = submissions.data.items.find((item) => item.status === "PENDING_REVIEW");
    assert.equal(pending?.indicativeUnitPrice, "18.50");
    assert.equal(pending?.minimumOrderQuantity, "4");
  }
  const otherOrg = previewApiResult(
    "/distributor/medicine-submissions?organizationId=00000000-0000-4000-8000-000000000a12&page=1&pageSize=20",
    medicineSubmissionPageSchema,
    "GET",
  );
  assert.equal(otherOrg.ok, true);
  if (otherOrg.ok) {
    assert.equal(otherOrg.data.total, 0);
  }
  const submissionWrite = previewApiResult(
    `/distributor/medicine-submissions?organizationId=${PREVIEW_DISTRIBUTOR_ID}`,
    medicineSubmissionPageSchema,
    "POST",
  );
  assert.equal(submissionWrite.ok, false);
  if (!submissionWrite.ok) {
    assert.equal(submissionWrite.code, "preview_read_only");
  }
  const denied = previewApiResult("/distributor/listings", retailerListingPageSchema, "POST");
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.status, 403);
  }
});
