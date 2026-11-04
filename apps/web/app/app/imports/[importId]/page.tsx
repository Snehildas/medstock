import Link from "next/link";
import { listingImportSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { commitOutcome, distributorAccess, importActions, importRowView } from "@/lib/distributor";
import { formatWhen, stockStatusLabel } from "@/lib/labels";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { Notice, PageHeader } from "@/components/page-header";
import { PendingButton } from "@/components/pending-button";
import { ImportBadge } from "@/components/status-badge";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";
import { cancelImport, commitImport } from "../actions";

const notices: Record<string, string> = {
  committed: "Import committed. Created, updated, skipped, and failed counts are below. This does not guarantee inventory.",
  cancelled: "Import cancelled. Listings were not changed.",
  "confirm-cancel": "Confirm the cancel checkbox before cancelling this preview.",
  organization: "The selected organization changed. Reload this page before continuing.",
  terminal: "This import is already finished. Commit and cancel are closed.",
  rejected: "That import action was not accepted.",
};

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { importId } = await params;
  const noticeKey = text((await searchParams).notice);
  const account = await loadAccountState(`/app/imports/${importId}`);
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const membership = account.organization.membership;
  const result = await distributorApi(`/distributor/imports/${importId}`, listingImportSchema, {
    returnTo: `/app/imports/${importId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Import unavailable" message={result.message} />;
  }
  if (result.data.organizationId !== membership.organizationId) {
    return (
      <RequestProblem
        title="Import unavailable"
        message="This import belongs to a different organization than the one selected. Its rows are hidden."
      />
    );
  }
  const preview = result.data;
  const actions = importActions(preview.status);
  const notice = notices[noticeKey];

  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/imports">Imports</Link>}
        title={preview.fileName}
        description={`Uploaded ${formatWhen(preview.createdAt)}${preview.completedAt ? ` · Completed ${formatWhen(preview.completedAt)}` : ""}`}
        actions={<ImportBadge status={preview.status} />}
      />
      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        <li className="rounded-md border bg-card px-3 py-2">1. Upload file</li>
        <li className="rounded-md border bg-primary/10 px-3 py-2 font-medium">2. Preview rows</li>
        <li className="rounded-md border bg-card px-3 py-2">3. Review errors and warnings</li>
        <li className="rounded-md border bg-card px-3 py-2">4. Confirm commit or cancel</li>
      </ol>
      {notice ? <Notice>{notice}</Notice> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Total rows</dt>
          <dd>{preview.totalRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Valid rows</dt>
          <dd>{preview.validRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invalid rows</dt>
          <dd>{preview.invalidRows}</dd>
        </div>
      </dl>
      {commitOutcome(preview.status) === "show-summary" ? (
        <div className="rounded-lg border p-4 text-sm">
          <h2 className="font-medium">Completion summary</h2>
          <p className="mt-2">
            Created {preview.createdRows}, updated {preview.updatedRows}, skipped {preview.skippedRows}, failed{" "}
            {preview.failedRows}.
          </p>
          <p className="mt-2 text-muted-foreground">
            These counts record what the import wrote. They do not guarantee that stock is available.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This is a saved preview. Upload did not change listings. Commit applies the valid rows. Invalid rows are
          skipped.
        </p>
      )}
      <div className="space-y-2">
        <h2>Review rows</h2>
      <DataTable className="min-w-[64rem]">
        <thead>
          <tr>
            <th className={thClass}>Row</th>
            <th className={thClass}>Matched medicine</th>
            <th className={thClass}>Matched pack</th>
            <th className={thClass}>Indicative price</th>
            <th className={thClass}>Effect</th>
            <th className={thClass}>Errors</th>
            <th className={thClass}>Warnings</th>
            <th className={thClass}>Outcome</th>
          </tr>
        </thead>
          <tbody>
            {preview.rows.map((row) => {
              const view = importRowView(row);
              return (
                <tr key={row.rowNumber}>
                  <td className={tdClass}>{row.rowNumber}</td>
                  <td className={tdClass}>{row.matchedMedicineName ?? "No match"}</td>
                  <td className={tdClass}>{row.matchedPackDescription ?? "No match"}</td>
                  <td className={tdClass}>
                    {row.indicativeUnitPrice ? `${row.currency ?? "INR"} ${row.indicativeUnitPrice}` : "—"}
                    {row.stockStatus ? <span className="block text-muted-foreground">{stockStatusLabel(row.stockStatus)}</span> : null}
                  </td>
                  <td className={tdClass}>{view.effect}</td>
                  <td className={tdClass}>
                    {view.errors.length > 0 ? (
                      <ul>
                        {view.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    ) : (
                      "None"
                    )}
                  </td>
                  <td className={tdClass}>
                    {view.warnings.length > 0 ? (
                      <ul>
                        {view.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : (
                      "None"
                    )}
                  </td>
                  <td className={tdClass}>{row.outcome ?? "Pending"}</td>
                </tr>
              );
            })}
          </tbody>
      </DataTable>
      </div>
      {actions.canCommit ? (
        <form action={commitImport} className="space-y-2">
          <input type="hidden" name="importId" value={preview.id} />
          <input type="hidden" name="organizationId" value={membership.organizationId} />
          <PendingButton pendingLabel="Committing import…">Commit import</PendingButton>
          <p className="text-sm text-muted-foreground">Commit is a separate action from upload. Repeating it returns the same summary.</p>
        </form>
      ) : null}
      {actions.canCancel ? (
        <form action={cancelImport} className="max-w-xl space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
          <h2>Confirm cancel</h2>
          <input type="hidden" name="importId" value={preview.id} />
          <input type="hidden" name="organizationId" value={membership.organizationId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirmCancel" />
            Cancel this preview. Listings will not change.
          </label>
          <PendingButton pendingLabel="Cancelling…" variant="destructive">
            Cancel import
          </PendingButton>
        </form>
      ) : null}
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
