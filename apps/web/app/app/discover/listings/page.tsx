import Link from "next/link";
import { retailerListingPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader, Pager } from "@/components/page-header";
import { FreshnessBadge, StockBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { labelClass } from "@/components/ui/field";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { stockStatusLabel } from "@/lib/labels";
import { comparisonView, retailerAccess, retailerListingSearch } from "@/lib/retailer";
import { RequestProblem } from "@/components/workspace-states";

const stockStatuses = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"] as const;

export default async function ListingComparisonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await loadAccountState("/app/discover/listings");
  if (account.organization.kind !== "selected" || retailerAccess(account.organization.membership.organization.type) === "blocked") {
    return (
      <section className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Retailer organization required</h1>
        <p className="leading-7 text-muted-foreground">Listing comparison is available for a retailer organization.</p>
      </section>
    );
  }
  const organizationId = account.organization.membership.organizationId;
  const query = await searchParams;
  const filters = {
    q: text(query.q),
    medicineId: text(query.medicineId),
    medicinePackId: text(query.medicinePackId),
    distributorOrganizationId: text(query.distributorOrganizationId),
    stockStatus: oneOf(query.stockStatus, stockStatuses),
    minPrice: text(query.minPrice),
    maxPrice: text(query.maxPrice),
    page: Math.max(1, Number(text(query.page)) || 1),
  };
  const request = retailerListingSearch(filters);
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        title="Compare listings"
        description="Prices are indicative, not guaranteed quotes. Fresh means the distributor updated that figure recently. It does not guarantee the pack is available. A lower price is not a recommendation, and an active listing is not proof of stock."
      />
      <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3">
        <label className={`${labelClass} md:col-span-3`}>
          Medicine text
          <input name="q" defaultValue={filters.q} />
        </label>
        <label className={labelClass}>
          Medicine
          <input name="medicineId" defaultValue={filters.medicineId} />
        </label>
        <label className={labelClass}>
          Pack
          <input name="medicinePackId" defaultValue={filters.medicinePackId} />
        </label>
        <label className={labelClass}>
          Distributor
          <input name="distributorOrganizationId" defaultValue={filters.distributorOrganizationId} />
        </label>
        <label className={labelClass}>
          Stock status
          <select name="stockStatus" defaultValue={filters.stockStatus}>
            <option value="">Any stock status</option>
            {stockStatuses.map((value) => (
              <option key={value} value={value}>
                {stockStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Minimum indicative price (INR)
          <input name="minPrice" defaultValue={filters.minPrice} inputMode="decimal" />
        </label>
        <label className={labelClass}>
          Maximum indicative price (INR)
          <input name="maxPrice" defaultValue={filters.maxPrice} inputMode="decimal" />
        </label>
        <Button type="submit" className="md:col-start-3">
          Apply filters
        </Button>
      </form>
      {request.ok ? <ListingResults path={request.path} filters={filters} /> : <FilterErrors errors={request.fieldErrors} />}
    </section>
  );
}

async function ListingResults({
  path,
  filters,
}: {
  path: string;
  filters: {
    q: string;
    medicineId: string;
    medicinePackId: string;
    distributorOrganizationId: string;
    stockStatus: string;
    minPrice: string;
    maxPrice: string;
    page: number;
  };
}) {
  const result = await distributorApi(path, retailerListingPageSchema, { returnTo: "/app/discover/listings" });
  if (!result.ok) {
    return <RequestProblem title="Listings unavailable" message={result.message} />;
  }
  if (result.data.items.length === 0) {
    return <EmptyState title="No active listings match these filters." />;
  }
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));
  return (
    <div className="space-y-4">
      <DataTable className="min-w-[56rem]">
        <thead>
          <tr>
            <th className={thClass}>Distributor</th>
            <th className={thClass}>Medicine</th>
            <th className={thClass}>Pack</th>
            <th className={thClass}>Indicative price</th>
            <th className={thClass}>MOQ</th>
            <th className={thClass}>Stock status</th>
            <th className={thClass}>Available quantity</th>
            <th className={thClass}>Price freshness</th>
            <th className={thClass}>Stock freshness</th>
          </tr>
        </thead>
        <tbody>
          {result.data.items.map((listing) => {
            const view = comparisonView(listing);
            return (
              <tr key={listing.id}>
                <td className={tdClass}>{view.distributor}</td>
                <td className={tdClass}>
                  <Link href={`/app/discover/listings/${listing.id}`} className="font-medium text-primary">
                    {view.medicine}
                  </Link>
                </td>
                <td className={tdClass}>{view.pack}</td>
                <td className={`${tdClass} font-medium tabular-nums`}>{view.priceLabel}</td>
                <td className={`${tdClass} tabular-nums`}>{view.minimumOrderQuantity}</td>
                <td className={tdClass}>
                  <StockBadge status={view.stockStatus} />
                </td>
                <td className={tdClass}>{view.availableQuantity}</td>
                <td className={tdClass}>
                  <FreshnessBadge value={view.priceFreshness} />
                </td>
                <td className={tdClass}>
                  <FreshnessBadge value={view.stockFreshness} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <Pager
        label="Listing pages"
        page={result.data.page}
        lastPage={lastPage}
        totalLabel={`${result.data.total} listings`}
        previousHref={result.data.page > 1 ? pageHref(filters, result.data.page - 1) : null}
        nextHref={result.data.page < lastPage ? pageHref(filters, result.data.page + 1) : null}
      />
    </div>
  );
}

function FilterErrors({ errors }: { errors: Record<string, string> }) {
  return (
    <ul className="text-sm text-destructive" role="alert">
      {Object.entries(errors).map(([key, message]) => (
        <li key={key}>{message}</li>
      ))}
    </ul>
  );
}

function pageHref(
  filters: {
    q: string;
    medicineId: string;
    medicinePackId: string;
    distributorOrganizationId: string;
    stockStatus: string;
    minPrice: string;
    maxPrice: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page: String(page) })) {
    if (value) {
      params.set(key, value);
    }
  }
  return `/app/discover/listings?${params.toString()}`;
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function oneOf<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | "" {
  const raw = text(value);
  return allowed.includes(raw as T) ? (raw as T) : "";
}
