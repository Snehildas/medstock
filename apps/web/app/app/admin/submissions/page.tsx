import Link from "next/link";
import { medicineSubmissionPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { workspaceLanding } from "@/lib/organization";

export default async function AdminSubmissionsPage() {
  const account = await loadAccountState("/app/admin/submissions");
  if (account.organization.kind !== "selected" || account.organization.membership.organization.type !== "PLATFORM") {
    return (
      <section className="max-w-xl space-y-3">
        <PageHeader title="Platform admin required" description="Submission review stays on the server. Hiding this page is not the authorization check." />
        <Link href={account.organization.kind === "selected" ? workspaceLanding(account.organization.membership.organization.type) : "/app"}>
          Back
        </Link>
      </section>
    );
  }
  const result = await distributorApi("/admin/medicine-submissions?page=1&pageSize=20", medicineSubmissionPageSchema, {
    returnTo: "/app/admin/submissions",
  });
  if (!result.ok) {
    return <RequestProblem title="Review queue unavailable" message={result.message} />;
  }
  return (
    <section className="space-y-5">
      <PageHeader title="Review medicine submissions" description="Pending distributor submissions. Approval publishes a canonical medicine. It does not create a listing." />
      {result.data.items.length === 0 ? (
        <EmptyState title="No submissions are waiting for review." />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th className={thClass}>Medicine</th>
              <th className={thClass}>Submitted</th>
              <th className={thClass}>Possible matches</th>
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>
                  <Link href={`/app/admin/submissions/${item.id}`} className="font-medium text-primary">
                    {item.displayName}
                  </Link>
                </td>
                <td className={tdClass}>{item.createdAt.slice(0, 10)}</td>
                <td className={tdClass}>{item.candidates.length}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
