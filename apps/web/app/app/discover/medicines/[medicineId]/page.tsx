import Link from "next/link";
import { medicineResponseSchema } from "@medstock/shared-types";
import { Button } from "@/components/ui/button";
import { Fact, FactGrid, PageHeader } from "@/components/page-header";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { retailerAccess, searchResultView } from "@/lib/retailer";
import { RequestProblem } from "@/components/workspace-states";

export default async function MedicineDetailPage({ params }: { params: Promise<{ medicineId: string }> }) {
  const { medicineId } = await params;
  const account = await loadAccountState(`/app/discover/medicines/${medicineId}`);
  if (account.organization.kind !== "selected" || retailerAccess(account.organization.membership.organization.type) === "blocked") {
    return (
      <section className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Retailer organization required</h1>
        <p className="leading-7 text-muted-foreground">Choose a retailer organization before reading the catalog.</p>
      </section>
    );
  }
  const organizationId = account.organization.membership.organizationId;
  const result = await distributorApi(`/catalog/medicines/${medicineId}`, medicineResponseSchema, {
    returnTo: `/app/discover/medicines/${medicineId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Medicine unavailable" message={result.message} />;
  }
  const medicine = result.data;
  const view = searchResultView(medicine);
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/discover">Discover medicines</Link>}
        title={view.name}
        description={`${medicine.genericName} · ${view.dosageForm}${medicine.brandName ? ` · ${medicine.brandName}` : ""}${medicine.presentation ? ` · ${medicine.presentation}` : ""}. This catalog record is read-only and is not medical advice.`}
        actions={
          <>
            <Button asChild>
              <Link href={`/app/discover/medicines/${medicine.id}/wholesalers`}>
                View wholesalers
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/discover/listings?medicineId=${medicine.id}`}>Compare listings</Link>
            </Button>
          </>
        }
      />
      <section className="space-y-2">
        <h2>Composition</h2>
        {view.composition.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {medicine.compositions.map((line) => (
              <li key={line.ingredientId} className="rounded-md border bg-card px-3 py-2 text-sm">
                <span className="font-medium">{line.ingredientName}</span>
                <span className="block text-xs text-muted-foreground">
                  {line.strengthValue} {line.strengthUnit}
                  {line.basis ? ` · ${line.basis}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No composition is recorded.</p>
        )}
      </section>
      <section className="space-y-2">
        <h2>Canonical packs</h2>
        {medicine.packs.length > 0 ? (
          <FactGrid>
            {medicine.packs.map((pack) => (
              <Fact key={pack.id} label={pack.unit}>
                <Link href={`/app/discover/listings?medicineId=${medicine.id}&medicinePackId=${pack.id}`} className="font-medium text-primary">
                  {pack.description}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {pack.quantity} {pack.unit}
                </span>
              </Fact>
            ))}
          </FactGrid>
        ) : (
          <p className="text-sm text-muted-foreground">No packs are recorded.</p>
        )}
      </section>
    </section>
  );
}
