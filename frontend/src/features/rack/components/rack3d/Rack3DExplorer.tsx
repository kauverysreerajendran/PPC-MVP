"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import stageBg from "@/assets/images/7.png";
import { Box, ChevronDown, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RACK_TONE, toneForFillPercent } from "@/components/rack";
import { cn } from "@/lib/cn";
import { useRackDetail, useTopology } from "@/features/rack-locator/hooks";
import type { RackDetail, Shelf, SlotState, Tray } from "@/features/rack-locator/types";
import {
  Rack3DScene,
  type SceneHover,
  type ScenePalette,
  type SceneRack,
} from "./Rack3DScene";

/**
 * Exploded 3D view of one rack, above the slot table on the Racks page.
 *
 * Shelves are the layers: assembled they stand as the rack does in the aisle,
 * exploded they float apart so every tray can be seen and picked. Data comes
 * from the Rack service's own rack-detail read (the same one Rack Locator
 * draws), so shelf / row / tray shape and occupancy are never computed here.
 */

const STATE_VAR: Record<SlotState, string> = {
  empty: "--color-empty",
  occupied: "--color-rack-upright",
  reserved: "--color-warning",
  blocked: "--color-danger",
};

const STATE_LABEL: Record<SlotState, string> = {
  empty: "Empty",
  occupied: "Occupied",
  reserved: "Reserved",
  blocked: "Blocked",
};

/** Resolve a CSS custom property to an `rgb()` string three.js can parse. */
function resolveColor(host: HTMLElement, cssVar: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar}, ${fallback})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return /^rgba?\(/.test(value) ? value : fallback;
}

function shelfTone(shelf: Shelf) {
  return RACK_TONE[toneForFillPercent(shelf.occupancy.occupancy_pct)];
}

/** Bumps whenever the app theme flips, so scene colours are re-read. */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

interface RackOption {
  key: string;
  warehouse_code: string;
  aisle_code: string;
  rack_code: string;
  label: string;
}

/** What the slot table's search / filter is showing, mirrored onto the trays. */
export interface Rack3DFilter {
  search: string;
  occupied: "" | "true" | "false";
}

/** Codes of the trays the filter matches; `null` when nothing is filtered. */
function matchingTrays(shelves: Shelf[], filter: Rack3DFilter | undefined): Set<string> | null {
  const q = filter?.search.trim().toLowerCase() ?? "";
  const occ = filter?.occupied ?? "";
  if (!q && !occ) return null;
  const codes = new Set<string>();
  for (const t of shelves.flatMap((s) => s.rows.flatMap((r) => r.trays))) {
    if (occ === "true" && t.state !== "occupied") continue;
    if (occ === "false" && t.state !== "empty") continue;
    const hay = [t.code, t.occupied_by_model, t.lot_no, t.location_name, t.sap_reference_id];
    if (q && !hay.some((v) => v?.toString().toLowerCase().includes(q))) continue;
    codes.add(t.code);
  }
  return codes;
}

/** Translucent card surface shared by the overlays floating over the scene. */
const GLASS =
  "border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_82%,transparent)] shadow-[var(--shadow-md)] backdrop-blur-md";

/**
 * The warehouse the rack stands in: a lit hall with a ringed pedestal the
 * rack is centred on. Dark theme dims it so the overlays keep their contrast.
 */
