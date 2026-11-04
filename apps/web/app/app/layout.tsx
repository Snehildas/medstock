import { Suspense, type ReactNode } from "react";
import { loadAccountState } from "@/lib/account";
import { localPreviewAllowed } from "@/lib/preview-mode";
import { AppShell } from "@/components/app-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-sm text-muted-foreground">Loading your account…</p>}>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </Suspense>
  );
}

async function WorkspaceFrame({ children }: { children: ReactNode }) {
  const account = await loadAccountState();
  return (
    <AppShell account={account} notice={null} preview={localPreviewAllowed(process.env)}>
      {children}
    </AppShell>
  );
}
