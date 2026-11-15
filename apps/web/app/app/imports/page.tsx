import { Suspense } from "react";
import Link from "next/link";
import { listingImportPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader, Pager } from "@/components/page-header";
import { ImportBadge } from "@/components/status-badge";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess } from "@/lib/distributor";
import { formatWhen } from "@/lib/labels";
import { ImportUpload } from "@/components/import-upload";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";

export default function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading imports…</p>}>
      <ImportsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ImportsContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const account = await loadAccountState("/app/imports");
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const membership = account.organization.membership;
  const page = Math.max(1, Number(text((await searchParams).page)) || 1);
  const result = await distributorApi(
    `/distributor/imports?organizationId=${membership.organizationId}&page=${page}&pageSize=20`,
    listingImportPageSchema,
    { returnTo: "/app/imports" },
  );
  if (!result.ok) {
    return <RequestProblem title="Imports unavailable" message={result.message} />;
  }
  if (result.data.items.some((item) => item.organizationId !== membership.organizationId)) {
    return (
      <RequestProblem
        title="Imports unavailable"
        message="The response did not match the selected organization. Reload after the workspace finishes changing."
      />
    );
  }
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));

  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        title="Imports"
        description="Upload a CSV or XLSX file to preview rows. Nothing is committed until you open the preview and choose Commit import. A committed import does not guarantee that inventory is available."
      />
      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        {["1. Upload file", "2. Preview rows", "3. Review errors", "4. Commit or cancel"].map((step) => (
          <li key={step} className="rounded-md border bg-card px-3 py-2 font-medium">
            {step}
          </li>
        ))}
      </ol>
      <div className="rounded-lg border bg-card p-4">
        <h2>Upload</h2>
        <div className="mt-3">
          <ImportUpload organizationId={membership.organizationId} />
        </div>
      </div>
      <div className="space-y-3">
        <h2>History</h2>
        {result.data.items.length === 0 ? (
          <EmptyState title="No imports for this organization yet." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className={thClass}>File</th>
                <th className={thClass}>Uploaded</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Rows</th>
                <th className={thClass}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((item) => (
                <tr key={item.id}>
                  <td className={tdClass}>
                    <Link href={`/app/imports/${item.id}`} className="font-medium text-primary">
                      {item.fileName}
                    </Link>
                  </td>
                  <td className={tdClass}>{formatWhen(item.createdAt)}</td>
                  <td className={tdClass}>
                    <ImportBadge status={item.status} />
                  </td>
                  <td className={tdClass}>
                    {item.totalRows} total, {item.validRows} valid, {item.invalidRows} invalid
                  </td>
                  <td className={tdClass}>{item.completedAt ? formatWhen(item.completedAt) : "Not completed"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pager
          label="Import pages"
          page={result.data.page}
          lastPage={lastPage}
          totalLabel=""
          previousHref={result.data.page > 1 ? `/app/imports?page=${result.data.page - 1}` : null}
          nextHref={result.data.page < lastPage ? `/app/imports?page=${result.data.page + 1}` : null}
        />
      </div>
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
