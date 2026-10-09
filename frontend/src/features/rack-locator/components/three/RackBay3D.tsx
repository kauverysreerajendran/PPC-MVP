"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Hand,
  Maximize,
  Maximize2,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import stageBg from "@/assets/images/7.png";
import { RACK_TONE, toneForFillPercent, type MatrixShelf, type MatrixTray } from "@/components/rack";
import { cn } from "@/lib/cn";
import type { SlotState } from "../../types";
import { BAY_TRAY } from "../trayStyles";
import { resolveColor, useThemeVersion } from "./sceneKit";
import { RackBayScene, type BayHover, type BayPalette, type BayShelf } from "./RackBayScene";

/**
 * One rack in 3D — a drop-in for `RackMatrix` taking exactly the same shelves,
 * column labels and `onSelect`. Every decision (state, selected, suggested,
 * rank, disabled, tooltip, column action) arrives already made by
 * `RackDetailView`, so picking a tray here and in the grid can't disagree.
 *
 * The rack stands on the lit warehouse pedestal; a tool rail on the left
 * searches (dims the trays that don't match), zooms, resets the view and goes
 * full screen. Shelf chips down the right zoom to a shelf; hovering a tray
 * lifts it and opens a small card naming it. `slotFilter` (the legend chips
 * above) dims every tray in another state. Neither filter changes what can be
 * picked.
 */

/** Translucent card surface shared by the overlays floating over the scene. */
const GLASS =
  "border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_86%,transparent)] shadow-[var(--shadow-md)] backdrop-blur-md";

/** "A5-S1-R1-T02 · Empty · holds up to 25 qty" -> a title line and a note. */
function TrayCard({ tooltip }: { tooltip: string }) {
  const parts = tooltip.split(" · ");
  const note = parts.slice(2).join(" · ");
  return (
    <>
      <div className="max-w-72 rounded-[10px] border-2 border-primary bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-3 py-1.5 shadow-[var(--shadow-lg)] backdrop-blur">
        <div className="whitespace-nowrap text-xs font-semibold text-text">{parts.slice(0, 2).join(" · ")}</div>
        {note ? <div className="text-[11px] text-text-secondary first-letter:uppercase">{note}</div> : null}
      </div>
      <span className="h-6 w-px bg-primary" aria-hidden />
      <span
        className="size-2.5 rounded-full border-2 border-white bg-primary shadow-[0_0_8px_var(--color-primary)]"
        aria-hidden
      />
    </>
  );
}

const shelfPct = (s: MatrixShelf) => (s.capacity > 0 ? (s.occupied / s.capacity) * 100 : 0);
const ZOOM_STEP = 0.85;

