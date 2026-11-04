"use server";

import { redirect } from "next/navigation";
import { enquiryResponseSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess, organizationStillSelected } from "@/lib/distributor";
import {
  canCloseEnquiry,
  canRespondToEnquiry,
  enquiryBelongsToOrganization,
  enquiryCreateTarget,
  enquiryCreatedPath,
  retailerAccess,
  validateCreateEnquiry,
  validateEnquiryResponse,
} from "@/lib/retailer";

export type FormState = {
  message: string | null;
  fieldErrors: Record<string, string>;
};

async function selectedSide(postedOrganizationId: string, returnTo: string, side: "retailer" | "distributor") {
  const account = await loadAccountState(returnTo);
  if (account.organization.kind !== "selected") {
    redirect("/app");
  }
  const membership = account.organization.membership;
  const allowed = side === "retailer" ? retailerAccess(membership.organization.type) : distributorAccess(membership.organization.type);
  if (allowed === "blocked" || !organizationStillSelected(postedOrganizationId, membership.organizationId)) {
    return null;
  }
  return membership;
}

export async function createEnquiryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const listingId = String(formData.get("listingId") ?? "");
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const membership = await selectedSide(postedOrganizationId, `/app/discover/listings/${listingId}`, "retailer");
  if (!membership) {
    return { message: "The selected organization changed. Reload this page before sending the enquiry.", fieldErrors: {} };
  }
  const parsed = validateCreateEnquiry({
    listingId,
    quantity: String(formData.get("requestedPackQuantity") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.ok) {
    return { message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const result = await distributorApi(enquiryCreateTarget(membership.organizationId), enquiryResponseSchema, {
    method: "POST",
    body: parsed.body,
    returnTo: `/app/discover/listings/${listingId}`,
  });
  if (!result.ok) {
    return { message: result.message, fieldErrors: result.fieldErrors ?? {} };
  }
  if (!enquiryBelongsToOrganization(result.data, membership.organizationId, "retailer")) {
    return { message: "The enquiry did not match the selected organization.", fieldErrors: {} };
  }
  redirect(enquiryCreatedPath(result.data.id));
}

export async function closeEnquiry(formData: FormData): Promise<void> {
  const enquiryId = String(formData.get("enquiryId") ?? "");
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const membership = await selectedSide(postedOrganizationId, `/app/enquiries/${enquiryId}`, "retailer");
  if (!membership) {
    redirect(`/app/enquiries/${enquiryId}?notice=organization`);
  }
  if (formData.get("confirmClose") !== "on") {
    redirect(`/app/enquiries/${enquiryId}?notice=confirm-close`);
  }
  const current = await distributorApi(`/retailer/enquiries/${enquiryId}`, enquiryResponseSchema, {
    returnTo: `/app/enquiries/${enquiryId}`,
  });
  if (!current.ok || !enquiryBelongsToOrganization(current.data, membership.organizationId, "retailer")) {
    redirect(`/app/enquiries/${enquiryId}?notice=rejected`);
  }
  if (!canCloseEnquiry(current.data.status)) {
    redirect(`/app/enquiries/${enquiryId}?notice=terminal`);
  }
  const result = await distributorApi(`/retailer/enquiries/${enquiryId}/close`, enquiryResponseSchema, {
    method: "POST",
    returnTo: `/app/enquiries/${enquiryId}`,
  });
  if (!result.ok) {
    redirect(`/app/enquiries/${enquiryId}?notice=rejected`);
  }
  redirect(`/app/enquiries/${enquiryId}?notice=closed`);
}

export async function respondToEnquiry(_previous: FormState, formData: FormData): Promise<FormState> {
  const enquiryId = String(formData.get("enquiryId") ?? "");
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const membership = await selectedSide(postedOrganizationId, `/app/enquiries/${enquiryId}`, "distributor");
  if (!membership) {
    return { message: "The selected organization changed. Reload this page before responding.", fieldErrors: {} };
  }
  const parsed = validateEnquiryResponse(String(formData.get("message") ?? ""));
  if (!parsed.ok) {
    return { message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const current = await distributorApi(`/distributor/enquiries/${enquiryId}`, enquiryResponseSchema, {
    returnTo: `/app/enquiries/${enquiryId}`,
  });
  if (!current.ok || !enquiryBelongsToOrganization(current.data, membership.organizationId, "distributor")) {
    return { message: current.ok ? "This enquiry is not for the selected organization." : current.message, fieldErrors: {} };
  }
  if (!canRespondToEnquiry(current.data.status)) {
    return { message: "This enquiry is no longer open.", fieldErrors: {} };
  }
  const result = await distributorApi(`/distributor/enquiries/${enquiryId}/respond`, enquiryResponseSchema, {
    method: "POST",
    body: parsed.body,
    returnTo: `/app/enquiries/${enquiryId}`,
  });
  if (!result.ok) {
    return { message: result.message, fieldErrors: result.fieldErrors ?? {} };
  }
  redirect(`/app/enquiries/${enquiryId}?notice=responded`);
}
