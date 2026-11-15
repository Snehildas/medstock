import Link from "next/link";
import { medicineResponseSchema, wholesalerPageSchema } from "@medstock/shared-types";
import { EmptyState, Fact, FactGrid, PageHeader, Pager } from "@/components/page-header";
import { FreshnessBadge, StockBadge } from "@/components/status-badge";
import { labelClass } from "@/components/ui/field";
import { RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { phoneHref, retailerAccess, wholesalerDirectoryState } from "@/lib/retailer";

const stockStatuses = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"] as const;

export default async function WholesalersPage({
  params,
  searchParams,
}: {
  params: Promise<{ medicineId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { medicineId } = await params;
  const account = await loadAccountState(`/app/discover/medicines/${medicineId}/wholesalers`);
  if (account.organization.kind !== "selected" || retailerAccess(account.organization.membership.organization.type) === "blocked") {
    return (
      <section className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Retailer organization required</h1>
        <p className="leading-7 text-muted-foreground">Wholesaler contact details are available to a retailer organization.</p>
      </section>
    );
  }
  const query = await searchParams;
  const filters = {
    q: text(query.q),
    medicinePackId: text(query.medicinePackId),
    stockStatus: oneOf(query.stockStatus, stockStatuses),
    minPrice: text(query.minPrice),
    maxPrice: text(query.maxPrice),
    page: Math.max(1, Number(text(query.page)) || 1),
  };
  const medicine = await distributorApi(`/catalog/medicines/${medicineId}`, medicineResponseSchema, {
    returnTo: `/app/discover/medicines/${medicineId}/wholesalers`,
  });
  if (!medicine.ok) {
    return <RequestProblem title="Medicine unavailable" message={medicine.message} />;
  }
  const paramsText = new URLSearchParams();
  if (filters.q) paramsText.set("q", filters.q);
  if (filters.medicinePackId) paramsText.set("medicinePackId", filters.medicinePackId);
  if (filters.stockStatus) paramsText.set("stockStatus", filters.stockStatus);
  if (filters.minPrice) paramsText.set("minPrice", filters.minPrice);
  if (filters.maxPrice) paramsText.set("maxPrice", filters.maxPrice);
  paramsText.set("page", String(filters.page));
  paramsText.set("pageSize", "20");
  const result = await distributorApi(
    `/retailer/medicines/${medicineId}/wholesalers?${paramsText.toString()}`,
    wholesalerPageSchema,
    { returnTo: `/app/discover/medicines/${medicineId}/wholesalers` },
  );
  if (!result.ok) {
    return <RequestProblem title="Wholesalers unavailable" message={result.message} />;
  }
  const directory = wholesalerDirectoryState(result.data.total);
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));
  const base = `/app/discover/medicines/${medicineId}/wholesalers`;

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow={<Link href={`/app/discover/medicines/${medicineId}`}>Medicine</Link>}
        title={medicine.data.displayName}
        description="Indicative prices and stock status come from each wholesaler. They are not a guarantee of availability or a confirmed quote."
      />
      <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        <label className={`${labelClass} md:col-span-2`}>
          Wholesaler, medicine, or pack
          <input name="q" defaultValue={filters.q} />
        </label>
        <label className={labelClass}>
          Pack
          <select name="medicinePackId" defaultValue={filters.medicinePackId}>
            <option value="">All packs</option>
            {medicine.data.packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.description}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Stock status
          <select name="stockStatus" defaultValue={filters.stockStatus}>
            <option value="">Any</option>
            {stockStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Minimum price
          <input name="minPrice" defaultValue={filters.minPrice} inputMode="decimal" />
        </label>
        <label className={labelClass}>
          Maximum price
          <input name="maxPrice" defaultValue={filters.maxPrice} inputMode="decimal" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Apply
          </button>
        </div>
      </form>
      {directory === "empty" ? (
        <EmptyState title="No wholesalers have an eligible listing for this medicine." />
      ) : (
        <ul className="space-y-4">
          {result.data.items.map((item) => {
            const landline = phoneHref(item.contact?.landlineNumber ?? null);
            const mobile = phoneHref(item.contact?.mobileNumber ?? null);
            return (
              <li key={item.id} className="space-y-4 rounded-lg border bg-card p-4">
                <div>
                  <h2 className="text-lg font-semibold">{item.distributor.name}</h2>
                  {item.contact ? (
                    <div className="mt-2 space-y-1 text-sm">
                      <p>Proprietor: {item.contact.proprietorName}</p>
                      <p>
                        Landline:{" "}
                        {landline ? (
                          <a href={landline}>{item.contact.landlineNumber}</a>
                        ) : (
                          "Not provided"
                        )}
                      </p>
                      <p>
                        Mobile:{" "}
                        {mobile ? <a href={mobile}>{item.contact.mobileNumber}</a> : "Not provided"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Contact details not provided</p>
                  )}
                </div>
                <FactGrid>
                  <Fact label="Medicine">{item.medicine.displayName}</Fact>
                  <Fact label="Pack">{item.pack.description}</Fact>
                  <Fact label="Indicative price">₹{item.unitPrice}</Fact>
                  <Fact label="MOQ">{item.minimumOrderQuantity} packs</Fact>
                  <Fact label="Stock">
                    <StockBadge status={item.stockStatus} />
                  </Fact>
                  <Fact label="Price freshness">
                    <FreshnessBadge value={item.priceFreshness} />
                  </Fact>
                  <Fact label="Stock freshness">
                    <FreshnessBadge value={item.stockFreshness} />
                  </Fact>
                </FactGrid>
                <Link href={`/app/discover/listings/${item.id}`} className="text-sm text-primary">
                  Open listing
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pager
        label="Wholesaler pages"
        page={result.data.page}
        lastPage={lastPage}
        totalLabel={`${result.data.eligibleWholesalerCount} wholesalers · ${result.data.total} listings`}
        previousHref={result.data.page > 1 ? pageHref(base, filters, result.data.page - 1) : null}
        nextHref={result.data.page < lastPage ? pageHref(base, filters, result.data.page + 1) : null}
      />
    </section>
  );
}

function pageHref(
  base: string,
  filters: { q: string; medicinePackId: string; stockStatus: string; minPrice: string; maxPrice: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.medicinePackId) params.set("medicinePackId", filters.medicinePackId);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  params.set("page", String(page));
  return `${base}?${params.toString()}`;
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function oneOf<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | "" {
  const candidate = text(value);
  return allowed.includes(candidate as T) ? (candidate as T) : "";
}
