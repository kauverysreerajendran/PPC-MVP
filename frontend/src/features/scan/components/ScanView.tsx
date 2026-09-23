"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useMdList } from "@/features/masterdata/hooks";
import type { Vendor } from "@/features/masterdata/types";
import { vendorLabel } from "@/features/sap/components/receipts/types";
import { shortageSheetNote, shortageTrail } from "@/features/sap/shortageTrail";
import { fmtNum } from "@/features/sap-inward/utils/format";
import { SCAN_KIND_LABEL, detectScan, type ScanKind } from "../detect";
import { useParentLine, useScanResolution, useStageStatuses } from "../hooks";
import { SCAN_SERVICE_LABEL, type ScanLine, type ScanResolution } from "../resolve";
import { useScanSession } from "../store";
import { buildTimeline } from "../timeline";
import { DocumentsPanel } from "./DocumentsPanel";
import { IdentityPanel, QuantitiesPanel, TimelinePanel, lineFacts } from "./LinePanels";
import { RackPanel } from "./RackPanel";
import { ResultList, type ResultListHandle } from "./ResultList";
import { ScanBar } from "./ScanBar";
import { ScanFailed, ScanIdle, ScanNotFound, ScanSkeleton } from "./ScanStates";
import { Copyable, Field, Panel, PanelNotice } from "./parts";

/** What the rack panel says while a line has nothing in a rack. */
function emptyRackHint(line: ScanLine, placedStepReached: boolean, received: boolean): string {
  if (placedStepReached) return "Placement has started but no tray holds its pieces yet.";
  if (!lineFacts(line).boxUid) return "Dispatch it with a Box UID on SAP Outward first.";
  if (!received) return "Receive it on SAP Inward, then place it from there.";
  return "Place it from SAP Inward with Place in rack.";
}

/** A location scan of a tray that holds no SAP line of its own. */
function LocationPanel({ slot }: { slot: NonNullable<ScanResolution["slot"]> }) {
  return (
    <Panel icon={<MapPin />} title="Location">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Tray</p>
      <Copyable
        value={slot.code}
        label="Location"
        className="mt-0.5 font-mono text-[28px] font-semibold leading-tight tracking-tight text-text"
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
        <Field label="Warehouse">{slot.warehouse_code}</Field>
        <Field label="Aisle">{slot.aisle_code}</Field>
        <Field label="Rack">{slot.rack_code}</Field>
        <Field label="Shelf">{slot.shelf_no}</Field>
        <Field label="Row">{slot.row_no}</Field>
        <Field label="Tray">{slot.tray_no}</Field>
        <Field label="State">
          <StatusBadge
            label={slot.occupied ? "Occupied" : slot.slot_state === "empty" ? "Empty" : slot.slot_state}
            tone={slot.occupied ? "success" : "neutral"}
          />
        </Field>
        <Field label="Model">{slot.occupied_by_model ?? "—"}</Field>
        <Field label="Qty">{fmtNum(slot.qty)}</Field>
      </dl>
    </Panel>
  );
}

/**
 * The universal lookup: scan a Box UID, PO, DC or rack location (or a model /
 * lot) and see everything about it — identity, quantities, stage timeline,
 * where its pieces are and its documents — composed from the services that
 * own each piece, live.
 */