function StageBackdrop() {
  return (
    <>
      <Image
        src={stageBg}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 1024px) 80vw, 100vw"
        className="pointer-events-none select-none object-cover object-[50%_72%]"
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-[color-mix(in_srgb,var(--color-bg,#0b1416)_72%,transparent)] dark:block" />
    </>
  );
}

export function Rack3DExplorer({
  toolbar,
  actions,
  filter,
}: {
  /** left of the bottom bar — the slot table's search and filter */
  toolbar?: ReactNode;
  /** right of the bottom bar */
  actions?: ReactNode;
  /** dims trays outside what the slot table is showing */
  filter?: Rack3DFilter | undefined;
}) {
  const topology = useTopology();
  const options = useMemo<RackOption[]>(
    () =>
      (topology.data?.warehouses ?? []).flatMap((w) =>
        w.aisles.flatMap((a) =>
          a.racks.map((r) => ({
            key: `${w.warehouse_code}|${a.aisle_code}|${r.rack_code}`,
            warehouse_code: w.warehouse_code,
            aisle_code: a.aisle_code,
            rack_code: r.rack_code,
            label: `${r.rack_name ?? r.rack_code} · ${w.warehouse_code} / ${a.aisle_code}`,
          })),
        ),
      ),
    [topology.data],
  );

  const [rackKey, setRackKey] = useState<string | null>(null);
  const active = options.find((o) => o.key === rackKey) ?? options[0] ?? null;
  const detail = useRackDetail(
    active
      ? {
          warehouse_code: active.warehouse_code,
          aisle_code: active.aisle_code,
          rack_code: active.rack_code,
        }
      : null,
  );

  // The title doubles as the rack picker: an invisible native select laid over it.
  const picker =
    options.length > 1 ? (
      <select
        aria-label="Rack"
        value={active?.key ?? ""}
        onChange={(e) => setRackKey(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <Card className="mb-4 overflow-hidden">
      {detail.data ? (
        <RackStage
          key={active?.key}
          detail={detail.data}
          picker={picker}
          toolbar={toolbar}
          actions={actions}
          filter={filter}
        />
      ) : (
        <div className="relative grid h-[493px] place-items-center overflow-hidden pb-16 text-sm text-text-muted">
          <StageBackdrop />
          <span className="relative">
            {topology.isError || detail.isError
              ? "Couldn't load the rack layout."
              : topology.isLoading || detail.isLoading
                ? "Loading rack…"
                : "No racks configured yet."}
          </span>
          <BottomBar toolbar={toolbar} actions={actions} />
        </div>
      )}
    </Card>
  );
}

function BottomBar({
  toolbar,
  actions,
  children,
}: {
  toolbar?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const divider = <span className="hidden h-8 w-px shrink-0 bg-border lg:block" aria-hidden />;
  return (
    <div
      className={cn(
        "absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-[18px] px-3 py-2.5",
        GLASS,
      )}
    >
      {toolbar ? <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div> : null}
      {toolbar && children ? divider : null}
      <div className="flex flex-1 justify-center">{children}</div>
      {actions && children ? divider : null}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function RackStage({
  detail,
  picker,
  toolbar,
  actions,
  filter,
}: {
  detail: RackDetail;
  picker: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
  filter?: Rack3DFilter | undefined;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Rack3DScene | null>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [noGl, setNoGl] = useState(false);
  const [explode, setExplode] = useState(0);
  const [shelfIdx, setShelfIdx] = useState<number | null>(null);
  const [trayCode, setTrayCode] = useState<string | null>(null);
  const [hover, setHover] = useState<SceneHover | null>(null);
  const themeVersion = useThemeVersion();

  const shelves = detail.shelves;

  // Engine lifetime: one per mounted rack.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let scene: Rack3DScene;
    try {
      scene = new Rack3DScene(canvas, {
        onPick: (s, code) => {
          setShelfIdx(s);
          setTrayCode(code);
          setExplode((v) => (v < 0.7 ? 1 : v));
        },
        onHover: setHover,
      });
    } catch {
      setNoGl(true);
      return;
    }
    sceneRef.current = scene;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) scene.resize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(host);
    const t = window.setTimeout(() => setExplode(1), 1500);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Rebuild geometry only when what's drawn actually changes (the detail polls).
  const signature = useMemo(
    () =>
      shelves
        .map(
          (s) =>
            `${s.occupancy.occupancy_pct}:` +
            s.rows.map((r) => r.trays.map((t) => `${t.code}=${t.state}`).join(",")).join(";"),
        )
        .join("|"),
    [shelves],
  );

  useEffect(() => {
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    const palette: ScenePalette = {
      empty: resolveColor(host, STATE_VAR.empty, "#2f6fdb"),
      occupied: resolveColor(host, STATE_VAR.occupied, "#64748b"),
      reserved: resolveColor(host, STATE_VAR.reserved, "#d4920c"),
      blocked: resolveColor(host, STATE_VAR.blocked, "#d64545"),
      primary: resolveColor(host, "--color-primary", "#0d9488"),
      platform: resolveColor(host, "--color-surface", "#ffffff"),
      steel: resolveColor(host, "--color-rack-beam", "#94a3b8"),
      upright: resolveColor(host, "--color-rack-upright", "#64748b"),
    };
    const model: SceneRack = {
      shelves: shelves.map((s) => ({
        tone: resolveColor(host, shelfTone(s).color.slice(4, -1), "#2f6fdb"),
        rows: s.rows.map((r) => r.trays.map((t) => ({ code: t.code, state: t.state }))),
      })),
    };
    scene.setRack(model, palette);
    scene.setLabels(labelRefs.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `shelves`
  }, [signature, themeVersion]);

  const matches = useMemo(
    () => matchingTrays(shelves, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `shelves`
    [signature, filter?.search, filter?.occupied],
  );
  // After the rack effect above, so a rebuilt rack picks the filter up again.
  useEffect(() => sceneRef.current?.setFilter(matches), [matches, signature, themeVersion]);

  useEffect(() => sceneRef.current?.setExplode(explode), [explode]);
  useEffect(() => sceneRef.current?.setSelection(shelfIdx, trayCode), [shelfIdx, trayCode]);

  useEffect(() => {
    if (shelfIdx === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shelfIdx]);

  function selectShelf(i: number) {
    setShelfIdx(i);
    setTrayCode(null);
    if (explode < 0.7) setExplode(1);
  }

  function close() {
    setShelfIdx(null);
    setTrayCode(null);
  }

  const shelf = shelfIdx !== null ? shelves[shelfIdx] : undefined;
  const tray: Tray | undefined = shelf && trayCode
    ? shelf.rows.flatMap((r) => r.trays).find((t) => t.code === trayCode)
    : undefined;
  const hoverTray = hover?.code
    ? shelves[hover.shelf]?.rows.flatMap((r) => r.trays).find((t) => t.code === hover.code)
    : undefined;

  return (
    <div
      ref={hostRef}
      className="relative h-[493px] overflow-hidden"
    >
      <StageBackdrop />
      <canvas ref={canvasRef} className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing" />

      {noGl ? (
        <div className="absolute inset-0 grid place-items-center bg-surface p-6 text-center text-sm text-text-muted">
          Your browser couldn&apos;t start WebGL, so the 3D rack can&apos;t be shown. The slot table below has the same data.
        </div>
      ) : null}

      {/* Shelf chips — positioned every frame by the scene */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {shelves.map((s, i) => {
          const tone = shelfTone(s);
          const on = shelfIdx === i;
          return (
            <button
              key={s.shelf_no}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              type="button"
              onClick={() => selectShelf(i)}
              style={{ ["--c" as string]: tone.color }}
              className="group absolute left-0 top-0 inline-flex items-center whitespace-nowrap opacity-0 will-change-transform"
            >
              {/* leader: a dot on the shelf edge, a hairline out to the chip */}
              <span
                className="size-2 shrink-0 rounded-full bg-[var(--c)] ring-2 ring-[color-mix(in_srgb,var(--color-surface)_85%,transparent)]"
                aria-hidden
              />
              <span className="h-px w-4 shrink-0 bg-[var(--c)] opacity-70" aria-hidden />
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold shadow-[var(--shadow-md)] ring-1 transition-colors",
                  on
                    ? "bg-[var(--c)] text-white ring-[var(--c)]"
                    : "bg-surface text-text ring-border group-hover:ring-[var(--c)]",
                )}
              >
                <b
                  className={cn(
                    "min-w-10 rounded-full px-2 py-0.5 text-center text-[11px] tracking-wide",
                    on ? "bg-white text-[var(--c)]" : "bg-[var(--c)] text-white",
                  )}
                >
                  {Math.round(s.occupancy.occupancy_pct)}%
                </b>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {hover && hoverTray && !noGl ? (
        <div
          className="pointer-events-none absolute z-10 rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 font-mono text-[11px] text-[var(--color-surface)] shadow-[var(--shadow-md)]"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hoverTray.code} · {STATE_LABEL[hoverTray.state]}
          {hoverTray.occupied_by_model ? ` · ${hoverTray.occupied_by_model}` : ""}
        </div>
      ) : null}

      {/* Rack summary + legend */}
      <div className="absolute left-5 top-5 z-10 max-w-[calc(100%-2.5rem)]">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-[14px] text-primary", GLASS)}>
            <Box className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="relative inline-flex max-w-full items-center gap-1.5">
              <h3 className="truncate text-2xl font-bold leading-tight tracking-tight text-text">
                {detail.rack_name ?? detail.rack_code}
              </h3>
              {picker ? <ChevronDown className="size-5 shrink-0 text-text-muted" aria-hidden /> : null}
              {picker}
            </div>
            <div className="mt-0.5 text-sm text-text-muted">
              {detail.shelf_count} shelves · {detail.tray_count} trays ·{" "}
              {Math.round(detail.occupancy.occupancy_pct)}% occupied
            </div>
          </div>
        </div>
        <div
          className={cn(
            "pointer-events-none mt-3 inline-flex flex-wrap gap-x-4 gap-y-1 rounded-[12px] px-3 py-2 text-xs font-medium text-text-secondary",
            GLASS,
          )}
        >
          {(Object.keys(STATE_VAR) as SlotState[]).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: `var(${STATE_VAR[st]})` }} />
              {STATE_LABEL[st]}
            </span>
          ))}
        </div>
      </div>

      {/* Table search / filter · explode controls · actions */}
      <BottomBar toolbar={toolbar} actions={actions}>
        <div className="flex items-center gap-3 rounded-full border border-border bg-surface py-1 pl-1 pr-4 shadow-[var(--shadow-sm)]">
          <Button size="sm" className="min-w-28 rounded-full" onClick={() => setExplode(explode > 0.5 ? 0 : 1)}>
            <Box className="size-4" aria-hidden />
            {explode > 0.5 ? "Assemble" : "Explode"}
          </Button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(explode * 100)}
            onChange={(e) => setExplode(Number(e.target.value) / 100)}
            aria-label="Explode amount"
            className="w-36 cursor-pointer accent-[var(--color-primary)] sm:w-48"
          />
        </div>
      </BottomBar>

      {/* Shelf / tray detail */}
      <aside
        aria-live="polite"
        className={cn(
          "absolute bottom-[92px] right-4 top-4 z-10 flex w-80 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[14px] border border-border bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] shadow-[var(--shadow-lg)] backdrop-blur transition-all duration-300",
          shelf ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0",
        )}
      >
        {shelf ? (
          <ShelfPanel
            shelf={shelf}
            index={shelfIdx!}
            total={shelves.length}
            tray={tray}
            onTray={setTrayCode}
            onNext={() => selectShelf(((shelfIdx ?? -1) + 1) % shelves.length)}
            onClose={close}
          />
        ) : null}
      </aside>
    </div>
  );
}

function ShelfPanel({
  shelf,
  index,
  total,
  tray,
  onTray,
  onNext,
  onClose,
}: {
  shelf: Shelf;
  index: number;
  total: number;
  tray: Tray | undefined;
  onTray: (code: string | null) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const tone = shelfTone(shelf);
  const o = shelf.occupancy;
  return (
    <>
      <div className="h-1 shrink-0" style={{ background: tone.color }} />
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.color }}>
            Shelf {index + 1} of {total} · {tone.label}
          </div>
          <h4 className="mt-1 text-lg font-bold leading-tight">{shelf.label}</h4>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full" style={{ width: `${o.occupancy_pct}%`, background: tone.color }} />
        </div>
        <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
          {(
            [
              ["Used", o.occupied],
              ["Free", o.empty],
              ["Held", o.reserved],
              ["Blocked", o.blocked],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded bg-surface-2 py-1">
              <dt className="text-text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 space-y-1">
          {shelf.rows.map((r) => (
            <div key={r.row_no} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-[10px] text-text-muted">{r.label}</span>
              <div className="flex flex-wrap gap-0.5">
                {r.trays.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    title={`${t.code} · ${STATE_LABEL[t.state]}`}
                    onClick={() => onTray(tray?.code === t.code ? null : t.code)}
                    className={cn(
                      "size-4 rounded-[3px] ring-offset-1 ring-offset-surface",
                      tray?.code === t.code && "ring-2 ring-primary",
                    )}
                    style={{ background: `var(${STATE_VAR[t.state]})`, opacity: t.state === "blocked" ? 0.55 : 1 }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {tray ? (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-border p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold">{tray.code}</span>
              <span className="ds-chip" style={{ ["--ds-chip" as string]: `var(${STATE_VAR[tray.state]})` }}>
                {STATE_LABEL[tray.state]}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <Field label="Model" value={tray.occupied_by_model} />
              <Field label="Qty" value={tray.qty} />
              <Field label="Lot" value={tray.lot_no} />
              <Field label="SAP Ref" value={tray.sap_reference_id} />
              <Field
                label="Since"
                value={tray.date_of_occupied ? new Date(tray.date_of_occupied).toLocaleString() : null}
              />
              <Field label="Location" value={tray.location_name} />
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-xs text-text-muted">Click a tray in the 3D view or above for its contents.</p>
        )}
      </div>

      <div className="flex shrink-0 justify-end border-t border-border px-4 py-2">
        <Button size="sm" onClick={onNext}>
          Next shelf
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate">{value ?? <span className="text-text-muted">—</span>}</dd>
    </>
  );
}
