import Link from "next/link";
import { distributorListingSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess, listingActions } from "@/lib/distributor";
import { ListingEditForm } from "@/components/listing-edit-form";
import { Fact, FactGrid, Notice, PageHeader } from "@/components/page-header";
import { PendingButton } from "@/components/pending-button";
import { FreshnessBadge, ListingBadge, StockBadge } from "@/components/status-badge";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";
import { transitionListing } from "../actions";

const notices: Record<string, string> = {
  created: "Listing created. The price is indicative and stock is not guaranteed.",
  saved: "Listing saved. Freshness is calculated by the server.",
  pause: "Listing paused. It stays on file and can be resumed.",
  resume: "Listing resumed. Active does not mean stock is available.",
  archive: "Listing archived. It stays on file and is not reactivated here.",
  "confirm-archive": "Confirm the archive checkbox before archiving.",
  organization: "The selected organization changed. Reload this page before saving.",
  rejected: "That listing action was not accepted.",
};

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { listingId } = await params;
  const noticeKey = text((await searchParams).notice);
  const account = await loadAccountState(`/app/listings/${listingId}`);
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const membership = account.organization.membership;
  const result = await distributorApi(`/distributor/listings/${listingId}`, distributorListingSchema, {
    returnTo: `/app/listings/${listingId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Listing unavailable" message={result.message} />;
  }
  if (result.data.organizationId !== membership.organizationId) {
    return (
      <RequestProblem
        title="Listing unavailable"
        message="This listing belongs to a different organization than the one selected. Its details are hidden until you open it from that organization."
      />
    );
  }
  const listing = result.data;
  const actions = listingActions(listing.status);
  const notice = notices[noticeKey];

  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/listings">My listings</Link>}
        title={listing.medicine.displayName}
        description={`${listing.pack.description} · ${listing.pack.quantity} ${listing.pack.unit}. Catalog details are read-only.`}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      <FactGrid>
        <Fact label="Listing status">
          <ListingBadge status={listing.status} />
        </Fact>
        <Fact label="Stock status">
          <StockBadge status={listing.stockStatus} />
        </Fact>
        <Fact label="Indicative unit price">
          {listing.currency} {listing.unitPrice}
        </Fact>
        <Fact label="Minimum order quantity">{listing.minimumOrderQuantity}</Fact>
        <Fact label="Available quantity">{listing.availableQuantity ?? "Not supplied"}</Fact>
        <Fact label="Price freshness">
          <FreshnessBadge value={listing.priceFreshness} />
        </Fact>
        <Fact label="Stock freshness">
          <FreshnessBadge value={listing.stockFreshness} />
        </Fact>
      </FactGrid>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        The price is indicative, not a guaranteed quote. Listing status and stock status are separate. An active
        listing does not mean the quantity is available.
      </p>
      {listing.status === "SUSPENDED" ? (
        <p className="text-sm">A platform admin suspended this listing. It cannot be edited, paused, or resumed here.</p>
      ) : null}
      {listing.status === "ARCHIVED" ? (
        <p className="text-sm">This listing is archived. It stays on file and is not reactivated from this screen. An import will not reactivate it.</p>
      ) : null}
      {actions.canEdit ? (
        <ListingEditForm
          organizationId={membership.organizationId}
          listing={{
            id: listing.id,
            unitPrice: listing.unitPrice,
            minimumOrderQuantity: listing.minimumOrderQuantity,
            stockStatus: listing.stockStatus,
            availableQuantity: listing.availableQuantity,
            sourceNote: listing.sourceNote,
          }}
        />
      ) : null}
      <div className="flex flex-col gap-4">
        {actions.canPause ? (
          <form action={transitionListing} className="space-y-2">
            <HiddenListing organizationId={membership.organizationId} listingId={listing.id} action="pause" />
            <PendingButton pendingLabel="Pausing…" variant="outline">
              Pause listing
            </PendingButton>
            <p className="text-sm text-muted-foreground">Pausing keeps the listing and hides it from retailer discovery.</p>
          </form>
        ) : null}
        {actions.canResume ? (
          <form action={transitionListing} className="space-y-2">
            <HiddenListing organizationId={membership.organizationId} listingId={listing.id} action="resume" />
            <PendingButton pendingLabel="Resuming…" variant="outline">
              Resume listing
            </PendingButton>
            <p className="text-sm text-muted-foreground">Resuming does not confirm that stock is available.</p>
          </form>
        ) : null}
        {actions.canArchive ? (
          <form action={transitionListing} className="max-w-xl space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
            <h2>Confirm archive</h2>
            <HiddenListing organizationId={membership.organizationId} listingId={listing.id} action="archive" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmArchive" />
              Archive this listing. This cannot be undone here.
            </label>
            <PendingButton pendingLabel="Archiving…" variant="destructive">
              Archive listing
            </PendingButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function HiddenListing({
  organizationId,
  listingId,
  action,
}: {
  organizationId: string;
  listingId: string;
  action: string;
}) {
  return (
    <>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="action" value={action} />
    </>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