export function ScanView() {
  const { active, selected, recent, run, select, remember } = useScanSession();
  const [text, setText] = useState(active?.value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<ResultListHandle>(null);

  const typing = useMemo(() => (text.trim() ? detectScan(text) : null), [text]);
  const activeDetection = useMemo(() => (active ? detectScan(active.value) : null), [active]);

  const resolution = useScanResolution(active);
  const result = resolution.data;
  const lines = useMemo(() => result?.lines ?? [], [result]);
  const refs = useMemo(() => lines.map((l) => l.ref), [lines]);
  const statuses = useStageStatuses(refs);
  const line = lines.find((l) => l.ref === selected) ?? lines[0] ?? null;

  const vendors = useMdList<Vendor>("vendors", { page_size: 200 });
  const vendorNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors.data?.items ?? []) m.set(v.vendor_code, v.vendor_name);
    return m;
  }, [vendors.data]);

  const facts = line ? lineFacts(line) : null;
  const parent = useParentLine(facts?.shortage ? facts.parentRef : null);
  const vendorName = facts?.vendorCode
    ? (vendorNames.get(facts.vendorCode) ?? facts.feedVendorName)
    : null;

  // Autofocus on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Each new scan, once it settles: back to the field (selected, so the next
  // scan overwrites) and into Recent scans. Polling refetches don't count.
  const settledKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active || resolution.isFetching || resolution.isPending) return;
    const key = `${active.kind}:${active.value}`;
    if (settledKey.current === key) return;
    settledKey.current = key;
    inputRef.current?.focus();
    inputRef.current?.select();
    if (resolution.data) {
      const d = resolution.data;
      remember({
        value: d.value,
        kind: d.kind,
        found: d.lines.length || (d.slot ? 1 : 0),
        at: Date.now(),
      });
    }
  }, [active, resolution.isFetching, resolution.isPending, resolution.data, remember]);

  function submit() {
    const d = detectScan(text);
    if (!d.value) {
      inputRef.current?.focus();
      return;
    }
    setText(d.value);
    settledKey.current = null;
    if (active?.value === d.value && active.kind === d.kind) void resolution.refetch();
    else run(d.value, d.kind);
  }

  function readAs(kind: ScanKind) {
    if (!active) return;
    settledKey.current = null;
    run(active.value, kind);
  }

  // What the polite live region says.
  const announcement = !active
    ? ""
    : resolution.isPending
      ? `Looking up ${active.value}…`
      : resolution.isError
        ? `Could not look up ${active.value}.`
        : !result
          ? ""
          : result.lines.length === 0 && !result.slot
            ? `Nothing matches ${active.value}.`
            : result.lines.length > 1
              ? `${result.lines.length} lines for ${SCAN_KIND_LABEL[result.kind]} ${result.value}. First line opened.`
              : line
                ? `Found ${facts?.boxUid ? `Box UID ${facts.boxUid}` : `line ${line.ref}`}.`
                : `Found location ${result.slot?.code}.`;

  const lineStatuses = line ? statuses.byRef.get(line.ref) : undefined;
  const steps = line ? buildTimeline(lineStatuses ?? {}, line.outward) : [];
  const placedStep = steps.find((s) => s.key === "placed");
  const receivedStep = steps.find((s) => s.key === "received");

  return (
    <>
      {/* The scan field is the page's one action, so it sits in the header
          beside the title rather than as a bar of its own below it. */}
      <PageHeader
        title="Scan"
        actionsAlign="start"
        actions={
          <ScanBar
            inputRef={inputRef}
            value={text}
            onChange={setText}
            onSubmit={submit}
            typing={typing}
            active={
              active && activeDetection ? { detection: activeDetection, kind: active.kind } : null
            }
            onReadAs={readAs}
            pending={resolution.isFetching && resolution.isPending}
            onArrowDown={lines.length > 1 ? () => listRef.current?.focus() : undefined}
          />
        }
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {!active ? (
        <ScanIdle
          recent={recent}
          onRecall={(r) => {
            setText(r.value);
            settledKey.current = null;
            run(r.value, r.kind);
          }}
        />
      ) : resolution.isPending ? (
        <ScanSkeleton />
      ) : resolution.isError ? (
        <ScanFailed
          message={resolution.error instanceof Error ? resolution.error.message : "The services could not be reached"}
          onRetry={() => void resolution.refetch()}
        />
      ) : result && result.lines.length === 0 && !result.slot ? (
        <ScanNotFound
          value={result.value}
          kind={result.kind}
          alternatives={
            activeDetection
              ? [activeDetection.kind, ...activeDetection.alternatives].filter((k) => k !== result.kind)
              : []
          }
          onReadAs={readAs}
        />
      ) : result ? (
        <div key={`${result.kind}:${result.value}`}>
          {result.degraded.length ? (
            <div className="mb-4">
              <PanelNotice
                title={`${result.degraded.map((s) => SCAN_SERVICE_LABEL[s]).join(" and ")} unavailable`}
                onRetry={() => void resolution.refetch()}
              >
                Showing what the other services know — this result may be incomplete.
              </PanelNotice>
            </div>
          ) : null}

          {lines.length > 1 ? (
            <ResultList
              ref={listRef}
              title={`${lines.length} lines · ${SCAN_KIND_LABEL[result.kind]} ${result.value}`}
              lines={lines}
              selected={line?.ref ?? lines[0]!.ref}
              onSelect={select}
              statuses={statuses.byRef}
            />
          ) : null}

          <div
            key={line?.ref ?? "slot"}
            className="ds-animate-fade-up grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
          >
            <div className="min-w-0 space-y-4">
              {line ? (
                <>
                  <IdentityPanel line={line} vendorName={vendorName} />
                  <QuantitiesPanel line={line} />
                  <TimelinePanel
                    line={line}
                    statuses={lineStatuses}
                    statusDown={statuses.isError}
                    onRetry={() => void statuses.refetch()}
                  />
                </>
              ) : result.slot ? (
                <LocationPanel slot={result.slot} />
              ) : null}
            </div>
            <div className="min-w-0 space-y-4">
              <RackPanel
                refId={line?.ref ?? null}
                slot={result.slot}
                emptyHint={
                  line
                    ? emptyRackHint(line, placedStep?.state !== "upcoming", receivedStep?.state !== "upcoming")
                    : "This tray holds nothing."
                }
              />
              {line ? (
                <DocumentsPanel
                  line={(line.outward ?? line.feed)!}
                  vendorLabel={vendorLabel(vendorName, facts?.vendorCode)}
                  note={
                    line.outward && facts?.shortage
                      ? shortageSheetNote(shortageTrail(line.outward, parent.data ?? undefined))
                      : undefined
                  }
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
