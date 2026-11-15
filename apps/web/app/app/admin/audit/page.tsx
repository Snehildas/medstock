import Link from "next/link";
import { auditEventPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { workspaceLanding } from "@/lib/organization";

export default async function AuditEventsPage() {
  const account = await loadAccountState("/app/admin/audit");
  if (account.organization.kind !== "selected" || account.organization.membership.organization.type !== "PLATFORM") {
    return (
      <section className="max-w-xl space-y-3">
        <PageHeader
          title="Platform admin required"
          description="Audit events stay on the server. Hiding this page is not the authorization check."
        />
        <Link href={account.organization.kind === "selected" ? workspaceLanding(account.organization.membership.organization.type) : "/app"}>
          Back
        </Link>
      </section>
    );
  }
  const result = await distributorApi("/admin/audit-events?page=1&pageSize=20", auditEventPageSchema, {
    returnTo: "/app/admin/audit",
  });
  if (!result.ok) {
    return <RequestProblem title="Audit events unavailable" message={result.message} />;
  }
  return (
    <section className="space-y-5">
      <PageHeader
        title="Audit events"
        description="Recent catalog, submission, listing, and enquiry changes. Sample demo records are illustrative."
      />
      {result.data.items.length === 0 ? (
        <EmptyState title="No audit events yet." />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th className={thClass}>When</th>
              <th className={thClass}>Area</th>
              <th className={thClass}>Action</th>
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((event) => (
              <tr key={event.id}>
                <td className={tdClass}>{new Date(event.createdAt).toLocaleString("en-IN")}</td>
                <td className={tdClass}>{event.area}</td>
                <td className={tdClass}>{event.action}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
