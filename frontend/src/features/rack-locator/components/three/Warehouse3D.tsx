"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Crosshair, Hand, Maximize, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import stageBg from "@/assets/images/7.png";
import { RACK_TONE } from "@/components/rack";
import { cn } from "@/lib/cn";
import type { RackSummary, WarehouseSummary } from "../../types";
import { groupBySide } from "../AisleMap";
import { BAY_TRAY, pct, type OccupancyTone } from "../trayStyles";
import { resolveColor, useThemeVersion } from "./sceneKit";
import { WarehouseScene, type WhAisle, type WhPalette } from "./WarehouseScene";

/**
 * The overview as a 3D warehouse floor: each aisle a hatched walkway with its
 * racks standing on either side, Left bank behind, Right bank in front.
 *
 * Same contract as the tile map it replaces — the same `onOpen`, the same
 * legend filter dimming racks that aren't in that state, the same active rack
 * highlight. Every rack also has a real DOM button riding above it, so the
 * map stays keyboard- and screen-reader-operable.
 *
 * It stands on the lit warehouse backdrop with the view tabs top-left and a
 * tool rail (zoom, reset, full screen) down the right edge.
 */

/** Translucent card surface shared by the overlays floating over the scene. */
const GLASS =
  "border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_86%,transparent)] shadow-[var(--shadow-md)] backdrop-blur-md";
