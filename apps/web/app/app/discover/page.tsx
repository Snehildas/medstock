import Link from "next/link";
import { medicinePageSchema, medicineResponseSchema } from "@medstock/shared-types";
import { EmptyState, PageHeader, Pager } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { labelClass } from "@/components/ui/field";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { catalogSearchState, retailerAccess, searchResultView } from "@/lib/retailer";
import { RequestProblem } from "@/components/workspace-states";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const account = await loadAccountState("/app/discover");
  if (account.organization.kind !== "selected" || retailerAccess(account.organization.membership.organization.type) === "blocked") {
    return <RetailerRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  const query = await searchParams;
  const q = text(query.q).trim();
  const page = Math.max(1, Number(text(query.page)) || 1);
  const prompt = catalogSearchState({ query: q, phase: "ready", total: 0 }) === "prompt";

  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        title="Discover medicines"
        description="Search the canonical catalog by medicine name, brand, generic name, ingredient, or pack description. Results are reference records, not recommendations or medical advice."
      />
      <form method="get" className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className={`${labelClass} flex-1`}>
            Medicine, brand, generic name, or ingredient
            <input name="q" defaultValue={q} />
          </label>
          <Button type="submit">Search</Button>
        </div>
      </form>
      {prompt ? (
        <EmptyState title="Search the catalog">Enter a medicine name, salt, or pack description.</EmptyState>
      ) : (
        <SearchResults organizationId={organizationId} q={q} page={page} />
      )}
    </section>
  );
}

async function SearchResults({ organizationId, q, page }: { organizationId: string; q: string; page: number }) {
  const params = new URLSearchParams({ q, page: String(page), pageSize: "10" });
  const result = await distributorApi(`/catalog/medicines?${params.toString()}`, medicinePageSchema, {
    returnTo: "/app/discover",
  });
  if (!result.ok) {
    return <RequestProblem title="Search unavailable" message={result.message} />;
  }
  const phase = catalogSearchState({ query: q, phase: "ready", total: result.data.total });
  if (phase === "empty") {
    return <EmptyState title="No published medicines matched that search." />;
  }
  const details = await Promise.all(
    result.data.items.map((item) =>
      distributorApi(`/catalog/medicines/${item.id}`, medicineResponseSchema, { returnTo: "/app/discover" }),
    ),
  );
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {result.data.items.map((item, index) => {
          const detail = details[index];
          const view = detail?.ok
            ? searchResultView(detail.data)
            : searchResultView({ ...item, compositions: [], packs: [] });
          return (
            <li key={item.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2>
                    <Link href={`/app/discover/medicines/${item.id}`} className="text-primary">
                      {view.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {item.genericName} · {view.dosageForm}
                    {item.brandName ? ` · ${item.brandName}` : ""}
                  </p>
                </div>
              </div>
              {view.composition.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {view.composition.map((line) => (
                    <li key={line} className="rounded-md bg-muted px-2 py-1 text-xs">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Composition could not be loaded.</p>
              )}
              {view.packs.length > 0 ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {detail?.ok
                    ? detail.data.packs.map((pack) => (
                        <li key={pack.id}>
                          <Link
                            href={`/app/discover/listings?medicineId=${item.id}&medicinePackId=${pack.id}`}
                            className="block rounded-md border px-3 py-2 text-sm hover:bg-muted"
                          >
                            <span className="font-medium">{pack.description}</span>
                            <span className="block text-xs text-muted-foreground">
                              {pack.quantity} {pack.unit}
                            </span>
                          </Link>
                        </li>
                      ))
                    : null}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No canonical packs were returned.</p>
              )}
            </li>
          );
        })}
      </ul>
      <Pager
        label="Search pages"
        page={result.data.page}
        lastPage={lastPage}
        totalLabel={`${result.data.total} medicines`}
        previousHref={result.data.page > 1 ? `/app/discover?q=${encodeURIComponent(q)}&page=${result.data.page - 1}` : null}
        nextHref={result.data.page < lastPage ? `/app/discover?q=${encodeURIComponent(q)}&page=${result.data.page + 1}` : null}
      />
      <p className="text-sm text-muted-foreground">Catalog details are read-only. Organization {organizationId} is only the workspace context.</p>
    </div>
  );
}

function RetailerRequired() {
  return (
    <section className="max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Retailer organization required</h1>
      <p className="leading-7 text-muted-foreground">
        Medicine search and enquiries are available when the selected organization is a retailer. Selecting an
        organization does not grant access.
      </p>
      <Link href="/app" className="text-sm underline-offset-4 hover:underline">
        Back to workspace
      </Link>
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
