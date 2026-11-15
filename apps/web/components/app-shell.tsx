import type { ReactNode } from "react";
import { AppFrame, type ShellGroup } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { selectOrganization, type AccountState } from "@/lib/account";
import { organizationTypeLabel, roleLabel } from "@/lib/labels";
import { activeMemberships } from "@/lib/organization";

export function AppShell({
  account,
  notice,
  preview = false,
  demo = false,
  children,
}: {
  account: AccountState;
  notice: string | null;
  preview?: boolean;
  demo?: boolean;
  children: ReactNode;
}) {
  const selected = account.organization.kind === "selected" ? account.organization.membership : null;
  const choices = activeMemberships(
    account.user.memberships.map((membership) => ({
      organizationId: membership.organizationId,
      status: membership.status,
      role: membership.role,
      organization: membership.organization,
    })),
  );
  const groups = navigationFor(selected?.organization.type);

  return (
    <AppFrame
      groups={groups}
      preview={preview}
      demo={demo}
      displayName={account.user.name ?? account.user.email}
      email={account.user.email}
      organizationName={selected?.organization.name ?? "Workspace"}
      exitLabel={preview ? "Exit preview" : "Sign out"}
      organization={
        choices.length > 1 ? (
          <form action={selectOrganization} className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
            <label htmlFor="organizationId" className="text-xs font-medium text-sidebar-foreground/80">
              Organization
            </label>
            <select
              id="organizationId"
              name="organizationId"
              className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground"
              defaultValue={selected?.organizationId ?? choices[0]?.organizationId}
              required
            >
              {choices.map((membership) => (
                <option key={membership.organizationId} value={membership.organizationId}>
                  {membership.organization.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" className="w-full">
              Use organization
            </Button>
          </form>
        ) : selected ? (
          <p className="rounded-md border border-sidebar-border px-2 py-2 text-sm">
            <span className="block font-medium">{selected.organization.name}</span>
            <span className="text-xs text-sidebar-foreground/70">
              {organizationTypeLabel(selected.organization.type)} · {roleLabel(selected.role)}
            </span>
          </p>
        ) : (
          <p className="px-1 text-xs text-sidebar-foreground/70">No organization selected</p>
        )
      }
    >
      {notice ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm" role="alert">
          {notice}
        </p>
      ) : null}
      {children}
    </AppFrame>
  );
}

function navigationFor(type: string | undefined): ShellGroup[] {
  if (type === "RETAILER") {
    return [
      {
        label: "Procurement",
        links: [
          { href: "/app/discover", label: "Find medicines", icon: "discover", match: "discover" },
          { href: "/app/discover/listings", label: "Listings", icon: "listings", match: "comparison" },
          { href: "/app/enquiries", label: "Enquiries", icon: "enquiries", match: "prefix" },
        ],
      },
    ];
  }
  if (type === "DISTRIBUTOR") {
    return [
      {
        label: "Distributor",
        links: [
          { href: "/app/discover", label: "Find medicines", icon: "discover", match: "discover" },
          { href: "/app/listings", label: "My listings", icon: "listings", match: "prefix" },
          { href: "/app/catalog/submissions", label: "Medicine submissions", icon: "overview", match: "prefix" },
          { href: "/app/imports", label: "Imports", icon: "imports", match: "prefix" },
          { href: "/app/enquiries", label: "Incoming enquiries", icon: "enquiries", match: "prefix" },
        ],
      },
    ];
  }
  return [
    {
      label: "Workspace",
      links: [
        { href: "/app", label: "Overview", icon: "overview", match: "exact" },
        { href: "/app/admin/submissions", label: "Review submissions", icon: "discover", match: "prefix" },
        { href: "/app/admin/audit", label: "Audit events", icon: "overview", match: "prefix" },
      ],
    },
  ];
}
