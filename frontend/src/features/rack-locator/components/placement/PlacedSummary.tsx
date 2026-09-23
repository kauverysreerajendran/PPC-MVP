"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PlacedSlot } from "../../types";

/** Success state after Confirm — a green summary and the way back.
 *
 * Counts quantity, not trays: a tray holds up to its capacity in qty, so
 * "60 qty in 3 trays" is what actually happened. */
export function PlacedSummary({ slots }: { slots: PlacedSlot[] }) {
  const router = useRouter();
  const qty = slots.reduce((sum, s) => sum + (Number(s.qty ?? 0) || 0), 0);
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] bg-[var(--color-success-bg)] px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface text-[var(--color-success)] shadow-[var(--shadow-sm)]">
        <CheckCircle2 className="size-5" />
      </span>
      <h2 className="text-sm font-semibold text-text">
        {qty.toLocaleString()} qty placed in {slots.length} tray
        {slots.length === 1 ? "" : "s"}
      </h2>
      <p className="max-w-md text-sm text-text-secondary">
        {slots
          .map(
            (s) =>
              `${s.rack_code} · S${s.shelf_no} · R${s.row_no} · T${String(s.tray_no).padStart(2, "0")}`,
          )
          .join(", ")}
      </p>
      <Button size="sm" onClick={() => router.push("/sap-inward")}>
        Back to SAP Inward
      </Button>
    </div>
  );
}
