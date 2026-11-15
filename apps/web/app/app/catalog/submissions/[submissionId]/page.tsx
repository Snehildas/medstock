import Link from "next/link";
import { medicineSubmissionSchema } from "@medstock/shared-types";
import { Fact, FactGrid, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DistributorRequired, RequestProblem } from "@/components/workspace-states";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";
import { distributorAccess } from "@/lib/distributor";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { submissionId } = await params;
  const notice = (await searchParams).notice;
  const account = await loadAccountState(`/app/catalog/submissions/${submissionId}`);
  if (account.organization.kind !== "selected" || distributorAccess(account.organization.membership.organization.type) === "blocked") {
    return <DistributorRequired />;
  }
  const organizationId = account.organization.membership.organizationId;
  const result = await distributorApi(
    `/distributor/medicine-submissions/${submissionId}?organizationId=${organizationId}`,
    medicineSubmissionSchema,
    { returnTo: `/app/catalog/submissions/${submissionId}` },
  );
  if (!result.ok) {
    return <RequestProblem title="Submission unavailable" message={result.message} />;
  }
  const submission = result.data;
  if (submission.organizationId !== organizationId) {
    return <RequestProblem title="Submission unavailable" message="That submission belongs to another organization." />;
  }
  return (
    <section key={organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/catalog/submissions">Medicine submissions</Link>}
        title={submission.displayName}
        description={submission.notice}
        actions={
          submission.status === "APPROVED" && submission.approvedMedicineId ? (
            <Button asChild>
              <Link
                href={`/app/listings/new?medicineId=${submission.approvedMedicineId}&unitPrice=${encodeURIComponent(submission.indicativeUnitPrice ?? "")}&minimumOrderQuantity=${encodeURIComponent(submission.minimumOrderQuantity ?? "")}&stockStatus=${encodeURIComponent(submission.stockStatus ?? "")}&availableQuantity=${encodeURIComponent(submission.availableQuantity ?? "")}&sourceNote=${encodeURIComponent(submission.sourceNote ?? "")}`}
              >
                Create listing from saved inventory
              </Link>
            </Button>
          ) : null
        }
      />
      {notice === "submitted" ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm" role="status">
          Your new medicine has been submitted successfully and is awaiting catalog approval.
        </p>
      ) : null}
      <FactGrid>
        <Fact label="Status">{submission.status.replaceAll("_", " ")}</Fact>
        <Fact label="Submitted">{submission.createdAt.slice(0, 10)}</Fact>
        <Fact label="Brand">{submission.brandName ?? "Not provided"}</Fact>
        <Fact label="Generic">{submission.genericName ?? "Not provided"}</Fact>
        <Fact label="Dosage form">{submission.dosageForm}</Fact>
        <Fact label="Review">{submission.reviewReason ?? "No review note"}</Fact>
        <Fact label="Indicative price">{submission.indicativeUnitPrice ? `₹${submission.indicativeUnitPrice}` : "Not provided"}</Fact>
        <Fact label="MOQ">{submission.minimumOrderQuantity ?? "Not provided"}</Fact>
        <Fact label="Stock">{submission.stockStatus?.replaceAll("_", " ") ?? "Not provided"}</Fact>
      </FactGrid>
      <section className="space-y-2">
        <h2 className="font-semibold">Ingredients</h2>
        <ul className="space-y-1 text-sm">
          {submission.ingredients.map((line) => (
            <li key={`${line.sequence}-${line.ingredientName}`}>
              {line.ingredientName} · {line.kind} · {line.strengthValue} {line.strengthUnit}
              {line.basis ? ` · ${line.basis}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Packs</h2>
        <ul className="space-y-1 text-sm">
          {submission.packs.map((pack) => (
            <li key={pack.description}>
              {pack.description} · {pack.quantity} {pack.unit}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