const ZOOM_STEP = 0.85;
export function Warehouse3D({
  warehouse,
  activeRackCode,
  filter,
  onOpen,
  onNoWebGL,
  toolbar,
}: {
  warehouse: WarehouseSummary;
  activeRackCode?: string | undefined;
  filter: OccupancyTone | null;
  onOpen: (rack: RackSummary) => void;
  onNoWebGL: () => void;
  toolbar?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WarehouseScene | null>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const themeVersion = useThemeVersion();

  const racks = useMemo(() => {
    const map = new Map<string, RackSummary>();
    for (const a of warehouse.aisles) for (const r of a.racks) map.set(r.id, r);
    return map;
  }, [warehouse]);

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onNoWebGLRef = useRef(onNoWebGL);
  onNoWebGLRef.current = onNoWebGL;
  const racksRef = useRef(racks);
  racksRef.current = racks;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let scene: WarehouseScene;
    try {
      scene = new WarehouseScene(canvas, {
        onOpen: (key) => {
          const rack = racksRef.current.get(key);
          if (rack) onOpenRef.current(rack);
        },
        onHover: setHover,
      });
    } catch {
      onNoWebGLRef.current();
      return;
    }
    sceneRef.current = scene;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) scene.resize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Rebuild only when the drawn structure or a rack's state changes (topology polls).
  const signature = useMemo(
    () =>
      warehouse.aisles
        .map(
          (a) =>
            `${a.aisle_code}:` +
            groupBySide(a.racks)
              .map((g) =>
                g.racks
                  .map(
                    (r) =>
                      `${r.id}/${r.shelf_count}/` +
                      r.shelves
                        .map((sh) => `${sh.occupancy.occupied}.${sh.occupancy.reserved}.${sh.occupancy.blocked}`)
                        .join("-"),
                  )
                  .join(","),
              )
              .join("|"),
        )
        .join(";"),
    [warehouse],
  );

  useEffect(() => {
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    const c = (css: string, fb: string) => resolveColor(host, css, fb);
    const palette: WhPalette = {
      steel: c("var(--rack-steel-front)", "#3a4452"),
      beam: c("var(--rack-beam)", "#6b7686"),
      lid: c("var(--rack-lid)", "#d5dae1"),
      // warm floor light around each rack's footprint
      glow: c("color-mix(in srgb, var(--color-warning) 35%, white)", "#ffe3a3"),
      // the trays wear the legend's colours
      slots: {
        empty: c(BAY_TRAY.empty.color, "#2f6fdb"),
        occupied: c(BAY_TRAY.occupied.color, "#64748b"),
        reserved: c(BAY_TRAY.reserved.color, "#d4920c"),
        blocked: c(BAY_TRAY.blocked.color, "#d64545"),
      },
      floor: c("color-mix(in srgb, var(--color-primary) 14%, var(--color-surface))", "#e6f4f2"),
      walkway: c("var(--color-text-muted)", "#94a3b8"),
      primary: c("var(--color-primary)", "#0d9488"),
    };
    const aisles: WhAisle[] = warehouse.aisles.map((a) => ({
      label: `Aisle ${a.aisle_code}`,
      banks: groupBySide(a.racks).map((g) =>
        g.racks.map((r) => {
          return {
            key: r.id,
            levels: r.shelf_count,
            shelves: [...r.shelves]
              .sort((a, b) => a.shelf_no - b.shelf_no)
              .map((sh) => ({
                capacity: sh.occupancy.capacity,
                occupied: sh.occupancy.occupied,
                reserved: sh.occupancy.reserved,
                blocked: sh.occupancy.blocked,
              })),
            dimmed: !!filter && r.state !== filter,
            active: r.rack_code === activeRackCode,
          };
        }),
      ),
    }));
    scene.setWarehouse(aisles, palette);
    scene.setLabels(labelRefs.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `warehouse`
  }, [signature, themeVersion]);

  useEffect(() => {
    const states = new Map<string, { dimmed: boolean; active: boolean }>();
    for (const r of racks.values()) {
      states.set(r.id, { dimmed: !!filter && r.state !== filter, active: r.rack_code === activeRackCode });
    }
    sceneRef.current?.setRackStates(states);
  }, [racks, filter, activeRackCode, signature]);

  useEffect(() => sceneRef.current?.setZoom(zoom), [zoom]);

  function toggleFullscreen() {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen?.();
  }

  const tools: { icon: LucideIcon; label: string; onClick: () => void }[] = [
    {
      icon: Crosshair,
      label: "Re-centre the view",
      onClick: () => {
        setZoom(1);
        sceneRef.current?.resetView();
      },
    },
    { icon: ZoomIn, label: "Zoom in", onClick: () => setZoom((z) => Math.max(0.5, z * ZOOM_STEP)) },
    { icon: ZoomOut, label: "Zoom out", onClick: () => setZoom((z) => Math.min(1.8, z / ZOOM_STEP)) },
    { icon: Maximize, label: "Full screen", onClick: toggleFullscreen },
  ];

  const ordered = useMemo(
    () => warehouse.aisles.flatMap((a) => groupBySide(a.racks).flatMap((g) => g.racks)),
    [warehouse],
  );

  return (
    <section
      aria-label={`${warehouse.warehouse_name ?? warehouse.warehouse_code} floor`}
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-sm)]"
    >
      <div
        ref={hostRef}
        className="relative h-[clamp(440px,60vh,600px)] overflow-hidden bg-surface-2"
      >
        <Image
          src={stageBg}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1280px) 65vw, 100vw"
          className="pointer-events-none select-none object-cover object-[50%_72%]"
        />
        <div className="pointer-events-none absolute inset-0 hidden bg-[color-mix(in_srgb,var(--color-bg,#0b1416)_72%,transparent)] dark:block" />
        <canvas ref={canvasRef} className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {ordered.map((rack) => {
            const tone = RACK_TONE[rack.state];
            // "A1" in aisle "A" reads "A-1"; any other code keeps its aisle prefix
            const code = rack.rack_code.startsWith(rack.aisle_code)
              ? `${rack.aisle_code}-${rack.rack_code.slice(rack.aisle_code.length).replace(/^-/, "")}`
              : `${rack.aisle_code}-${rack.rack_code}`;
            const o = rack.occupancy;
            const on = rack.rack_code === activeRackCode;
            const lit = hover === rack.id;
            return (
              <button
                key={rack.id}
                ref={(el) => {
                  if (el) labelRefs.current.set(rack.id, el);
                  else labelRefs.current.delete(rack.id);
                }}
                type="button"
                onClick={() => onOpen(rack)}
                onPointerEnter={() => sceneRef.current?.setHover(rack.id)}
                onPointerLeave={() => sceneRef.current?.setHover(null)}
                onFocus={() => sceneRef.current?.setHover(rack.id)}
                onBlur={() => sceneRef.current?.setHover(null)}
                aria-current={on ? "true" : undefined}
                aria-label={`${code} — ${tone.label}, ${pct(o.occupancy_pct)} occupied (${o.occupied}/${o.capacity}), ${rack.shelf_count} shelves × ${rack.row_count} rows × ${rack.tray_count} trays`}
                title={`${code} · ${tone.label} · ${o.occupied}/${o.capacity} trays`}
                className={cn(
                  "ds-focus-ring pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface py-1 pl-3.5 pr-1 text-sm font-semibold text-text opacity-0 shadow-[var(--shadow-md)] ring-1 transition-[box-shadow] will-change-transform",
                  on || lit ? "ring-2 ring-primary" : "ring-border",
                )}
              >
                {code}
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums"
                  // filled racks read green, empty ones blue
                  style={
                    o.occupied > 0
                      ? { color: "var(--color-success)", backgroundColor: "var(--color-success-bg)" }
                      : { color: "var(--color-empty)", backgroundColor: "var(--color-empty-bg)" }
                  }
                >
                  {pct(o.occupancy_pct)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">{toolbar}</div>

        {/* tool rail */}
        <div className={cn("absolute left-3 top-3 z-10 flex flex-col rounded-[12px] p-1", GLASS)}>
          {tools.map(({ icon: Icon, label, onClick }, i) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              title={label}
              aria-label={label}
              className={cn(
                "ds-focus-ring grid size-8 place-items-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text",
                i > 0 && "mt-0.5",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        <div
          className={cn(
            "pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] text-text-secondary sm:inline-flex",
            GLASS,
          )}
        >
          <Hand className="size-3.5 text-text-muted" aria-hidden />
          Drag to rotate
          <span className="text-text-muted" aria-hidden>•</span>
          + / − to zoom
          <span className="text-text-muted" aria-hidden>•</span>
          Click a rack to open it
        </div>
      </div>
    </section>
  );
}
