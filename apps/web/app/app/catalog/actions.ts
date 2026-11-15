"use server";

import { redirect } from "next/navigation";
import { createMedicineSubmissionSchema, medicineSubmissionSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess, organizationStillSelected } from "@/lib/distributor";
import { localPreviewAllowed } from "@/lib/preview-mode";

export type SubmissionFormState = {
  message: string | null;
  fieldErrors: Record<string, string>;
};

export async function submitMedicineAction(
  _previous: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const postedOrganizationId = String(formData.get("organizationId") ?? "");
  const account = await loadAccountState("/app/catalog/submit");
  if (account.organization.kind !== "selected") {
    redirect("/app");
  }
  const membership = account.organization.membership;
  if (distributorAccess(membership.organization.type) === "blocked") {
    return { message: "Medicine submissions are available for a distributor organization.", fieldErrors: {} };
  }
  if (!organizationStillSelected(postedOrganizationId, membership.organizationId)) {
    return { message: "The selected organization changed. Reload this page before submitting.", fieldErrors: {} };
  }
  const ingredientCount = Number(formData.get("ingredientCount") ?? 0);
  const packCount = Number(formData.get("packCount") ?? 0);
  const ingredients = Array.from({ length: ingredientCount }, (_, index) => ({
    ingredientName: String(formData.get(`ingredientName${index}`) ?? ""),
    kind: String(formData.get(`ingredientKind${index}`) ?? ""),
    strengthValue: String(formData.get(`strengthValue${index}`) ?? ""),
    strengthUnit: String(formData.get(`strengthUnit${index}`) ?? ""),
    basis: optional(formData.get(`basis${index}`)),
  }));
  const packs = Array.from({ length: packCount }, (_, index) => ({
    description: String(formData.get(`packDescription${index}`) ?? ""),
    quantity: String(formData.get(`packQuantity${index}`) ?? ""),
    unit: String(formData.get(`packUnit${index}`) ?? ""),
  }));
  const body = {
    displayName: String(formData.get("displayName") ?? ""),
    brandName: optional(formData.get("brandName")),
    genericName: optional(formData.get("genericName")),
    dosageForm: String(formData.get("dosageForm") ?? ""),
    presentation: optional(formData.get("presentation")),
    manufacturerName: optional(formData.get("manufacturerName")),
    marketerName: optional(formData.get("marketerName")),
    indicativeUnitPrice: String(formData.get("indicativeUnitPrice") ?? "").trim(),
    minimumOrderQuantity: String(formData.get("minimumOrderQuantity") ?? "").trim(),
    stockStatus: String(formData.get("stockStatus") ?? "UNKNOWN"),
    availableQuantity: optional(formData.get("availableQuantity")),
    sourceNote: optional(formData.get("sourceNote")),
    ingredients,
    packs,
  };
  const parsed = createMedicineSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Check the medicine details.", fieldErrors: {} };
  }
  if (localPreviewAllowed(process.env)) {
    redirect("/app/catalog/submissions/00000000-0000-4000-8000-000000000f21?notice=submitted");
  }
  const result = await distributorApi(
    `/distributor/medicine-submissions?organizationId=${membership.organizationId}`,
    medicineSubmissionSchema,
    {
      method: "POST",
      returnTo: "/app/catalog/submit",
      body: parsed.data,
    },
  );
  if (!result.ok) {
    return { message: result.message, fieldErrors: result.fieldErrors ?? {} };
  }
  redirect(`/app/catalog/submissions/${result.data.id}?notice=submitted`);
}

function optional(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}
