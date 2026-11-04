import Link from "next/link";
import { enquiryPageSchema } from "@medstock/shared-types";
import { DataTable, tdClass, thClass } from "@/components/data-table";
import { EmptyState, PageHeader, Pager } from "@/components/page-header";
import { EnquiryBadge } from "@/components/status-badge";
import { loadAccountState } from "@/lib/account";
import { distributorAccess } from "@/lib/distributor";
import { distributorApi } from "@/lib/distributor-api";
import { formatWhen } from "@/lib/labels";
import { enquiryBelongsToOrganization, enquiryDetailView, enquiryListTarget, retailerAccess } from "@/lib/retailer";
import { RequestProblem } from "@/components/workspace-states";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const account = await loadAccountState("/app/enquiries");
  if (account.organization.kind !== "selected") {
    return <NeedsOrganization />;
  }
  const membership = account.organization.membership;
  const retailer = retailerAccess(membership.organization.type) === "allowed";
  const distributor = distributorAccess(membership.organization.type) === "allowed";
  if (!retailer && !distributor) {
    return <NeedsOrganization />;
  }
  const side = retailer ? "retailer" : "distributor";
  const page = Math.max(1, Number(text((await searchParams).page)) || 1);
  const result = await distributorApi(enquiryListTarget(side, membership.organizationId, page), enquiryPageSchema, {
    returnTo: "/app/enquiries",
  });
  if (!result.ok) {
    return <RequestProblem title="Enquiries unavailable" message={result.message} />;
  }
  if (result.data.items.some((item) => !enquiryBelongsToOrganization(item, membership.organizationId, side))) {
    return (
      <RequestProblem
        title="Enquiries unavailable"
        message="The response did not match the selected organization. Reload after the workspace finishes changing."
      />
    );
  }
  const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize));
  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        title={retailer ? "Enquiries" : "Incoming enquiries"}
        description="An enquiry is not an order, a quote, or a stock reservation. Quantity is a number of catalog packs."
      />
      {result.data.items.length === 0 ? (
        <EmptyState title={retailer ? "No enquiries for this retailer yet." : "No incoming enquiries for this distributor yet."} />
      ) : (
        <DataTable className="min-w-[48rem]">
          <thead>
            <tr>
              <th className={thClass}>{retailer ? "Distributor" : "Retailer"}</th>
              <th className={thClass}>Medicine and pack</th>
              <th className={thClass}>Catalog packs</th>
              {distributor ? <th className={thClass}>Message</th> : null}
              <th className={thClass}>Status</th>
              <th className={thClass}>Created</th>
              {retailer ? <th className={thClass}>Response</th> : null}
            </tr>
          </thead>
          <tbody>
            {result.data.items.map((enquiry) => {
              const view = enquiryDetailView(enquiry);
              return (
                <tr key={enquiry.id}>
                  <td className={tdClass}>{enquiry.counterpartyName}</td>
                  <td className={tdClass}>
                    <Link href={`/app/enquiries/${enquiry.id}`} className="font-medium text-primary">
                      {enquiry.medicineName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{enquiry.packDescription}</span>
                  </td>
                  <td className={tdClass}>{view.quantityLabel}</td>
                  {distributor ? <td className={tdClass}>{enquiry.message ?? "No message"}</td> : null}
                  <td className={tdClass}>
                    <EnquiryBadge status={enquiry.status} />
                  </td>
                  <td className={tdClass}>{formatWhen(enquiry.createdAt)}</td>
                  {retailer ? <td className={tdClass}>{view.hasResponse ? "Response available" : "No response yet"}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      <Pager
        label="Enquiry pages"
        page={result.data.page}
        lastPage={lastPage}
        totalLabel=""
        previousHref={result.data.page > 1 ? `/app/enquiries?page=${result.data.page - 1}` : null}
        nextHref={result.data.page < lastPage ? `/app/enquiries?page=${result.data.page + 1}` : null}
      />
    </section>
  );
}

function NeedsOrganization() {
  return (
    <section className="max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Organization required</h1>
      <p className="leading-7 text-muted-foreground">
        Enquiry history is available for a retailer or a distributor organization. The API still checks the membership.
      </p>
      <Link href="/app" className="text-sm underline-offset-4 hover:underline">
        Back to workspace
      </Link>
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
