import Link from "next/link";
import { enquiryPageSchema, distributorListingPageSchema, listingImportPageSchema } from "@medstock/shared-types";
import { Button } from "@/components/ui/button";
import { EmptyState, Metric, PageHeader } from "@/components/page-header";
import { EnquiryBadge } from "@/components/status-badge";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess } from "@/lib/distributor";
import { organizationTypeLabel, roleLabel } from "@/lib/labels";
import { enquiryListTarget, retailerAccess } from "@/lib/retailer";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const account = await loadAccountState();
  const notice = (await searchParams).notice;
  const organizationNotice = notice === "organization";

  if (account.organization.kind === "empty") {
    return (
      <section className="max-w-xl space-y-3">
        <PageHeader title="No active organization" />
        <p className="text-sm leading-6 text-muted-foreground">
          {account.user.email} is signed in, but there is no active MedStock membership for this account.
          {account.organization.inactiveCount > 0
            ? " Existing invitations or suspended memberships do not grant access."
            : " Ask an organization owner to add you."}
        </p>
      </section>
    );
  }

  if (account.organization.kind === "choose") {
    return (
      <section className="max-w-xl space-y-3">
        <PageHeader
          title="Choose an organization"
          description="This account belongs to more than one organization. The choice is only a workspace context. MedStock checks the membership on the server for every request."
        />
        {organizationNotice ? (
          <p className="text-sm text-destructive" role="alert">
            That organization is not an active membership for this account.
          </p>
        ) : null}
      </section>
    );
  }

  const membership = account.organization.membership;
  const retailer = retailerAccess(membership.organization.type) === "allowed";
  const distributor = distributorAccess(membership.organization.type) === "allowed";
  const snapshot = retailer || distributor ? await workspaceSnapshot(membership.organizationId, retailer ? "retailer" : "distributor") : null;

  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        eyebrow={`${organizationTypeLabel(membership.organization.type)} · ${roleLabel(membership.role)}`}
        title={membership.organization.name}
        description="MedStock checks this membership on the server before it reads or changes organization data. Prices and stock shown elsewhere are indicative."
        actions={
          retailer ? (
            <Button asChild>
              <Link href="/app/discover">Discover medicines</Link>
            </Button>
          ) : distributor ? (
            <>
              <Button asChild>
                <Link href="/app/listings">Manage listings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/imports">Import inventory</Link>
              </Button>
            </>
          ) : null
        }
      />
      {membership.organization.status !== "ACTIVE" ? (
        <p className="text-sm text-muted-foreground">
          This organization is {membership.organization.status.replaceAll("_", " ").toLowerCase()}.
        </p>
      ) : null}
      {snapshot ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {snapshot.cards.map((card) => (
            <Metric key={card.label} label={card.label} value={card.value} detail={card.detail} />
          ))}
        </div>
      ) : null}
      {retailer ? (
        <RecentEnquiries
          title="Recent enquiries"
          empty="No enquiries for this retailer yet."
          items={snapshot?.recent ?? []}
        />
      ) : null}
      {distributor ? (
        <RecentEnquiries
          title="Incoming enquiries"
          empty="No incoming enquiries for this distributor yet."
          items={snapshot?.recent ?? []}
        />
      ) : null}
      {!retailer && !distributor ? (
        <EmptyState title="No procurement tools for this organization">
          Listing, discovery, and enquiry tools stay hidden for this organization type.
        </EmptyState>
      ) : null}
    </section>
  );
}

async function workspaceSnapshot(organizationId: string, side: "retailer" | "distributor") {
  const enquiries = await distributorApi(enquiryListTarget(side, organizationId, 1), enquiryPageSchema, {
    returnTo: "/app",
  });
  const listings =
    side === "distributor"
      ? await distributorApi(
          `/distributor/listings?organizationId=${organizationId}&page=1&pageSize=1`,
          distributorListingPageSchema,
          { returnTo: "/app" },
        )
      : null;
  const imports =
    side === "distributor"
      ? await distributorApi(
          `/distributor/imports?organizationId=${organizationId}&page=1&pageSize=1`,
          listingImportPageSchema,
          { returnTo: "/app" },
        )
      : null;
  const enquiryTotal = enquiries.ok ? String(enquiries.data.total) : "Unavailable";
  const cards =
    side === "retailer"
      ? [
          {
            label: "Enquiries",
            value: enquiryTotal,
            detail: enquiries.ok ? "Records returned for this retailer. Not orders." : "The enquiry list could not be loaded.",
          },
        ]
      : [
          {
            label: "Listings",
            value: listings?.ok ? String(listings.data.total) : "Unavailable",
            detail: "Listings owned by this distributor.",
          },
          {
            label: "Imports",
            value: imports?.ok ? String(imports.data.total) : "Unavailable",
            detail: "Saved previews and completed imports.",
          },
          {
            label: "Incoming enquiries",
            value: enquiryTotal,
            detail: "Enquiries are not orders, quotes, or reservations.",
          },
        ];
  return {
    cards,
    recent: enquiries.ok ? enquiries.data.items.slice(0, 3) : [],
  };
}

function RecentEnquiries({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; counterpartyName: string; medicineName: string; status: string }>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2>{title}</h2>
        <Link href="/app/enquiries" className="text-sm font-medium text-primary">
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <Link href={`/app/enquiries/${item.id}`} className="block truncate text-sm font-medium text-primary">
                  {item.medicineName}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{item.counterpartyName}</p>
              </div>
              <EnquiryBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
