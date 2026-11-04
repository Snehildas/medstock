import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export function DistributorRequired() {
  return (
    <section className="max-w-xl space-y-3">
      <PageHeader
        title="Distributor organization required"
        description="Listings and imports are available when the selected organization is a distributor. Selecting an organization does not grant access. MedStock checks the membership on the server."
      />
      <Link href="/app" className="text-sm font-medium text-primary">
        Back to workspace
      </Link>
    </section>
  );
}

export function RequestProblem({ title, message }: { title: string; message: string }) {
  return (
    <section className="max-w-xl space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
      <h1>{title}</h1>
      <p className="text-sm text-destructive">{message}</p>
    </section>
  );
}
