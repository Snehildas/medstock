import Link from "next/link";
import { loadAccountState } from "@/lib/account";
import { distributorAccess } from "@/lib/distributor";
import { PageHeader } from "@/components/page-header";
import { ListingCreateForm } from "@/components/listing-create-form";
import { DistributorRequired } from "@/components/workspace-states";

export default async function NewListingPage() {
  const account = await loadAccountState("/app/listings/new");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/listings">My listings</Link>}
        title="Create listing"
        description="Choose a published catalog pack. The medicine name, composition, and pack size stay read-only. The price you enter is indicative."
      />
      <ListingCreateForm organizationId={organizationId} />
      <Link href="/app/listings" className="text-sm underline-offset-4 hover:underline">
        Back to listings
      </Link>
    </section>
  );
}
