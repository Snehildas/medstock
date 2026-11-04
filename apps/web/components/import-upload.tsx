"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { shouldDiscardWorkspace } from "@/lib/distributor";

export function ImportUpload({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previousOrganizationId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (shouldDiscardWorkspace(previousOrganizationId.current, organizationId)) {
      setPending(false);
      setMessage(null);
      formRef.current?.reset();
    }
    previousOrganizationId.current = organizationId;
  }, [organizationId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/distributor/imports?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "POST",
      body: new FormData(form),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.id) {
      setPending(false);
      setMessage(body?.error?.message ?? "The file could not be previewed.");
      return;
    }
    router.push(`/app/imports/${body.id}`);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid max-w-xl gap-3">
      <label htmlFor="import-file" className="text-sm font-medium">
        CSV or XLSX file
      </label>
      <input id="import-file" name="file" type="file" accept=".csv,.xlsx,text/csv" required className="text-sm" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Uploading preview…" : "Upload for preview"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Upload creates a preview only. Listings change after you choose Commit import.
      </p>
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
