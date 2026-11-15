"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LayoutDashboard, Menu, Package, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const icons = {
  overview: LayoutDashboard,
  discover: Search,
  listings: Package,
  enquiries: Inbox,
  imports: Upload,
} as const;

export type ShellIcon = keyof typeof icons;

export type ShellLink = {
  href: string;
  label: string;
  icon: ShellIcon;
  match: "exact" | "discover" | "comparison" | "prefix";
};

export type ShellGroup = {
  label: string;
  links: ShellLink[];
};

export function AppFrame({
  groups,
  organization,
  displayName,
  email,
  organizationName,
  preview,
  demo = false,
  exitLabel,
  children,
}: {
  groups: ShellGroup[];
  organization: ReactNode;
  displayName: string;
  email: string;
  organizationName: string;
  preview: boolean;
  demo?: boolean;
  exitLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      {preview ? (
        <p className="bg-warning/20 px-3 py-1.5 text-center text-xs font-semibold tracking-wide text-foreground" role="status">
          LOCAL PREVIEW · MOCK DATA · NOT AUTHENTICATED
        </p>
      ) : null}
      {!preview && demo ? (
        <p className="bg-warning/20 px-3 py-1.5 text-center text-xs font-semibold tracking-wide text-foreground" role="status">
          DEMO ENVIRONMENT — SAMPLE DATA ONLY
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <aside
          className={`fixed bottom-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:static lg:top-auto lg:translate-x-0 ${
            preview || demo ? "top-8" : "top-0"
          } ${open ? "translate-x-0" : "-translate-x-full"}`}
          aria-label="Application"
        >
          <div className="flex items-center justify-between px-4 py-4">
            <Link href="/app" className="text-base font-semibold tracking-tight">
              MedStock
            </Link>
            <button type="button" className="rounded-md p-1 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="px-3 pb-4">{organization}</div>
          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
            {groups.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-2 text-[0.7rem] font-medium tracking-wide text-sidebar-foreground/60">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.links.map((link) => {
                    const Icon = icons[link.icon];
                    const active = isActive(pathname, link);
                    return (
                      <li key={link.href + link.label}>
                        <Link
                          href={link.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70"
                          }`}
                        >
                          <Icon className="size-4 shrink-0" />
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{email}</p>
            <form action="/api/auth/sign-out" method="post" className="mt-3">
              <Button type="submit" variant="secondary" className="w-full">
                {exitLabel}
              </Button>
            </form>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
            <button
              type="button"
              className="rounded-md border p-2"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">MedStock</p>
              <p className="truncate text-xs text-muted-foreground">{organizationName}</p>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function isActive(pathname: string, link: ShellLink): boolean {
  if (link.match === "exact") {
    return pathname === link.href;
  }
  if (link.match === "comparison") {
    return pathname.startsWith("/app/discover/listings");
  }
  if (link.match === "discover") {
    return pathname === "/app/discover" || pathname.startsWith("/app/discover/medicines");
  }
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
