import Link from "next/link";
import { medicinePageSchema, medicineResponseSchema } from "@medstock/shared-types";
import { EmptyState, Pager } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { catalogSearchState, medicineSearchPresentation, retailerAccess, searchResultView } from "@/lib/retailer";
import { distributorAccess } from "@/lib/distributor";
import { RequestProblem } from "@/components/workspace-states";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const account = await loadAccountState("/app/discover");
  if (account.organization.kind !== "selected") {
    return <RetailerRequired />;
  }
  const organizationType = account.organization.membership.organization.type;
  const distributor = distributorAccess(organizationType) === "allowed";
  const retailer = retailerAccess(organizationType) === "allowed";
  if (!distributor && !retailer && organizationType !== "PLATFORM") {
    return <RetailerRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  const query = await searchParams;
  const q = text(query.q).trim();
  const page = Math.max(1, Number(text(query.page)) || 1);
  const prompt = catalogSearchState({ query: q, phase: "ready", total: 0 }) === "prompt";

  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Find the right medicine.</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Search medicines by brand name, generic name or salt composition.
        </p>
      </div>
      <form method="get" className="rounded-xl border bg-card p-4 shadow-xs">
        <label className="grid gap-2 text-sm font-medium">
          Medicine search
          <input
            name="q"
            defaultValue={q}
            placeholder="Search medicine, brand name or salt composition..."
            className="h-14 rounded-lg border border-input bg-card px-4 text-lg shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            autoFocus
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit">Search</Button>
          {["Paracetamol", "Amoxicillin", "Metformin", "Azithromycin"].map((example) => (
            <Link
              key={example}
              href={`/app/discover?q=${encodeURIComponent(example)}`}
              className="rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              {example}
            </Link>
          ))}
        </div>
      </form>
      {distributor ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/app/listings/new">Add Existing Medicine</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/catalog/submit">Register New Medicine</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/imports">Upload inventory</Link>
          </Button>
        </div>
      ) : null}
      {prompt ? (
        <EmptyState title="Search the catalog">Enter a medicine name, salt, or pack description.</EmptyState>
      ) : (
        <SearchResults organizationId={organizationId} q={q} page={page} retailer={retailer} />
      )}
    </section>
  );
}

async function SearchResults({
  organizationId,
  q,
  page,
  retailer,
}: {
  organizationId: string;
  q: string;
  page: number;
  retailer: boolean;
}) {
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
          const presentation = medicineSearchPresentation({
            id: item.id,
            displayName: item.displayName,
            brandName: item.brandName,
            dosageForm: item.dosageForm,
            compositions: detail?.ok ? detail.data.compositions : [],
            eligibleWholesalerCount: item.eligibleWholesalerCount,
          });
          return (
            <li key={item.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">
                  <Link href={`/app/discover/medicines/${item.id}`} className="text-foreground">
                    {presentation.name}
                  </Link>
                </h2>
                <p className="text-base text-foreground">
                  {detail?.ok
                    ? presentation.salts
                      ? presentation.salts
                      : "Composition information unavailable."
                    : "Composition information unavailable."}
                </p>
                {detail?.ok && view.composition.length > 0 ? (
                  <ul className="text-sm text-muted-foreground">
                    {view.composition.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{presentation.strength}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {item.dosageForm}
                  {item.brandName ? ` · Brand ${item.brandName}` : ""}
                  {` · Generic ${item.genericName}`}
                </p>
                {retailer ? (
                  <Link href={presentation.wholesalerHref} className="inline-flex text-sm font-medium text-primary">
                    View wholesalers →
                  </Link>
                ) : (
                  <Link href={`/app/listings/new?medicineId=${item.id}`} className="inline-flex text-sm font-medium text-primary">
                    Add listing
                  </Link>
                )}
                <p className="text-sm text-muted-foreground">
                  {presentation.wholesalerCount === 0
                    ? "No wholesalers currently listing this medicine."
                    : `${presentation.wholesalerCount} wholesaler${presentation.wholesalerCount === 1 ? "" : "s"} with an eligible listing.`}
                </p>
              </div>
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
