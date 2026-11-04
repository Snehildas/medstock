import { createListingRequestSchema, updateListingRequestSchema } from "@medstock/shared-types";

export type ListingLifecycle = "ACTIVE" | "PAUSED" | "ARCHIVED" | "SUSPENDED";
export type ImportLifecycle = "PREVIEW_READY" | "COMMITTED" | "FAILED" | "CANCELLED";

export function distributorAccess(organizationType: string | undefined): "allowed" | "blocked" {
  return organizationType === "DISTRIBUTOR" ? "allowed" : "blocked";
}

export function organizationStillSelected(postedOrganizationId: string, currentOrganizationId: string): boolean {
  return postedOrganizationId.length > 0 && postedOrganizationId === currentOrganizationId;
}

export function shouldDiscardWorkspace(previousOrganizationId: string | null, nextOrganizationId: string | null): boolean {
  return previousOrganizationId !== null && previousOrganizationId !== nextOrganizationId;
}

export function listingActions(status: ListingLifecycle): {
  canEdit: boolean;
  canPause: boolean;
  canResume: boolean;
  canArchive: boolean;
} {
  return {
    canEdit: status === "ACTIVE" || status === "PAUSED",
    canPause: status === "ACTIVE",
    canResume: status === "PAUSED",
    canArchive: status === "ACTIVE" || status === "PAUSED",
  };
}

export function importActions(status: ImportLifecycle): { canCommit: boolean; canCancel: boolean } {
  return {
    canCommit: status === "PREVIEW_READY",
    canCancel: status === "PREVIEW_READY",
  };
}

export function uploadCommitsImport(): false {
  return false;
}

export function listingQuery(input: {
  organizationId: string;
  q?: string;
  status?: string;
  stockStatus?: string;
  page?: number;
}): string {
  const params = new URLSearchParams();
  params.set("organizationId", input.organizationId);
  const text = input.q?.trim() ?? "";
  if (text.length > 0) {
    params.set("q", text);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.stockStatus) {
    params.set("stockStatus", input.stockStatus);
  }
  params.set("page", String(input.page ?? 1));
  params.set("pageSize", "20");
  return `/distributor/listings?${params.toString()}`;
}

export function validateCreateListing(input: {
  medicinePackId: string;
  unitPrice: string;
  minimumOrderQuantity: string;
  stockStatus: string;
  availableQuantity: string;
  sourceNote: string;
}): { ok: true; body: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const body: Record<string, unknown> = {
    medicinePackId: input.medicinePackId,
    unitPrice: input.unitPrice.trim(),
    currency: "INR",
    minimumOrderQuantity: input.minimumOrderQuantity.trim(),
    stockStatus: input.stockStatus,
  };
  if (input.availableQuantity.trim().length > 0) {
    body.availableQuantity = input.availableQuantity.trim();
  }
  if (input.sourceNote.trim().length > 0) {
    body.sourceNote = input.sourceNote.trim();
  }
  return parseFields(createListingRequestSchema, body);
}

export function changedListingUpdate(
  current: {
    unitPrice: string;
    minimumOrderQuantity: string;
    stockStatus: string;
    availableQuantity: string | null;
    sourceNote: string | null;
  },
  next: {
    unitPrice: string;
    minimumOrderQuantity: string;
    stockStatus: string;
    availableQuantity: string;
    sourceNote: string;
    clearAvailableQuantity: boolean;
  },
): { ok: true; body: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const body: Record<string, unknown> = {};
  if (next.unitPrice.trim() !== current.unitPrice) {
    body.unitPrice = next.unitPrice.trim();
  }
  if (next.minimumOrderQuantity.trim() !== current.minimumOrderQuantity) {
    body.minimumOrderQuantity = next.minimumOrderQuantity.trim();
  }
  if (next.stockStatus !== current.stockStatus) {
    body.stockStatus = next.stockStatus;
  }
  if (next.clearAvailableQuantity && current.availableQuantity !== null) {
    body.availableQuantity = null;
  } else if (next.availableQuantity.trim().length > 0 && next.availableQuantity.trim() !== (current.availableQuantity ?? "")) {
    body.availableQuantity = next.availableQuantity.trim();
  }
  if (next.sourceNote.trim() !== (current.sourceNote ?? "") && next.sourceNote.trim().length > 0) {
    body.sourceNote = next.sourceNote.trim();
  }
  if (Object.keys(body).length === 0) {
    return { ok: false, fieldErrors: { form: "Change a field before saving." } };
  }
  return parseFields(updateListingRequestSchema, body);
}

export function importRowView(row: {
  errors: string[];
  warnings: string[];
  action: "CREATE" | "UPDATE" | null;
}): { errors: string[]; warnings: string[]; effect: string } {
  return {
    errors: row.errors,
    warnings: row.warnings,
    effect: row.action === "CREATE" ? "Create listing" : row.action === "UPDATE" ? "Update listing" : "Will not be imported",
  };
}

export function commitOutcome(status: ImportLifecycle): "show-summary" | "needs-commit" {
  return status === "COMMITTED" ? "show-summary" : "needs-commit";
}

function parseFields(
  schema: { safeParse: (value: unknown) => { success: true; data: unknown } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: Record<string, unknown>,
): { ok: true; body: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { ok: true, body };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, fieldErrors };
}
