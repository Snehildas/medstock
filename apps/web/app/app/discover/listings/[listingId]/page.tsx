import Link from "next/link";
import { retailerListingSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { comparisonView, retailerAccess } from "@/lib/retailer";
import { EnquiryCreateForm } from "@/components/enquiry-create-form";
import { Fact, FactGrid, PageHeader } from "@/components/page-header";
import { FreshnessBadge, StockBadge } from "@/components/status-badge";
import { RequestProblem } from "@/components/workspace-states";

export default async function DiscoveredListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const account = await loadAccountState(`/app/discover/listings/${listingId}`);
  if (account.organization.kind !== "selected" || retailerAccess(account.organization.membership.organization.type) === "blocked") {
    return (
      <section className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Retailer organization required</h1>
        <p className="leading-7 text-muted-foreground">Choose a retailer organization before sending an enquiry.</p>
      </section>
    );
  }
  const organizationId = account.organization.membership.organizationId;
  const result = await distributorApi(`/listings/${listingId}`, retailerListingSchema, {
    returnTo: `/app/discover/listings/${listingId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Listing unavailable" message={result.message} />;
  }
  const listing = result.data;
  const view = comparisonView(listing);
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href={`/app/discover/listings?medicineId=${listing.medicine.id}`}>Compare listings</Link>}
        title={view.medicine}
        description={`${view.distributor} · ${view.pack} · ${listing.pack.quantity} ${listing.pack.unit}`}
      />
      <FactGrid>
        <Fact label="Indicative unit price">{view.priceLabel}</Fact>
        <Fact label="Minimum order quantity">{view.minimumOrderQuantity}</Fact>
        <Fact label="Stock status">
          <StockBadge status={view.stockStatus} />
        </Fact>
        <Fact label="Available quantity">{view.availableQuantity}</Fact>
        <Fact label="Price freshness">
          <FreshnessBadge value={view.priceFreshness} />
        </Fact>
        <Fact label="Stock freshness">
          <FreshnessBadge value={view.stockFreshness} />
        </Fact>
      </FactGrid>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        The price is indicative. Freshness means the distributor updated the figure recently. Neither the price nor
        an active listing guarantees that stock is available. Medicine and pack details cannot be edited here.
      </p>
      <EnquiryCreateForm
        key={organizationId}
        organizationId={organizationId}
        listingId={listing.id}
        distributorName={view.distributor}
        packDescription={view.pack}
      />
    </section>
  );
}
