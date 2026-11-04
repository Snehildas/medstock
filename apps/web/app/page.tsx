import type { HealthResponse } from "@medstock/shared-types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { localPreviewAllowed } from "@/lib/preview-mode";

const serviceName: HealthResponse["service"] = "medstock-web";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-16">
      <section className="grid w-full gap-8 rounded-xl border bg-card p-8 shadow-xs md:grid-cols-[1.4fr_1fr] md:p-10">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-wide text-primary">{serviceName}</p>
          <h1 className="text-3xl">Procurement for pharmacies and distributors</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Sign in to manage distributor listings and imports. Public search and retailer enquiries are not
            available yet.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button type="button" variant="secondary" disabled>
              Search is not available yet
            </Button>
            {localPreviewAllowed(process.env) ? (
              <Button asChild variant="outline">
                <Link href="/app">Open local preview</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="space-y-3 rounded-lg bg-muted p-5 text-sm">
          <p className="font-medium">What teams use it for</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>Compare indicative distributor prices and stock status.</li>
            <li>Send procurement enquiries without creating an order.</li>
            <li>Keep distributor listings and imports in one workspace.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
