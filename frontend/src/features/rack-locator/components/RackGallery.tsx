"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RACK_TONE, RackIllustration } from "@/components/rack";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { RackSummary, WarehouseSummary } from "../types";
import { groupBySide } from "./AisleMap";
import { BAY_TRAY, num, pct, type OccupancyTone } from "./trayStyles";
import { resolveColor, useThemeVersion } from "./three/sceneKit";
import { useRackThumbnails, type ThumbPalette, type ThumbRack } from "./three/rackThumbs";

/**
 * The overview as a gallery: every rack in its own framed card, a 3D picture
 * of it (trays in the legend colours, split by each shelf's real counts) on a
 * very light teal wash, its name and fill on top and its size underneath.
 * A grid of cards keeps working at any number of racks, where a single 3D
 * floor gets crowded.
 *
 * Same contract as the floor and the tile map: the same `onOpen`, the same
 * occupancy filter dimming racks in other states, the same active highlight.
 * Without WebGL the cards fall back to the flat rack drawing.
 */
export function RackGallery({
  warehouse,
  activeRackCode,
  filter,
  onOpen,
}: {
  warehouse: WarehouseSummary;
  activeRackCode?: string | undefined;
  filter: OccupancyTone | null;
  onOpen: (rack: RackSummary) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const themeVersion = useThemeVersion();
  const [palette, setPalette] = useState<ThumbPalette | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const c = (css: string, fb: string) => resolveColor(host, css, fb);
    setPalette({
      steel: c("var(--rack-steel-front)", "#3a4452"),
      beam: c("var(--rack-beam)", "#6b7686"),
      lid: c("var(--rack-lid)", "#d5dae1"),
      glow: c("color-mix(in srgb, var(--color-warning) 35%, white)", "#ffe3a3"),
      slots: {
        empty: c(BAY_TRAY.empty.color, "#2f6fdb"),
        occupied: c(BAY_TRAY.occupied.color, "#64748b"),
        reserved: c(BAY_TRAY.reserved.color, "#d4920c"),
        blocked: c(BAY_TRAY.blocked.color, "#d64545"),
      },
    });
  }, [themeVersion]);

  const aisles = useMemo(
    () =>
      warehouse.aisles.map((a) => ({
        code: a.aisle_code,
        name: a.aisle_name ?? `Aisle ${a.aisle_code}`,
        racks: groupBySide(a.racks).flatMap((g) => g.racks),
      })),
    [warehouse],
  );

  const thumbRacks = useMemo<ThumbRack[]>(
    () =>
      aisles.flatMap((a) =>
        a.racks.map((r) => ({
          key: r.id,
          levels: r.shelf_count,
          shelves: [...r.shelves]
            .sort((x, y) => x.shelf_no - y.shelf_no)
            .map((sh) => ({
              capacity: sh.occupancy.capacity,
              occupied: sh.occupancy.occupied,
              reserved: sh.occupancy.reserved,
              blocked: sh.occupancy.blocked,
            })),
        })),
      ),
    [aisles],
  );
  const { urls, failed } = useRackThumbnails(thumbRacks, palette);

  return (
    <div ref={hostRef} className="space-y-5">
      {aisles.map((aisle) => (
        <section key={aisle.code} aria-label={aisle.name}>
          {aisles.length > 1 ? (
            <h3 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold text-text">
              {aisle.name}
              <span className="text-xs font-normal text-text-muted">{aisle.racks.length} racks</span>
            </h3>
          ) : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {aisle.racks.map((rack) => {
              const o = rack.occupancy;
              const tone = RACK_TONE[rack.state];
              const filled = o.occupied > 0;
              const on = rack.rack_code === activeRackCode;
              const dimmed = !!filter && rack.state !== filter;
              const url = urls.get(rack.id);
              return (
                <li key={rack.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(rack)}
                    aria-current={on ? "true" : undefined}
                    aria-label={`${rackLabel(rack)} — ${tone.label}, ${pct(o.occupancy_pct)} occupied (${o.occupied}/${o.capacity}), ${rack.shelf_count} shelves × ${rack.row_count} rows × ${rack.tray_count} trays`}
                    className={cn(
                      "ds-focus-ring group block w-full overflow-hidden rounded-[var(--radius-lg)] border bg-surface text-left shadow-[var(--shadow-sm)] transition-[box-shadow,border-color,opacity,transform] duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-md)]",
                      on ? "border-primary ring-2 ring-primary" : "border-border",
                      dimmed && "opacity-40 hover:opacity-100",
                    )}
                  >
                    {/* the frame: the rack on a very light teal wash */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(80%_70%_at_50%_70%,color-mix(in_srgb,var(--color-primary)_4%,var(--color-surface)),color-mix(in_srgb,var(--color-primary)_11%,var(--color-surface)))]">
                      {url ? (
                        <Image
                          src={url}
                          alt=""
                          fill
                          unoptimized
                          sizes="280px"
                          className="pointer-events-none select-none object-contain pt-7 transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      ) : failed ? (
                        <div className="absolute inset-0 grid place-items-center pt-6">
                          <RackIllustration
                            levels={rack.shelf_count}
                            fillPercent={o.occupancy_pct}
                            status={rack.state}
                            className="h-3/4 w-auto"
                          />
                        </div>
                      ) : (
                        <Skeleton className="absolute inset-x-10 bottom-6 top-12 rounded-[var(--radius-md)] opacity-60" />
                      )}
                      <span className="absolute left-1/2 top-2.5 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-surface py-0.5 pl-3 pr-0.5 text-sm font-semibold text-text shadow-[var(--shadow-md)] ring-1 ring-border">
                        {rackLabel(rack)}
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                          style={
                            filled
                              ? { color: "var(--color-success)", backgroundColor: "var(--color-success-bg)" }
                              : { color: "var(--color-empty)", backgroundColor: "var(--color-empty-bg)" }
                          }
                        >
                          {pct(o.occupancy_pct)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px]">
                      <span
                        className="truncate text-text-secondary"
                        title={`${rack.shelf_count} shelves × ${rack.row_count} columns × ${rack.tray_count} trays`}
                      >
                        {rack.shelf_count} shelves · {rack.row_count} cols
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-text">
                        {num(o.empty)}/{num(o.capacity)} free
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "A1" in aisle "A" reads "A-1"; any other code keeps its aisle prefix. */
export function rackLabel(rack: Pick<RackSummary, "aisle_code" | "rack_code">): string {
  return rack.rack_code.startsWith(rack.aisle_code)
    ? `${rack.aisle_code}-${rack.rack_code.slice(rack.aisle_code.length).replace(/^-/, "")}`
    : `${rack.aisle_code}-${rack.rack_code}`;
}
