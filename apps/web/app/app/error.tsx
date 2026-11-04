"use client";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-16" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">The workspace could not be loaded</h1>
      <p className="leading-7 text-muted-foreground">{error.message || "The request could not be completed."}</p>
      <Button type="button" variant="outline" className="w-fit" onClick={() => reset()}>
        Try again
      </Button>
    </section>
  );
}
