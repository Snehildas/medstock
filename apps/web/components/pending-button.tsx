"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function PendingButton({
  children,
  pendingLabel,
  disabled = false,
  variant = "default",
}: {
  children: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
