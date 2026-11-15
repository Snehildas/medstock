"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createListingAction, loadMedicineAction, searchCatalogAction, type FormState } from "@/app/app/listings/actions";
import { PendingButton } from "@/components/pending-button";
import { shouldDiscardWorkspace } from "@/lib/distributor";

const initialState: FormState = { message: null, fieldErrors: {} };

type MedicineDetail = {
  displayName: string;
  genericName: string;
  dosageForm: string;
  compositions: Array<{ ingredientName: string; strengthValue: string; strengthUnit: string }>;
  packs: Array<{ id: string; description: string; quantity: string; unit: string }>;
};

export function ListingCreateForm({
  organizationId,
  initialMedicineId,
  commercialDefaults,
}: {
  organizationId: string;
  initialMedicineId?: string;
  commercialDefaults?: {
    unitPrice: string;
    minimumOrderQuantity: string;
    stockStatus: string;
    availableQuantity: string;
    sourceNote: string;
  };
}) {
  const [state, action] = useActionState(createListingAction, initialState);
  const [medicines, setMedicines] = useState<Array<{ id: string; displayName: string; genericName: string; dosageForm: string }>>([]);
  const [medicine, setMedicine] = useState<MedicineDetail | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const previousOrganizationId = useRef<string | null>(null);

  useEffect(() => {
    if (shouldDiscardWorkspace(previousOrganizationId.current, organizationId)) {
      setMedicines([]);
      setMedicine(null);
      setSearchError(null);
      setSearching(false);
    }
    previousOrganizationId.current = organizationId;
    if (initialMedicineId) {
      void chooseMedicine(initialMedicineId);
    }
  }, [organizationId, initialMedicineId]);

  async function search(formData: FormData) {
    setSearching(true);
    setSearchError(null);
    setMedicine(null);
    const result = await searchCatalogAction(String(formData.get("catalogQuery") ?? ""));
    setSearching(false);
    if (!result.ok) {
      setMedicines([]);
      setSearchError(result.message);
      return;
    }
    setMedicines(result.items);
    if (result.items.length === 0) {
      setSearchError("No published medicines matched that search.");
    }
  }

  async function chooseMedicine(medicineId: string) {
    setSearchError(null);
    const result = await loadMedicineAction(medicineId);
    if (!result.ok) {
      setMedicine(null);
      setSearchError(result.message);
      return;
    }
    setMedicine(result.medicine);
  }

  return (
    <div className="space-y-8">
      <form action={search} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="catalogQuery" className="text-sm font-medium">
            Search the catalog
          </label>
          <input id="catalogQuery" name="catalogQuery" className="h-9 rounded-lg border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-lg border px-3 text-sm" disabled={searching}>
          {searching ? "Searching…" : "Search medicines"}
        </button>
      </form>
      {searchError ? (
        <p className="text-sm text-destructive" role="alert">
          {searchError}
        </p>
      ) : null}
      {medicines.length > 0 ? (
        <ul className="space-y-2">
          {medicines.map((item) => (
            <li key={item.id}>
              <button type="button" className="text-left text-sm underline-offset-4 hover:underline" onClick={() => chooseMedicine(item.id)}>
                {item.displayName}
              </button>
              <span className="text-sm text-muted-foreground">
                {" "}
                · {item.genericName} · {item.dosageForm}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {medicine ? (
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          <h2 className="font-medium">{medicine.displayName}</h2>
          <p className="text-muted-foreground">
            {medicine.genericName} · {medicine.dosageForm}. This catalog record is read-only.
          </p>
          <ul>
            {medicine.compositions.map((line) => (
              <li key={`${line.ingredientName}-${line.strengthValue}-${line.strengthUnit}`}>
                {line.ingredientName} {line.strengthValue} {line.strengthUnit}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={action} className="grid max-w-xl gap-4 rounded-lg border bg-card p-4">
        <input type="hidden" name="organizationId" value={organizationId} />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Canonical pack</legend>
          {medicine && medicine.packs.length > 0 ? (
            medicine.packs.map((pack) => (
              <label key={pack.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="medicinePackId" value={pack.id} required />
                <span>
                  {pack.description} · {pack.quantity} {pack.unit}
                </span>
              </label>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Choose a medicine to see its packs.</p>
          )}
          <FieldError message={state.fieldErrors.medicinePackId} />
        </fieldset>
        <CommercialFields fieldErrors={state.fieldErrors} defaults={commercialDefaults} />
        {state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        <PendingButton pendingLabel="Adding medicine…">Add existing medicine</PendingButton>
        <p className="text-sm text-muted-foreground">
          The price is indicative. Creating a listing does not guarantee that stock is available.
        </p>
      </form>
    </div>
  );
}

export function CommercialFields({
  fieldErrors,
  defaults,
}: {
  fieldErrors: Record<string, string>;
  defaults?: {
    unitPrice: string;
    minimumOrderQuantity: string;
    stockStatus: string;
    availableQuantity: string;
    sourceNote: string;
  };
}) {
  return (
    <>
        <label className="grid gap-1.5 text-sm font-medium">
        Indicative unit price (INR)
        <input name="unitPrice" defaultValue={defaults?.unitPrice} inputMode="decimal" className="h-9 rounded-lg border px-2" required />
        <FieldError message={fieldErrors.unitPrice} />
      </label>
        <label className="grid gap-1.5 text-sm font-medium">
        Minimum order quantity (whole packs)
        <input name="minimumOrderQuantity" defaultValue={defaults?.minimumOrderQuantity} inputMode="numeric" className="h-9 rounded-lg border px-2" required />
        <FieldError message={fieldErrors.minimumOrderQuantity} />
      </label>
        <label className="grid gap-1.5 text-sm font-medium">
        Stock status
        <select name="stockStatus" defaultValue={defaults?.stockStatus ?? "UNKNOWN"} className="h-9 rounded-lg border px-2">
          <option value="IN_STOCK">In stock</option>
          <option value="LOW_STOCK">Low stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <FieldError message={fieldErrors.stockStatus} />
      </label>
        <label className="grid gap-1.5 text-sm font-medium">
        Available quantity (optional)
        <input name="availableQuantity" defaultValue={defaults?.availableQuantity} inputMode="decimal" className="h-9 rounded-lg border px-2" />
        <FieldError message={fieldErrors.availableQuantity} />
      </label>
        <label className="grid gap-1.5 text-sm font-medium">
        Source note (optional)
        <input name="sourceNote" defaultValue={defaults?.sourceNote} maxLength={200} className="h-9 rounded-lg border px-2" />
        <FieldError message={fieldErrors.sourceNote} />
      </label>
    </>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <span className="text-destructive" role="alert">
      {message}
    </span>
  );
}
