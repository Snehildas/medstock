import Link from "next/link";
import { distributorListingPageSchema, distributorProfileSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader, Pager } from "@/components/page-header";
import { FreshnessBadge, ListingBadge, StockBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { labelClass } from "@/components/ui/field";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess, listingQuery } from "@/lib/distributor";
import { listingStatusLabel, stockStatusLabel } from "@/lib/labels";
import { DistributorProfileForm } from "@/components/distributor-profile-form";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";

const listingStatuses = ["ACTIVE", "PAUSED", "ARCHIVED", "SUSPENDED"] as const;
const stockStatuses = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"] as const;

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[]; stockStatus?: string | string[]; page?: string | string[] }>;
}) {
  const account = await loadAccountState("/app/listings");
  if (account.organization.kind !== "selected") {
    return <DistributorRequired />;
  }
  const membership = account.organization.membership;
  if (distributorAccess(membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const query = await searchParams;
  const q = text(query.q);
  const status = oneOf(query.status, listingStatuses);
  const stockStatus = oneOf(query.stockStatus, stockStatuses);
  const page = Math.max(1, Number(text(query.page)) || 1);
  const result = await distributorApi(
    listingQuery({
      organizationId: membership.organizationId,
      q,
      ...(status ? { status } : {}),
      ...(stockStatus ? { stockStatus } : {}),
      page,
    }),
    distributorListingPageSchema,
    { returnTo: "/app/listings" },
  );
  if (!result.ok) {
    return <RequestProblem title="Listings unavailable" message={result.message} />;
  }
  if (result.data.items.some((item) => item.organizationId !== membership.organizationId)) {
    return (
      <RequestProblem
        title="Listings unavailable"
        message="The response did not match the selected organization. Reload after the workspace finishes changing."
      />
    );
  }
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));

  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        title="My listings"
        description="Prices are indicative. They are not guaranteed quotes. An active listing does not mean the pack is in stock."
        actions={
          <>
            <Button asChild>
              <Link href="/app/listings/new">Add Existing Medicine</Link>
            </Button>
            <Button asChild>
              <Link href="/app/catalog/submit">+ Add New Medicine</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/imports">Upload inventory</Link>
            </Button>
          </>
        }
      />
      <ProfileCard organizationId={membership.organizationId} canEdit={membership.role === "DISTRIBUTOR_OWNER"} />
      <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        <label className={`${labelClass} md:col-span-2`}>
          Medicine or pack
          <input name="q" defaultValue={q} />
        </label>
        <label className={labelClass}>
          Listing status
          <select name="status" defaultValue={status}>
            <option value="">Any status</option>
            {listingStatuses.map((value) => (
              <option key={value} value={value}>
                {listingStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Stock status
          <select name="stockStatus" defaultValue={stockStatus}>
            <option value="">Any stock status</option>
            {stockStatuses.map((value) => (
              <option key={value} value={value}>
                {stockStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="md:col-start-4">
          Apply filters
        </Button>
      </form>
      {result.data.items.length === 0 ? (
        <EmptyState title="No listings match this organization and these filters." />
      ) : (
        <DataTable className="min-w-[56rem]">
          <thead>
            <tr>
              <th className={thClass}>Medicine</th>
              <th className={thClass}>Pack</th>
              <th className={thClass}>Indicative price</th>
              <th className={thClass}>MOQ</th>
              <th className={thClass}>Stock status</th>
              <th className={thClass}>Available quantity</th>
              <th className={thClass}>Price freshness</th>
              <th className={thClass}>Stock freshness</th>
              <th className={thClass}>Listing status</th>
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((listing) => (
              <tr key={listing.id}>
                <td className={tdClass}>
                  <Link href={`/app/listings/${listing.id}`} className="font-medium text-primary">
                    {listing.medicine.displayName}
                  </Link>
                </td>
                <td className={tdClass}>{listing.pack.description}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {listing.currency} {listing.unitPrice}
                </td>
                <td className={`${tdClass} tabular-nums`}>{listing.minimumOrderQuantity}</td>
                <td className={tdClass}>
                  <StockBadge status={listing.stockStatus} />
                </td>
                <td className={tdClass}>{listing.availableQuantity ?? "Not supplied"}</td>
                <td className={tdClass}>
                  <FreshnessBadge value={listing.priceFreshness} />
                </td>
                <td className={tdClass}>
                  <FreshnessBadge value={listing.stockFreshness} />
                </td>
                <td className={tdClass}>
                  <ListingBadge status={listing.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Pager
        label="Listing pages"
        page={result.data.page}
        lastPage={lastPage}
        totalLabel={`${result.data.total} listings`}
        previousHref={result.data.page > 1 ? filterHref({ q, status, stockStatus, page: result.data.page - 1 }) : null}
        nextHref={result.data.page < lastPage ? filterHref({ q, status, stockStatus, page: result.data.page + 1 }) : null}
      />
    </section>
  );
}

async function ProfileCard({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const profile = await distributorApi(
    `/distributor/profile?organizationId=${organizationId}`,
    distributorProfileSchema,
    { returnTo: "/app/listings" },
  );
  if (!profile.ok) {
    return <RequestProblem title="Wholesaler profile unavailable" message={profile.message} />;
  }
  return (
    <DistributorProfileForm organizationId={organizationId} profile={profile.data} canEdit={canEdit} />
  );
}

function filterHref(input: { q: string; status: string; stockStatus: string; page: number }): string {
  const params = new URLSearchParams();
  if (input.q) {
    params.set("q", input.q);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.stockStatus) {
    params.set("stockStatus", input.stockStatus);
  }
  params.set("page", String(input.page));
  return `/app/listings?${params.toString()}`;
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function oneOf<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | "" {
  const raw = text(value);
  return allowed.includes(raw as T) ? (raw as T) : "";
}
