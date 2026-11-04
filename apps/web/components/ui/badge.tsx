import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/15 text-foreground",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  info: "border-primary/20 bg-primary/10 text-primary",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
