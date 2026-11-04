import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className={cn("w-full min-w-[40rem] border-collapse text-left text-sm", className)}>{children}</table>
    </div>
  );
}

export const thClass = "border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground";
export const tdClass = "border-b px-3 py-2.5 align-top";