export function RackBay3D({
  shelves,
  columnLabels,
  onSelect,
  ariaLabel,
  onNoWebGL,
  slotFilter = null,
}: {
  shelves: MatrixShelf[];
  columnLabels: string[];
  onSelect: (tray: MatrixTray) => void;
  ariaLabel: string;
  onNoWebGL: () => void;
  /** dim every tray not in this state */
  slotFilter?: SlotState | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RackBayScene | null>(null);
  const shelfRefs = useRef<(HTMLElement | null)[]>([]);
  const columnRefs = useRef<(HTMLElement | null)[]>([]);
  const actionRefs = useRef(new Map<string, HTMLElement>());
  const rankRefs = useRef(new Map<string, HTMLElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<BayHover | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const themeVersion = useThemeVersion();

  const trays = useMemo(() => {
    const map = new Map<string, MatrixTray>();
    for (const s of shelves) for (const c of s.columns) for (const t of c.trays) map.set(t.key, t);
    return map;
  }, [shelves]);
  const traysRef = useRef(trays);
  traysRef.current = trays;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onNoWebGLRef = useRef(onNoWebGL);
  onNoWebGLRef.current = onNoWebGL;

  /** keys of the trays the search / slot filter keep; `null` = no filter */
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !slotFilter) return null;
    const keys = new Set<string>();
    for (const t of trays.values()) {
      if (slotFilter && t.state !== slotFilter) continue;
      if (q && !`${t.key} ${t.tooltip}`.toLowerCase().includes(q)) continue;
      keys.add(t.key);
    }
    return keys;
  }, [trays, query, slotFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let scene: RackBayScene;
    try {
      scene = new RackBayScene(canvas, {
        onPick: (key) => {
          const tray = traysRef.current.get(key);
          if (tray && !tray.disabled) onSelectRef.current(tray);
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

  useEffect(() => {
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    const c = (css: string, fb: string) => resolveColor(host, css, fb);
    const palette: BayPalette = {
      empty: c(BAY_TRAY.empty.color, "#2f6fdb"),
      occupied: c(BAY_TRAY.occupied.color, "#64748b"),
      reserved: c(BAY_TRAY.reserved.color, "#d4920c"),
      blocked: c(BAY_TRAY.blocked.color, "#d64545"),
      primary: c("var(--color-primary)", "#0d9488"),
      suggested: c("color-mix(in srgb, var(--color-primary) 65%, white)", "#5fbfb4"),
      upright: c("var(--rack-steel-front)", "#3a4452"),
      plate: c("var(--color-surface)", "#ffffff"),
    };
    // every shelf edge glows in the brand teal; the chips carry the fill
    const edge = c("color-mix(in srgb, var(--color-primary) 70%, #22c55e)", "#14b88a");
    const model: BayShelf[] = shelves.map((s) => ({
      key: s.key,
      tone: edge,
      columns: s.columns.map((col) => ({
        key: col.key,
        trays: col.trays.map((t) => ({
          key: t.key,
          state: t.state,
          selected: t.selected ?? false,
          suggested: t.suggested ?? false,
          rank: t.rank,
          disabled: t.disabled ?? false,
        })),
      })),
    }));
    scene.setRack(model, palette);
    scene.setLabels({
      shelves: shelfRefs.current,
      columns: columnRefs.current,
      actions: actionRefs.current,
      ranks: rankRefs.current,
      selected: pinnedRef.current,
    });
  }, [shelves, themeVersion]);

  useEffect(() => sceneRef.current?.setFocus(focus), [focus]);
  useEffect(() => sceneRef.current?.setZoom(zoom), [zoom]);
  useEffect(() => sceneRef.current?.setFilter(matching), [matching, shelves]);
  useEffect(() => {
    if (focus !== null && focus >= shelves.length) setFocus(null);
  }, [focus, shelves.length]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function resetView() {
    setFocus(null);
    setZoom(1);
    setQuery("");
    setSearchOpen(false);
    sceneRef.current?.resetView();
  }

  function toggleFullscreen() {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen?.();
  }

  const hoverTray = hover ? trays.get(hover.key) : undefined;
  const selectedTray = [...trays.values()].find((t) => t.selected);
  const ranked = shelves.flatMap((s) =>
    s.columns.flatMap((c) => c.trays.filter((t) => t.rank && !t.selected)),
  );

  const tools: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }[] = [
    { icon: Search, label: "Search trays", onClick: () => setSearchOpen((v) => !v), active: searchOpen || !!query },
    { icon: ZoomIn, label: "Zoom in", onClick: () => setZoom((z) => Math.max(0.55, z * ZOOM_STEP)) },
    { icon: ZoomOut, label: "Zoom out", onClick: () => setZoom((z) => Math.min(1.6, z / ZOOM_STEP)) },
    { icon: RotateCcw, label: "Reset view", onClick: resetView },
    { icon: Maximize, label: "Full screen", onClick: toggleFullscreen },
  ];

  return (
    <div
      ref={hostRef}
      role="group"
      aria-label={ariaLabel}
      className="relative h-[clamp(440px,60vh,580px)] overflow-hidden rounded-[var(--radius-md)] bg-surface-2"
    >
      <Image
        src={stageBg}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 1280px) 60vw, 100vw"
        className="pointer-events-none select-none object-cover object-[50%_72%]"
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-[color-mix(in_srgb,var(--color-bg,#0b1416)_72%,transparent)] dark:block" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {shelves.map((s, i) => {
          const tone = RACK_TONE[toneForFillPercent(shelfPct(s))].color;
          const on = focus === i;
          return (
            <button
              key={s.key}
              ref={(el) => {
                shelfRefs.current[i] = el;
              }}
              type="button"
              onClick={() => setFocus((f) => (f === i ? null : i))}
              aria-pressed={on}
              aria-label={`${s.label}, ${s.occupied} of ${s.capacity} filled`}
              title={on ? "Show the whole rack" : `View ${s.label} trays · ${s.occupied} / ${s.capacity} filled`}
              style={{ ["--c" as string]: tone }}
              className="group ds-focus-ring pointer-events-auto absolute left-0 top-0 inline-flex items-center whitespace-nowrap rounded-full opacity-0 will-change-transform"
            >
              {/* leader: a dot on the upright, a hairline out to the chip */}
              <span
                className="size-2 shrink-0 rounded-full border-2 border-white bg-[var(--c)] shadow-[0_0_0_1px_var(--c)]"
                aria-hidden
              />
              <span className="h-px w-5 shrink-0 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)]" aria-hidden />
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-xs font-semibold shadow-[var(--shadow-md)] ring-1 transition-colors",
                  on
                    ? "bg-[var(--c)] text-white ring-[var(--c)]"
                    : "bg-surface text-text ring-border group-hover:ring-[var(--c)]",
                )}
              >
                <b
                  className={cn(
                    "min-w-10 rounded-full px-2 py-0.5 text-center text-[11px] tabular-nums",
                    on ? "bg-white text-[var(--c)]" : "bg-[var(--c)] text-white",
                  )}
                >
                  {Math.round(shelfPct(s))}%
                </b>
                {s.label}
              </span>
            </button>
          );
        })}

        {columnLabels.map((label, i) => (
          <span
            key={label}
            ref={(el) => {
              columnRefs.current[i] = el;
            }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary opacity-0 shadow-[var(--shadow-sm)] will-change-transform"
          >
            {label}
          </span>
        ))}

        {shelves.flatMap((s) =>
          s.columns.map((col) =>
            col.action ? (
              <button
                key={col.key}
                ref={(el) => {
                  if (el) actionRefs.current.set(col.key, el);
                  else actionRefs.current.delete(col.key);
                }}
                type="button"
                title={col.action.title}
                aria-pressed={col.action.active ?? false}
                disabled={col.action.disabled}
                onClick={col.action.onClick}
                className={cn(
                  "ds-focus-ring pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight opacity-0 shadow-[var(--shadow-sm)] transition-colors will-change-transform",
                  col.action.active
                    ? "border-primary bg-primary text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                    : "border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] bg-[var(--color-primary-light)] text-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_16%,var(--color-surface))]",
                  "disabled:pointer-events-none disabled:!opacity-40",
                )}
              >
                {col.action.label}
              </button>
            ) : null,
          ),
        )}

        {ranked.map((t) => (
          <span
            key={t.key}
            ref={(el) => {
              if (el) rankRefs.current.set(t.key, el);
              else rankRefs.current.delete(t.key);
            }}
            aria-hidden
            className="absolute left-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-[var(--color-primary-fg)] opacity-0 shadow-[var(--shadow-md)] ring-2 ring-surface will-change-transform"
          >
            {t.rank}
          </span>
        ))}
      </div>

      {/* the selected tray keeps its card; the scene pins it above the tray */}
      <div
        ref={pinnedRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-20 flex flex-col items-center opacity-0 will-change-transform",
          (!selectedTray || hover?.key === selectedTray.key) && "!hidden",
        )}
      >
        {selectedTray ? <TrayCard tooltip={selectedTray.tooltip} /> : null}
      </div>

      {/* the hovered tray: a card above it, a leader down to the pointer */}
      {hover && hoverTray ? (
        <div
          className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: hover.x, top: hover.y - 4 }}
        >
          <TrayCard tooltip={hoverTray.tooltip} />
        </div>
      ) : null}

      {/* tool rail */}
      <div className={cn("absolute left-3 top-3 z-20 flex flex-col overflow-hidden rounded-[12px] p-1", GLASS)}>
        {tools.map(({ icon: Icon, label, onClick, active }, i) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "ds-focus-ring grid size-8 place-items-center rounded-[8px] transition-colors",
              i > 0 && "mt-0.5",
              active ? "bg-primary text-[var(--color-primary-fg)]" : "text-text-secondary hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      {searchOpen ? (
        <div className={cn("absolute left-[60px] top-3 z-20 flex items-center gap-1 rounded-[12px] py-1 pl-2.5 pr-1", GLASS)}>
          <Search className="size-3.5 shrink-0 text-text-muted" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Tray, model or lot"
            aria-label="Highlight trays in this rack"
            className="h-7 w-44 bg-transparent text-sm outline-none placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
            aria-label="Clear search"
            className="ds-focus-ring grid size-7 place-items-center rounded-[8px] text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {focus !== null ? (
        <button
          type="button"
          onClick={() => setFocus(null)}
          className="ds-focus-ring absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary shadow-[var(--shadow-sm)] hover:text-text"
        >
          <Maximize2 className="size-3.5" aria-hidden />
          Whole rack
        </button>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] text-text-secondary sm:inline-flex",
          GLASS,
        )}
      >
        <Hand className="size-3.5 text-text-muted" aria-hidden />
        Drag to rotate
        <span className="text-text-muted" aria-hidden>•</span>
        + / − to zoom
        <span className="text-text-muted" aria-hidden>•</span>
        Click a shelf to view trays
      </div>
    </div>
  );
}
