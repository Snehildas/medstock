"use client";

import { useActionState } from "react";
import { updateProfileAction, type FormState } from "@/app/app/listings/actions";
import { PendingButton } from "@/components/pending-button";
import { labelClass } from "@/components/ui/field";

const initialState: FormState = { message: null, fieldErrors: {} };

export function DistributorProfileForm({
  organizationId,
  canEdit,
  profile,
}: {
  organizationId: string;
  canEdit: boolean;
  profile: {
    proprietorName: string | null;
    landlineNumber: string | null;
    mobileNumber: string | null;
    published: boolean;
  };
}) {
  const [state, action] = useActionState(updateProfileAction, initialState);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-semibold">Wholesaler contact</h2>
        <p className="text-sm text-muted-foreground">
          These details belong to the distributor organization. Retailers see them only after the profile is published
          with at least one phone number.
        </p>
      </div>
      {canEdit ? (
        <form action={action} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <label className={labelClass}>
            Proprietor name
            <input name="proprietorName" defaultValue={profile.proprietorName ?? ""} required />
          </label>
          <label className={labelClass}>
            Landline
            <input name="landlineNumber" defaultValue={profile.landlineNumber ?? ""} />
            <FieldNote message={state.fieldErrors.landlineNumber} />
          </label>
          <label className={labelClass}>
            Mobile
            <input name="mobileNumber" defaultValue={profile.mobileNumber ?? ""} />
            <FieldNote message={state.fieldErrors.mobileNumber} />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="publish" defaultChecked={profile.published} />
            Publish contact details to retailers
          </label>
          {state.message ? <p className="text-sm text-destructive md:col-span-2">{state.message}</p> : null}
          <PendingButton pendingLabel="Saving">Save contact details</PendingButton>
        </form>
      ) : (
        <div className="space-y-1 text-sm">
          <p>Proprietor: {profile.proprietorName ?? "Not provided"}</p>
          <p>Landline: {profile.landlineNumber ?? "Not provided"}</p>
          <p>Mobile: {profile.mobileNumber ?? "Not provided"}</p>
          <p className="text-muted-foreground">Distributor staff can view this profile. Only an owner can change it.</p>
        </div>
      )}
    </section>
  );
}

function FieldNote({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <span className="text-xs font-normal text-destructive">{message}</span>;
}
