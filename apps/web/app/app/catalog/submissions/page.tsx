import Link from "next/link";
import { medicineSubmissionPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess } from "@/lib/distributor";

export default async function SubmissionsPage() {
  const account = await loadAccountState("/app/catalog/submissions");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  const result = await distributorApi(
    `/distributor/medicine-submissions?organizationId=${organizationId}&page=1&pageSize=20`,
    medicineSubmissionPageSchema,
    { returnTo: "/app/catalog/submissions" },
  );
  if (!result.ok) {
    return <RequestProblem title="Submissions unavailable" message={result.message} />;
  }
  return (
    <section key={organizationId} data-organization-id={organizationId} className="space-y-5">
      <PageHeader
        title="Medicine submissions"
        description="Only this distributor organization can see these submissions. Approval is required before a medicine can be listed."
        actions={
          <Button asChild>
            <Link href="/app/catalog/submit">Submit a new medicine</Link>
          </Button>
        }
      />
      {result.data.items.length === 0 ? (
        <EmptyState title="No medicine submissions yet." />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th className={thClass}>Medicine</th>
              <th className={thClass}>Submitted</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Review</th>
              <th className={thClass}>Approved medicine</th>
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>
                  <Link href={`/app/catalog/submissions/${item.id}`} className="font-medium text-primary">
                    {item.displayName}
                  </Link>
                </td>
                <td className={tdClass}>{item.createdAt.slice(0, 10)}</td>
                <td className={tdClass}>{item.status.replaceAll("_", " ")}</td>
                <td className={tdClass}>{item.reviewReason ?? "Waiting for review"}</td>
                <td className={tdClass}>
                  {item.approvedMedicineId ? (
                    <Link href={`/app/listings/new?medicineId=${item.approvedMedicineId}`} className="text-primary">
                      {item.displayName}
                    </Link>
                  ) : (
                    "Not approved"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
