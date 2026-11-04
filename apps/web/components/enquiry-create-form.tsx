"use client";

import { useActionState } from "react";
import { createEnquiryAction, respondToEnquiry, type FormState } from "@/app/app/enquiries/actions";
import { PendingButton } from "@/components/pending-button";

const initialState: FormState = { message: null, fieldErrors: {} };

export function EnquiryCreateForm({
  organizationId,
  listingId,
  distributorName,
  packDescription,
}: {
  organizationId: string;
  listingId: string;
  distributorName: string;
  packDescription: string;
}) {
  const [state, action] = useActionState(createEnquiryAction, initialState);
  return (
    <form action={action} className="grid max-w-xl gap-4 rounded-lg border bg-card p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="listingId" value={listingId} />
      <p className="text-sm">
        Distributor: <span className="font-medium">{distributorName}</span>
      </p>
      <label className="grid gap-1.5 text-sm font-medium">
        Requested quantity
        <input
          name="requestedPackQuantity"
          inputMode="numeric"
          min={1}
          step={1}
          required
          className="h-9 rounded-lg border px-2"
          aria-describedby="pack-quantity-help"
        />
        <span id="pack-quantity-help" className="text-muted-foreground">
          Number of catalog packs. Pack: {packDescription}.
        </span>
        <FieldError message={state.fieldErrors.requestedPackQuantity} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Message (optional)
        <textarea name="message" maxLength={1000} rows={4} className="rounded-lg border px-2 py-1" />
        <FieldError message={state.fieldErrors.message} />
      </label>
      {state.message ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <PendingButton pendingLabel="Sending enquiry…">Send enquiry</PendingButton>
      <p className="text-sm text-muted-foreground">
        An enquiry does not reserve stock, lock the indicative price, or create an order or quote.
      </p>
    </form>
  );
}

export function EnquiryResponseForm({
  organizationId,
  enquiryId,
}: {
  organizationId: string;
  enquiryId: string;
}) {
  const [state, action] = useActionState(respondToEnquiry, initialState);
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-lg border bg-card p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <label className="grid gap-1.5 text-sm font-medium">
        Response
        <textarea name="message" required maxLength={1000} rows={4} className="rounded-lg border px-2 py-1" />
        <FieldError message={state.fieldErrors.message} />
      </label>
      {state.message ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <PendingButton pendingLabel="Sending response…">Send response</PendingButton>
      <p className="text-sm text-muted-foreground">
        A response does not change the listing price, stock, or freshness, and it is not an order or a confirmed quote.
      </p>
    </form>
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
