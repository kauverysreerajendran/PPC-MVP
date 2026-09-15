"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Step 3 of the placement flow: one primary action, sticky on mobile so it
 * stays reachable below a long tray-card list (docs/08 §1.2 — a submit
 * button is disabled from click until the response is handled).
 */
export function ConfirmBar({
  count,
  disabled,
  pending,
  onConfirm,
}: {
  count: number;
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-[var(--radius-lg)] sm:border sm:shadow-[var(--shadow-sm)]">
      <Button size="lg" fullWidth disabled={disabled} loading={pending} onClick={onConfirm}>
        <Check className="size-4" />
        Confirm placement of {count} piece{count === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
