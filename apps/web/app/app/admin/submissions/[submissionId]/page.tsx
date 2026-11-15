import Link from "next/link";
import { medicineSubmissionSchema } from "@medstock/shared-types";
import { Fact, FactGrid, PageHeader } from "@/components/page-header";
import { RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { reviewSubmission } from "../actions";

export default async function AdminSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { submissionId } = await params;
  const notice = (await searchParams).notice;
  const account = await loadAccountState(`/app/admin/submissions/${submissionId}`);
  if (account.organization.kind !== "selected" || account.organization.membership.organization.type !== "PLATFORM") {
    return <PageHeader title="Platform admin required" />;
  }
  const result = await distributorApi(`/admin/medicine-submissions/${submissionId}`, medicineSubmissionSchema, {
    returnTo: `/app/admin/submissions/${submissionId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Submission unavailable" message={result.message} />;
  }
  const submission = result.data;
  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/admin/submissions">Review submissions</Link>}
        title={submission.displayName}
        description="Similar names are listed for review. Approval does not merge them and does not create a distributor listing."
      />
      {notice === "reason" ? <p className="text-sm text-destructive">A rejection needs a reason.</p> : null}
      <FactGrid>
        <Fact label="Status">{submission.status.replaceAll("_", " ")}</Fact>
        <Fact label="Brand">{submission.brandName ?? "Not provided"}</Fact>
        <Fact label="Generic">{submission.genericName ?? "Not provided"}</Fact>
        <Fact label="Dosage form">{submission.dosageForm}</Fact>
        <Fact label="Manufacturer">{submission.manufacturerName ?? "Not provided"}</Fact>
        <Fact label="Marketer">{submission.marketerName ?? "Not provided"}</Fact>
        <Fact label="Proposed price">{submission.indicativeUnitPrice ?? "Not provided"}</Fact>
        <Fact label="Proposed MOQ">{submission.minimumOrderQuantity ?? "Not provided"}</Fact>
        <Fact label="Proposed stock">{submission.stockStatus ?? "Not provided"}</Fact>
      </FactGrid>
      <section>
        <h2 className="font-semibold">Ingredients</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {submission.ingredients.map((line) => (
            <li key={line.sequence}>
              {line.ingredientName} · {line.kind} · {line.strengthValue} {line.strengthUnit}
              {line.basis ? ` · ${line.basis}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Packs</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {submission.packs.map((pack) => (
            <li key={pack.description}>
              {pack.description} · {pack.quantity} {pack.unit}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Possible duplicates</h2>
        {submission.candidates.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No similar canonical medicines or pending submissions were found.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {submission.candidates.map((candidate) => (
              <li key={`${candidate.kind}-${candidate.id}`}>
                {candidate.match} {candidate.kind}: {candidate.displayName}
              </li>
            ))}
          </ul>
        )}
      </section>
      {submission.status === "PENDING_REVIEW" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={reviewSubmission}>
            <input type="hidden" name="submissionId" value={submission.id} />
            <input type="hidden" name="decision" value="approve" />
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Approve
            </button>
          </form>
          <form action={reviewSubmission} className="space-y-2">
            <input type="hidden" name="submissionId" value={submission.id} />
            <input type="hidden" name="decision" value="reject" />
            <label className="grid gap-1 text-sm font-medium">
              Rejection reason
              <textarea name="reason" className="min-h-20 rounded-md border px-2 py-1" required />
            </label>
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              Reject
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This decision is already recorded.</p>
      )}
    </section>
  );
}
