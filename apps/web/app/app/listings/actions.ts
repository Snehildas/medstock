"use server";

import { redirect } from "next/navigation";
import {
  distributorListingSchema,
  medicinePageSchema,
  medicineResponseSchema,
} from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import {
  changedListingUpdate,
  distributorAccess,
  organizationStillSelected,
  validateCreateListing,
} from "@/lib/distributor";

export type FormState = {
  message: string | null;
  fieldErrors: Record<string, string>;
};

async function selectedDistributor(postedOrganizationId: string, returnTo: string) {
  const account = await loadAccountState(returnTo);
  if (account.organization.kind !== "selected") {
    redirect("/app");
  }
  const membership = account.organization.membership;
  if (distributorAccess(membership.organization.type) === "blocked") {
    return { membership: null, message: "Listings are available for a distributor organization." };
  }
  if (!organizationStillSelected(postedOrganizationId, membership.organizationId)) {
    return {
      membership: null,
      message: "The selected organization changed. Reload this page before saving.",
    };
  }
  return { membership, message: null };
}

export async function searchCatalogAction(query: string): Promise<
  | { ok: true; items: Array<{ id: string; displayName: string; genericName: string; dosageForm: string }> }
  | { ok: false; message: string }
> {
  const account = await loadAccountState("/app/listings/new");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return { ok: false, message: "Choose a distributor organization before searching the catalog." };
  }
  const result = await distributorApi(
    `/catalog/medicines?${new URLSearchParams({ q: query, page: "1", pageSize: "10" }).toString()}`,
    medicinePageSchema,
    { returnTo: "/app/listings/new" },
  );
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true, items: result.data.items };
}

export async function loadMedicineAction(medicineId: string): Promise<
  | {
      ok: true;
      medicine: {
        displayName: string;
        genericName: string;
        dosageForm: string;
        compositions: Array<{ ingredientName: string; strengthValue: string; strengthUnit: string }>;
        packs: Array<{ id: string; description: string; quantity: string; unit: string }>;
      };
    }
  | { ok: false; message: string }
> {
  const result = await distributorApi(`/catalog/medicines/${medicineId}`, medicineResponseSchema, {
    returnTo: "/app/listings/new",
  });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    medicine: {
      displayName: result.data.displayName,
      genericName: result.data.genericName,
      dosageForm: result.data.dosageForm,
      compositions: result.data.compositions,
      packs: result.data.packs,
    },
  };
}

export async function createListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const selected = await selectedDistributor(postedOrganizationId, "/app/listings/new");
  if (!selected.membership) {
    return { message: selected.message, fieldErrors: {} };
  }
  const parsed = validateCreateListing({
    medicinePackId: String(formData.get("medicinePackId") ?? ""),
    unitPrice: String(formData.get("unitPrice") ?? ""),
    minimumOrderQuantity: String(formData.get("minimumOrderQuantity") ?? ""),
    stockStatus: String(formData.get("stockStatus") ?? ""),
    availableQuantity: String(formData.get("availableQuantity") ?? ""),
    sourceNote: String(formData.get("sourceNote") ?? ""),
  });
  if (!parsed.ok) {
    return { message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const result = await distributorApi(
    `/distributor/listings?organizationId=${selected.membership.organizationId}`,
    distributorListingSchema,
    { method: "POST", body: parsed.body, returnTo: "/app/listings/new" },
  );
  if (!result.ok) {
    return {
      message: result.message,
      fieldErrors: result.fieldErrors ?? {},
    };
  }
  redirect(`/app/listings/${result.data.id}?notice=created`);
}

export async function updateListingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const listingId = String(formData.get("listingId") ?? "");
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const selected = await selectedDistributor(postedOrganizationId, `/app/listings/${listingId}`);
  if (!selected.membership) {
    return { message: selected.message, fieldErrors: {} };
  }
  const parsed = changedListingUpdate(
    {
      unitPrice: String(formData.get("currentUnitPrice") ?? ""),
      minimumOrderQuantity: String(formData.get("currentMinimumOrderQuantity") ?? ""),
      stockStatus: String(formData.get("currentStockStatus") ?? ""),
      availableQuantity: optionalText(formData.get("currentAvailableQuantity")),
      sourceNote: optionalText(formData.get("currentSourceNote")),
    },
    {
      unitPrice: String(formData.get("unitPrice") ?? ""),
      minimumOrderQuantity: String(formData.get("minimumOrderQuantity") ?? ""),
      stockStatus: String(formData.get("stockStatus") ?? ""),
      availableQuantity: String(formData.get("availableQuantity") ?? ""),
      sourceNote: String(formData.get("sourceNote") ?? ""),
      clearAvailableQuantity: formData.get("clearAvailableQuantity") === "on",
    },
  );
  if (!parsed.ok) {
    return { message: parsed.fieldErrors.form ?? "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const result = await distributorApi(`/distributor/listings/${listingId}`, distributorListingSchema, {
    method: "PATCH",
    body: parsed.body,
    returnTo: `/app/listings/${listingId}`,
  });
  if (!result.ok) {
    return { message: result.message, fieldErrors: result.fieldErrors ?? {} };
  }
  redirect(`/app/listings/${listingId}?notice=saved`);
}

export async function transitionListing(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  const action = String(formData.get("action") ?? "");
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const selected = await selectedDistributor(postedOrganizationId, `/app/listings/${listingId}`);
  if (!selected.membership) {
    redirect(`/app/listings/${listingId}?notice=organization`);
  }
  if (action === "archive" && formData.get("confirmArchive") !== "on") {
    redirect(`/app/listings/${listingId}?notice=confirm-archive`);
  }
  if (action !== "pause" && action !== "resume" && action !== "archive") {
    redirect(`/app/listings/${listingId}?notice=rejected`);
  }
  const result = await distributorApi(`/distributor/listings/${listingId}/${action}`, distributorListingSchema, {
    method: "POST",
    returnTo: `/app/listings/${listingId}`,
  });
  if (!result.ok) {
    redirect(`/app/listings/${listingId}?notice=rejected`);
  }
  redirect(`/app/listings/${listingId}?notice=${action}`);
}

function optionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}
