"use client";

import { useActionState } from "react";
import { updateListingAction, type FormState } from "@/app/app/listings/actions";
import { CommercialFields } from "@/components/listing-create-form";
import { PendingButton } from "@/components/pending-button";

const initialState: FormState = { message: null, fieldErrors: {} };

export function ListingEditForm({
  organizationId,
  listing,
}: {
  organizationId: string;
  listing: {
    id: string;
    unitPrice: string;
    minimumOrderQuantity: string;
    stockStatus: string;
    availableQuantity: string | null;
    sourceNote: string | null;
  };
}) {
  const [state, action] = useActionState(updateListingAction, initialState);
  return (
    <form action={action} className="grid max-w-xl gap-4 rounded-lg border bg-card p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="listingId" value={listing.id} />
      <input type="hidden" name="currentUnitPrice" value={listing.unitPrice} />
      <input type="hidden" name="currentMinimumOrderQuantity" value={listing.minimumOrderQuantity} />
      <input type="hidden" name="currentStockStatus" value={listing.stockStatus} />
      <input type="hidden" name="currentAvailableQuantity" value={listing.availableQuantity ?? ""} />
      <input type="hidden" name="currentSourceNote" value={listing.sourceNote ?? ""} />
      <CommercialFields
        fieldErrors={state.fieldErrors}
        defaults={{
          unitPrice: listing.unitPrice,
          minimumOrderQuantity: listing.minimumOrderQuantity,
          stockStatus: listing.stockStatus,
          availableQuantity: listing.availableQuantity ?? "",
          sourceNote: listing.sourceNote ?? "",
        }}
      />
      {listing.availableQuantity ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clearAvailableQuantity" />
          Remove the available quantity
        </label>
      ) : null}
      {state.message ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <PendingButton pendingLabel="Saving…">Save changes</PendingButton>
    </form>
  );
}
