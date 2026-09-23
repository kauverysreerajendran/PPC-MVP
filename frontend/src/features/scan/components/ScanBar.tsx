"use client";

import type { KeyboardEvent, RefObject } from "react";
import {
  CornerDownLeft,
  FileText,
  Hash,
  Layers,
  MapPin,
  Package,
  ScanLine,
  Search,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { SCAN_KIND_LABEL, type Detection, type ScanKind } from "../detect";

export const KIND_ICON: Record<ScanKind, LucideIcon> = {
  box_uid: Package,
  po: FileText,
  dc: Truck,
  location: MapPin,
  sap_ref: Hash,
  lot: Layers,
  model: Tag,
  search: Search,
};

export const SCAN_INPUT_ID = "scan-input";
const HINT_ID = "scan-input-hint";

/** A type chip: what a value was read as. */
export function KindChip({ kind, muted }: { kind: ScanKind; muted?: boolean }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("ds-chip", muted ? "ds-chip-muted" : "ds-chip-2")}>
      <Icon className="size-3" aria-hidden />
      {SCAN_KIND_LABEL[kind]}
    </span>
  );
}

/**
 * The scanner-first input, sitting beside the page title. It selects all on
 * focus so the next scan overwrites, submits on Enter, and names the type it
 * reads the value as — live while typing, and for the scan on screen, with the
 * other readings offered as chips when the shape was a guess.
 */
export function ScanBar({
  inputRef,
  value,
  onChange,
  onSubmit,
  typing,
  active,
  onReadAs,
  pending,
  onArrowDown,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** how the text in the field reads right now */
  typing: Detection | null;
  /** how the scan on screen was read, and the kind it was looked up as */
  active: { detection: Detection; kind: ScanKind } | null;
  onReadAs: (kind: ScanKind) => void;
  pending: boolean;
  /** ↓ from the field moves into the result list */
  onArrowDown?: (() => void) | undefined;
}) {
  const showing = active && typing?.value === active.detection.value ? active : null;
  const choices = showing
    ? [showing.detection.kind, ...showing.detection.alternatives].filter((k) => k !== showing.kind)
    : [];

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && onArrowDown) {
      e.preventDefault();
      onArrowDown();
    }
  }

  return (
    <div className="w-full sm:w-[440px]">
      <form
        role="search"
        aria-label="Scan lookup"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="group flex items-center gap-2 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-primary)_26%,var(--color-border))] bg-surface p-1.5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_16%,transparent),var(--shadow-sm)]"
      >
        <span
          aria-hidden
          className="hidden size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br from-primary to-[var(--color-teal-700)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] sm:flex"
        >
          <ScanLine className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1 pl-1.5">
          {/* Short enough never to wrap in the header; the full sentence is
              the input's accessible name, and the empty state lists the types. */}
          <label
            htmlFor={SCAN_INPUT_ID}
            className="block truncate text-[10px] font-semibold uppercase leading-none tracking-[0.09em] text-primary"
          >
            Scan or type a code
          </label>
          <input
            id={SCAN_INPUT_ID}
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={onKeyDown}
            aria-label="Scan or type a Box UID, PO, DC or location"
            aria-describedby={HINT_ID}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="BUID-0016"
            className="mt-0.5 h-6 w-full min-w-0 bg-transparent font-mono text-base font-medium tracking-wide text-text outline-none placeholder:font-normal placeholder:text-text-muted sm:text-lg"
          />
        </div>
        <div className="hidden shrink-0 md:block" aria-hidden={!typing?.value}>
          {typing?.value ? <KindChip kind={showing?.kind ?? typing.kind} muted={!showing} /> : null}
        </div>
        <Button type="submit" loading={pending} className="h-10 shrink-0 gap-1.5 px-3">
          <Search className="size-4" aria-hidden />
          <span className="hidden sm:inline">Look up</span>
          <kbd className="ml-0.5 hidden items-center rounded-[var(--radius-xs)] border border-current/30 px-1 py-px opacity-80 sm:inline-flex">
            <CornerDownLeft className="size-3" aria-hidden />
          </kbd>
        </Button>
      </form>
      <div id={HINT_ID} className="mt-1.5 flex min-h-6 flex-wrap items-center gap-1.5 px-1 text-[11px] text-text-secondary">
        {showing ? (
          <>
            <span>Read as</span>
            <KindChip kind={showing.kind} />
            {choices.length ? (
              <>
                <span className="ml-1">Not right? Look up as</span>
                {choices.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onReadAs(k)}
                    className="ds-focus-ring ds-chip ds-chip-muted ds-chip-outline cursor-pointer transition-colors hover:text-primary"
                  >
                    {SCAN_KIND_LABEL[k]}
                  </button>
                ))}
              </>
            ) : null}
          </>
        ) : typing?.value ? (
          <>
            <span>Will look up as</span>
            <KindChip kind={typing.kind} muted />
            <span className="text-text-muted">— press Enter</span>
          </>
        ) : (
          <span className="text-text-muted">
            The type is detected from the code itself — just scan.
          </span>
        )}
      </div>
    </div>
  );
}
