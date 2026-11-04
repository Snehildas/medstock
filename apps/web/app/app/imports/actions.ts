"use server";

import { redirect } from "next/navigation";
import { listingImportSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess, importActions, organizationStillSelected } from "@/lib/distributor";

async function selectedImport(postedOrganizationId: string, importId: string) {
  const account = await loadAccountState(`/app/imports/${importId}`);
  if (account.organization.kind !== "selected") {
    redirect("/app");
  }
  const membership = account.organization.membership;
  if (
    distributorAccess(membership.organization.type) === "blocked" ||
    !organizationStillSelected(postedOrganizationId, membership.organizationId)
  ) {
    redirect(`/app/imports/${importId}?notice=organization`);
  }
  return membership;
}

export async function commitImport(formData: FormData): Promise<void> {
  const importId = String(formData.get("importId") ?? "");
  const membership = await selectedImport(String(formData.get("organizationId") ?? ""), importId);
  const current = await distributorApi(`/distributor/imports/${importId}`, listingImportSchema, {
    returnTo: `/app/imports/${importId}`,
  });
  if (!current.ok) {
    redirect(`/app/imports/${importId}?notice=rejected`);
  }
  if (current.data.organizationId !== membership.organizationId) {
    redirect(`/app/imports/${importId}?notice=organization`);
  }
  if (current.data.status === "COMMITTED") {
    redirect(`/app/imports/${importId}?notice=committed`);
  }
  if (!importActions(current.data.status).canCommit) {
    redirect(`/app/imports/${importId}?notice=terminal`);
  }
  const result = await distributorApi(`/distributor/imports/${importId}/commit`, listingImportSchema, {
    method: "POST",
    returnTo: `/app/imports/${importId}`,
  });
  if (!result.ok) {
    redirect(`/app/imports/${importId}?notice=rejected`);
  }
  redirect(`/app/imports/${importId}?notice=committed`);
}

export async function cancelImport(formData: FormData): Promise<void> {
  const importId = String(formData.get("importId") ?? "");
  const membership = await selectedImport(String(formData.get("organizationId") ?? ""), importId);
  if (formData.get("confirmCancel") !== "on") {
    redirect(`/app/imports/${importId}?notice=confirm-cancel`);
  }
  const current = await distributorApi(`/distributor/imports/${importId}`, listingImportSchema, {
    returnTo: `/app/imports/${importId}`,
  });
  if (!current.ok || current.data.organizationId !== membership.organizationId) {
    redirect(`/app/imports/${importId}?notice=rejected`);
  }
  if (!importActions(current.data.status).canCancel) {
    redirect(`/app/imports/${importId}?notice=terminal`);
  }
  const result = await distributorApi(`/distributor/imports/${importId}/cancel`, listingImportSchema, {
    method: "POST",
    returnTo: `/app/imports/${importId}`,
  });
  if (!result.ok) {
    redirect(`/app/imports/${importId}?notice=rejected`);
  }
  redirect(`/app/imports/${importId}?notice=cancelled`);
}
