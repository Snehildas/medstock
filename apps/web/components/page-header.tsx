import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-sm">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "alert" }) {
  return (
    <p
      className={
        tone === "alert"
          ? "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md border bg-card px-3 py-2 text-sm"
      }
      role={tone === "alert" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function Pager({
  label,
  page,
  lastPage,
  totalLabel,
  previousHref,
  nextHref,
}: {
  label: string;
  page: number;
  lastPage: number;
  totalLabel: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        Page {page} of {lastPage}
        {totalLabel ? ` · ${totalLabel}` : ""}
      </p>
      <div className="flex gap-3">
        {previousHref ? (
          <Link href={previousHref} className="font-medium text-primary">
            Previous
          </Link>
        ) : null}
        {nextHref ? (
          <Link href={nextHref} className="font-medium text-primary">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

export function FactGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
