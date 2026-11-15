"use server";

import { redirect } from "next/navigation";
import { medicineSubmissionSchema } from "@medstock/shared-types";
import { loadAccountState } from "@/lib/account";
import { distributorApi } from "@/lib/distributor-api";

export async function reviewSubmission(formData: FormData): Promise<void> {
  const submissionId = String(formData.get("submissionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const account = await loadAccountState(`/app/admin/submissions/${submissionId}`);
  if (account.organization.kind !== "selected" || account.organization.membership.organization.type !== "PLATFORM") {
    redirect("/app");
  }
  if (decision === "reject" && String(formData.get("reason") ?? "").trim().length === 0) {
    redirect(`/app/admin/submissions/${submissionId}?notice=reason`);
  }
  const result =
    decision === "approve"
      ? await distributorApi(`/admin/medicine-submissions/${submissionId}/approve`, medicineSubmissionSchema, {
          method: "POST",
          returnTo: `/app/admin/submissions/${submissionId}`,
        })
      : await distributorApi(`/admin/medicine-submissions/${submissionId}/reject`, medicineSubmissionSchema, {
          method: "POST",
          returnTo: `/app/admin/submissions/${submissionId}`,
          body: { reason: String(formData.get("reason") ?? "") },
        });
  if (!result.ok) {
    redirect(`/app/admin/submissions/${submissionId}?notice=rejected`);
  }
  redirect(`/app/admin/submissions/${submissionId}?notice=${decision}`);
}
