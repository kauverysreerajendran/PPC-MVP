"use client";

import { ChevronsDown, ChevronsUp } from "lucide-react";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { SyncFromSapButton } from "./SyncFromSapButton";

/** Header band for the SAP Outward grid — hosts the SAP pull and the
 *  "Show more columns" toggle. */
export function SapPageBanner({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <WaveBanner
      breadcrumb={[
        { label: "SAP Outward", href: "/sap-outward" },
        { label: "Outward Records" },
      ]}
      title="SAP Outward"
      actions={
        <>
          <SyncFromSapButton />
          <button
            type="button"
            onClick={onToggle}
            className="ds-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            {expanded ? <ChevronsUp className="size-3.5" /> : <ChevronsDown className="size-3.5" />}
            {expanded ? "Show fewer columns" : "Show more columns"}
          </button>
        </>
      }
    />
  );
}
