"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PlacedSlot } from "../../types";

/** Success state after Confirm — a green summary and the way back. */
export function PlacedSummary({ slots }: { slots: PlacedSlot[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] bg-[var(--color-success-bg)] px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface text-[var(--color-success)] shadow-[var(--shadow-sm)]">
        <CheckCircle2 className="size-5" />
      </span>
      <h2 className="text-sm font-semibold text-text">
        {slots.length} piece{slots.length === 1 ? "" : "s"} placed
      </h2>
      <p className="max-w-md text-sm text-text-secondary">
        {slots
          .map((s) => `${s.rack_code} · S${s.shelf_no} · R${s.row_no} · T${String(s.tray_no).padStart(2, "0")}`)
          .join(", ")}
      </p>
      <Button size="sm" onClick={() => router.push("/sap-inward")}>
        Back to SAP Inward
      </Button>
    </div>
  );
}
