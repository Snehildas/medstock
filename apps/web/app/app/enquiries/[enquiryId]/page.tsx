import Link from "next/link";
import { enquiryResponseSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorAccess } from "@/lib/distributor";
import { distributorApi } from "@/lib/distributor-api";
import { enquiryStatusLabel, formatWhen } from "@/lib/labels";
import {
  canCloseEnquiry,
  canRespondToEnquiry,
  enquiryBelongsToOrganization,
  enquiryDetailView,
  retailerAccess,
} from "@/lib/retailer";
import { EnquiryResponseForm } from "@/components/enquiry-create-form";
import { Fact, FactGrid, Notice, PageHeader } from "@/components/page-header";
import { PendingButton } from "@/components/pending-button";
import { EnquiryBadge } from "@/components/status-badge";
import { RequestProblem } from "@/components/workspace-states";
import { closeEnquiry } from "../actions";

const notices: Record<string, string> = {
  created: "Enquiry sent. It does not reserve stock or create an order or quote.",
  closed: "Enquiry closed.",
  responded: "Response saved. It does not change the listing or confirm a quote.",
  "confirm-close": "Confirm the checkbox before closing this enquiry.",
  organization: "The selected organization changed. Reload this page before continuing.",
  terminal: "This enquiry is already closed.",
  rejected: "That enquiry action was not accepted.",
};

export default async function EnquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ enquiryId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { enquiryId } = await params;
  const noticeKey = text((await searchParams).notice);
  const account = await loadAccountState(`/app/enquiries/${enquiryId}`);
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
  const result = await distributorApi(`/${side}/enquiries/${enquiryId}`, enquiryResponseSchema, {
    returnTo: `/app/enquiries/${enquiryId}`,
  });
  if (!result.ok) {
    return <RequestProblem title="Enquiry unavailable" message={result.message} />;
  }
  if (!enquiryBelongsToOrganization(result.data, membership.organizationId, side)) {
    return (
      <RequestProblem
        title="Enquiry unavailable"
        message="This enquiry belongs to a different organization than the one selected. Its details are hidden."
      />
    );
  }
  const enquiry = result.data;
  const view = enquiryDetailView(enquiry);
  const notice = notices[noticeKey];
  return (
    <section key={membership.organizationId} data-organization-id={membership.organizationId} className="space-y-5">
      <PageHeader
        eyebrow={<Link href="/app/enquiries">{retailer ? "Enquiries" : "Incoming enquiries"}</Link>}
        title={enquiry.medicineName}
        description={view.reference}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      <Notice>{view.notice}</Notice>
      <FactGrid>
        <Fact label="Status">
          <EnquiryBadge status={enquiry.status} />
        </Fact>
        <Fact label={retailer ? "Distributor" : "Retailer"}>{enquiry.counterpartyName}</Fact>
        <Fact label="Canonical pack">{enquiry.packDescription}</Fact>
        <Fact label="Requested quantity">{view.quantityLabel}</Fact>
        <Fact label="Created">{formatWhen(enquiry.createdAt)}</Fact>
        <Fact label="Updated">{formatWhen(enquiry.updatedAt)}</Fact>
      </FactGrid>
      <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <h2>Request</h2>
        <p>{enquiry.message ?? "No message was included."}</p>
      </section>
      <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <h2>Distributor response</h2>
        {view.hasResponse ? (
          <>
            <p>{enquiry.responseMessage}</p>
            <p className="text-muted-foreground">
              Responded {enquiry.respondedAt ? formatWhen(enquiry.respondedAt) : "at an unrecorded time"}. The
              response is not a confirmed order, payment request, or guaranteed quote.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No response yet.</p>
        )}
      </section>
      {retailer && canCloseEnquiry(enquiry.status) ? (
        <form action={closeEnquiry} className="max-w-xl space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
          <h2>Confirm close</h2>
          <input type="hidden" name="organizationId" value={membership.organizationId} />
          <input type="hidden" name="enquiryId" value={enquiry.id} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirmClose" />
            Close this enquiry. It cannot be reopened here.
          </label>
          <PendingButton pendingLabel="Closing…" variant="destructive">
            Close enquiry
          </PendingButton>
        </form>
      ) : null}
      {distributor && canRespondToEnquiry(enquiry.status) ? (
        <EnquiryResponseForm key={membership.organizationId} organizationId={membership.organizationId} enquiryId={enquiry.id} />
      ) : null}
      {distributor && !canRespondToEnquiry(enquiry.status) ? (
        <p className="text-sm text-muted-foreground">
          This enquiry is {enquiryStatusLabel(enquiry.status).toLowerCase()}. A response can be sent only while it is open.
        </p>
      ) : null}
    </section>
  );
}

function NeedsOrganization() {
  return (
    <section className="max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Organization required</h1>
      <p className="leading-7 text-muted-foreground">Choose a retailer or distributor organization before opening an enquiry.</p>
    </section>
  );
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}