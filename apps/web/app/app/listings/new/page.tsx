import Link from "next/link";
import { loadAccountState } from "@/lib/account";
import { distributorAccess } from "@/lib/distributor";
import { PageHeader } from "@/components/page-header";
import { ListingCreateForm } from "@/components/listing-create-form";
import { DistributorRequired } from "@/components/workspace-states";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await loadAccountState("/app/listings/new");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  const query = await searchParams;
  const medicineId = text(query.medicineId);
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/listings">My listings</Link>}
        title="Add existing medicine"
        description="Search the published catalog and choose a canonical pack. This does not register a new medicine. The price you enter is indicative."
      />
      <ListingCreateForm
        organizationId={organizationId}
        initialMedicineId={medicineId || undefined}
        commercialDefaults={{
          unitPrice: text(query.unitPrice),
          minimumOrderQuantity: text(query.minimumOrderQuantity),
          stockStatus: text(query.stockStatus) || "UNKNOWN",
          availableQuantity: text(query.availableQuantity),
          sourceNote: text(query.sourceNote),
        }}
      />
      <Link href="/app/listings" className="text-sm underline-offset-4 hover:underline">
        Back to listings
      </Link>
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
