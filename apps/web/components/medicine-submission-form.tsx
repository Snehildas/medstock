"use client";

import { useActionState, useState } from "react";
import { submitMedicineAction, type SubmissionFormState } from "@/app/app/catalog/actions";
import { PendingButton } from "@/components/pending-button";
import { labelClass } from "@/components/ui/field";

const initialState: SubmissionFormState = { message: null, fieldErrors: {} };

const strengthUnits = ["MG", "MCG", "G", "ML", "IU", "PERCENT"] as const;
const packUnits = ["TABLET", "CAPSULE", "ML", "G", "VIAL", "BOTTLE", "PIECE"] as const;
const stockStatuses = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"] as const;

type IngredientLine = {
  ingredientName: string;
  kind: "ACTIVE" | "SALT";
  strengthValue: string;
  strengthUnit: (typeof strengthUnits)[number];
  basis: string;
};

type PackLine = {
  description: string;
  quantity: string;
  unit: (typeof packUnits)[number];
};

const emptyIngredient = (): IngredientLine => ({
  ingredientName: "",
  kind: "ACTIVE",
  strengthValue: "",
  strengthUnit: "MG",
  basis: "",
});

export function MedicineSubmissionForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState(submitMedicineAction, initialState);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([emptyIngredient()]);
  const [packs, setPacks] = useState<PackLine[]>([{ description: "", quantity: "", unit: "TABLET" }]);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="ingredientCount" value={ingredients.length} />
      <input type="hidden" name="packCount" value={packs.length} />
      <p className="rounded-md border bg-muted px-3 py-2 text-sm">
        Your medicine submission must be approved before it becomes available in the shared medicine directory and can
        be listed for procurement. This form does not search the catalog and does not publish a listing.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Medicine Information</h2>
        <label className={labelClass}>
          Medicine Name (Required)
          <input name="displayName" required autoFocus placeholder="Type the new medicine name" className="h-12 text-base" />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}>
            Brand Name
            <input name="brandName" />
          </label>
          <label className={labelClass}>
            Generic Name
            <input name="genericName" />
          </label>
          <label className={labelClass}>
            Dosage Form (required)
            <input name="dosageForm" required placeholder="Tablet" />
          </label>
          <label className={labelClass}>
            Description (optional)
            <input name="presentation" />
          </label>
          <label className={labelClass}>
            Manufacturer
            <input name="manufacturerName" />
          </label>
          <label className={labelClass}>
            Marketer
            <input name="marketerName" />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">2. Salt / Ingredient Composition</h2>
          <button type="button" className="text-sm font-medium text-primary" onClick={() => setIngredients((current) => [...current, emptyIngredient()])}>
            Add Another Ingredient
          </button>
        </div>
        {ingredients.map((line, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-5">
            <label className={labelClass}>
              Ingredient Name
              <input
                name={`ingredientName${index}`}
                value={line.ingredientName}
                required
                onChange={(event) => updateIngredient(index, { ingredientName: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              Ingredient Type
              <select
                name={`ingredientKind${index}`}
                value={line.kind}
                onChange={(event) => updateIngredient(index, { kind: event.target.value as IngredientLine["kind"] })}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SALT">SALT</option>
              </select>
            </label>
            <label className={labelClass}>
              Strength
              <input
                name={`strengthValue${index}`}
                value={line.strengthValue}
                inputMode="decimal"
                required
                onChange={(event) => updateIngredient(index, { strengthValue: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              Strength Unit
              <select
                name={`strengthUnit${index}`}
                value={line.strengthUnit}
                onChange={(event) =>
                  updateIngredient(index, { strengthUnit: event.target.value as IngredientLine["strengthUnit"] })
                }
              >
                {strengthUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Strength Basis (optional)
              <input
                name={`basis${index}`}
                value={line.basis}
                placeholder="per 5 ml"
                onChange={(event) => updateIngredient(index, { basis: event.target.value })}
              />
            </label>
            {ingredients.length > 1 ? (
              <button type="button" className="text-left text-sm text-destructive" onClick={() => setIngredients((current) => current.filter((_, item) => item !== index))}>
                Remove ingredient
              </button>
            ) : null}
          </div>
        ))}
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <p className="font-medium">Composition summary</p>
          <ul className="mt-1 space-y-1">
            {ingredients.map((line, index) => (
              <li key={index}>
                {line.ingredientName.trim() || "Unnamed ingredient"} · {line.kind}
                {line.strengthValue ? ` · ${line.strengthValue} ${line.strengthUnit}` : ""}
                {line.basis.trim() ? ` · ${line.basis.trim()}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">3. Pack Information</h2>
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setPacks((current) => [...current, { description: "", quantity: "", unit: "TABLET" }])}
          >
            Add Another Pack
          </button>
        </div>
        {packs.map((pack, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-3">
            <label className={labelClass}>
              Pack Description
              <input
                name={`packDescription${index}`}
                value={pack.description}
                required
                onChange={(event) => updatePack(index, { description: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              Pack Quantity
              <input
                name={`packQuantity${index}`}
                value={pack.quantity}
                inputMode="decimal"
                required
                onChange={(event) => updatePack(index, { quantity: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              Pack Unit
              <select
                name={`packUnit${index}`}
                value={pack.unit}
                onChange={(event) => updatePack(index, { unit: event.target.value as PackLine["unit"] })}
              >
                {packUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            {packs.length > 1 ? (
              <button type="button" className="text-left text-sm text-destructive" onClick={() => setPacks((current) => current.filter((_, item) => item !== index))}>
                Remove pack
              </button>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <h2 className="text-lg font-semibold md:col-span-2">4. Inventory Details</h2>
        <label className={labelClass}>
          Indicative Unit Price (INR)
          <input name="indicativeUnitPrice" inputMode="decimal" required placeholder="18.50" />
        </label>
        <label className={labelClass}>
          Minimum Order Quantity
          <input name="minimumOrderQuantity" inputMode="numeric" required placeholder="4" />
        </label>
        <label className={labelClass}>
          Stock Status
          <select name="stockStatus" defaultValue="UNKNOWN">
            {stockStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Available Quantity (optional)
          <input name="availableQuantity" inputMode="decimal" />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Source Note (optional)
          <input name="sourceNote" maxLength={200} />
        </label>
      </section>

      {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
      <PendingButton pendingLabel="Submitting">Submit new medicine</PendingButton>
    </form>
  );

  function updateIngredient(index: number, patch: Partial<IngredientLine>) {
    setIngredients((current) => current.map((line, item) => (item === index ? { ...line, ...patch } : line)));
  }

  function updatePack(index: number, patch: Partial<PackLine>) {
    setPacks((current) => current.map((line, item) => (item === index ? { ...line, ...patch } : line)));
  }
}
