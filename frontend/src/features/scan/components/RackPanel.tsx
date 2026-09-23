"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, PackageOpen } from "lucide-react";
import { RackIllustration } from "@/components/rack";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { fmtNum } from "@/features/sap-inward/utils/format";
import { cn } from "@/lib/cn";
import { usePlacedTrays, useRacksOf } from "../hooks";
import type { ScannedSlot } from "../resolve";
import { Copyable, Panel, PanelNotice } from "./parts";

/** One tray on the panel, from a placement or from a scanned location. */
interface TrayChip {
  code: string;
  warehouse_code?: string | undefined;
  aisle_code?: string | undefined;
  rack_code: string;
  shelf_no: number;
  row_no: number;
  tray_no: number;
  qty: number | string | null;
  pieces?: number | null | undefined;
  /** the tray that was scanned */
  scanned?: boolean;
}

const SLOT_STATE: Record<string, { label: string; tone: StatusTone }> = {
  empty: { label: "Empty", tone: "neutral" },
  occupied: { label: "Occupied", tone: "success" },
  reserved: { label: "Reserved", tone: "info" },
  blocked: { label: "Blocked", tone: "danger" },
};

function address(t: TrayChip): string {
  return [
    t.warehouse_code,
    t.aisle_code ? `Aisle ${t.aisle_code}` : null,
    `Rack ${t.rack_code}`,
    `Shelf ${t.shelf_no}`,
    `Row ${t.row_no}`,
    `Tray ${t.tray_no}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const rackLocatorHref = (code: string) => `/rack-locator?q=${encodeURIComponent(code)}`;

/**
 * Where the line's pieces physically are: the trays holding its received
 * stock (`GET /rack/place/{ref}`), or the tray a location scan named — each
 * as a copyable location code with its full address and quantity — plus a
 * small drawing of the rack for orientation.
 */
export function RackPanel({
  refId,
  slot,
  emptyHint,
}: {
  /** the line's SAP reference — null for a location scan of a tray with no line */
  refId: string | null;
  slot: ScannedSlot | null;
  /** what to say when nothing is in a rack yet */
  emptyHint: string;
}) {
  const placed = usePlacedTrays(refId);
  const fromPlacement: TrayChip[] = (placed.data?.slots ?? []).map((s) => ({
    ...s,
    scanned: s.code === slot?.code,
  }));
  const trays: TrayChip[] =
    slot && !fromPlacement.some((t) => t.scanned)
      ? [{ ...slot, scanned: true }, ...fromPlacement]
      : fromPlacement;
  const racks = useRacksOf(trays);
  const linkCode = slot?.code ?? trays[0]?.code ?? null;
  const placedQty = placed.data?.placed_qty;

  return (
    <Panel
      icon={<MapPin />}
      title="Rack location"
      actions={
        linkCode ? (
          <Link
            href={rackLocatorHref(linkCode)}
            className="ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs font-medium text-primary hover:underline"
          >
            View in Rack Locator
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null
      }
    >
      {placed.isError ? (
        <div className="mb-3">
          <PanelNotice title="Rack service unavailable" onRetry={() => void placed.refetch()}>
            Where this line is stored can&apos;t be shown right now. Everything else on the page is
            current.
          </PanelNotice>
        </div>
      ) : null}

      {placed.isLoading && refId ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : trays.length === 0 ? (
        placed.isError ? null : (
          <div className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-3 text-xs">
            <PackageOpen className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
            <div>
              <p className="font-medium text-text">Not in a rack yet</p>
              <p className="mt-0.5 text-text-secondary">{emptyHint}</p>
            </div>
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            {refId && placed.data ? (
              <p className="mb-2 text-xs text-text-secondary">
                <span className="font-semibold tabular-nums text-text">{placed.data.trays ?? fromPlacement.length}</span>{" "}
                {(placed.data.trays ?? fromPlacement.length) === 1 ? "tray" : "trays"}
                {placedQty != null ? (
                  <>
                    {" · "}
                    <span className="font-semibold tabular-nums text-text">{fmtNum(placedQty)}</span> placed
                  </>
                ) : null}
              </p>
            ) : null}
            <ul className="max-h-[344px] space-y-1.5 overflow-y-auto pr-0.5">
              {trays.map((t) => (
                <li
                  key={t.code}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-sm)] border px-2.5 py-2",
                    t.scanned
                      ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))]"
                      : "border-border bg-surface",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Copyable
                        value={t.code}
                        label="Location"
                        className="ds-chip ds-chip-2 font-mono text-[12px] font-semibold"
                      />
                      {t.scanned ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Scanned
                        </span>
                      ) : null}
                      {t.scanned && slot ? (
                        <StatusBadge
                          {...(SLOT_STATE[slot.slot_state] ?? { label: slot.slot_state, tone: "neutral" as const })}
                          className="text-[10px]"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-text-muted" title={address(t)}>
                      {address(t)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-text">{fmtNum(t.qty)}</p>
                    <p className="text-[10px] text-text-muted">
                      {t.pieces ? `${t.pieces} pc${t.pieces === 1 ? "" : "s"}` : "qty"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {slot && !slot.sap_reference_id && slot.occupied_by_model ? (
              <p className="mt-2 text-[11px] text-text-secondary">
                Holds model <span className="font-mono font-medium text-text">{slot.occupied_by_model}</span>
                {slot.lot_no ? <> · lot {slot.lot_no}</> : null} — not tied to a received SAP line.
              </p>
            ) : null}
          </div>

          <div className="flex gap-3 sm:flex-col">
            {racks.map((r, i) =>
              r.data ? (
                <figure key={r.data.id} className="flex w-[104px] flex-col items-center gap-1">
                  <RackIllustration
                    levels={r.data.shelf_count}
                    binsPerLevel={r.data.row_count}
                    status={r.data.state}
                    size={96}
                    label={`Rack ${r.data.rack_code}, ${Math.round(r.data.occupancy.occupancy_pct)}% filled`}
                  />
                  <figcaption className="text-center text-[10px] leading-tight text-text-muted">
                    <span className="font-semibold text-text-secondary">Rack {r.data.rack_code}</span>
                    <br />
                    {r.data.shelf_count} shelves · {Math.round(r.data.occupancy.occupancy_pct)}% full
                  </figcaption>
                </figure>
              ) : r.isLoading ? (
                <Skeleton key={i} className="h-[120px] w-[104px]" />
              ) : null,
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
