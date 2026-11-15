import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MedicineSubmissionForm } from "@/components/medicine-submission-form";
import { DistributorRequired } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorAccess } from "@/lib/distributor";

export default async function SubmitMedicinePage() {
  const account = await loadAccountState("/app/catalog/submit");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/discover">Find medicines</Link>}
        title="Register New Medicine"
        description="Type a medicine that is not in the catalog. This does not search existing medicines, publish the catalog entry, or create an active listing."
      />
      <MedicineSubmissionForm organizationId={organizationId} />
    </section>
  );
}
