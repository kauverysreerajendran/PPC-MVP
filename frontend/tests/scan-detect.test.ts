import { describe, expect, it } from "vitest";
import { detectScan, normalizeScan } from "@/features/scan/detect";
import { buildTimeline } from "@/features/scan/timeline";
import type { LineStatus } from "@/features/status/types";

describe("detectScan", () => {
  it.each([
    ["BUID-0016", "box_uid"],
    ["PO-4500003096", "po"],
    ["DC-260920-17", "dc"],
    ["A1-S1-R2-T02", "location"],
    ["SAP-MVP-004", "sap_ref"],
    ["LOT-7013", "lot"],
  ] as const)("reads %s as %s, with no doubt", (raw, kind) => {
    const d = detectScan(raw);
    expect(d.kind).toBe(kind);
    expect(d.ambiguous).toBe(false);
  });

  it("reads a bare model number as a model, offering other readings", () => {
    const d = detectScan("90086");
    expect(d.kind).toBe("model");
    expect(d.ambiguous).toBe(true);
    expect(d.alternatives).toContain("search");
  });

  it("falls back to a generic search for anything else", () => {
    for (const raw of ["hello world", "X?", "KALAI-INDUSTRIES"]) {
      const d = detectScan(raw);
      expect(d.kind).toBe("search");
      expect(d.ambiguous).toBe(true);
    }
  });

  it("is case-insensitive and trims what a scanner gun appends", () => {
    expect(detectScan("  buid-0016\r\n")).toMatchObject({ value: "BUID-0016", kind: "box_uid" });
    expect(detectScan("dc-260920-17\t").kind).toBe("dc");
    expect(detectScan("k/s4/r2/t5").kind).toBe("location");
    expect(normalizeScan("\n po-1 \n")).toBe("PO-1");
  });

  it("offers PO for a bare SAP purchase-order number", () => {
    expect(detectScan("4500003096")).toMatchObject({ kind: "po", ambiguous: true });
  });
});

describe("buildTimeline", () => {
  const status = (stage: LineStatus["stage"], code: string, label: string): LineStatus => ({
    sap_reference_id: "SAP-1",
    stage,
    code,
    label,
    tone: "success",
    note: null,
    actor: null,
    source: null,
    changed_at: "2026-09-21T10:00:00Z",
  });

  it("marks the furthest stage reached as current and later ones upcoming", () => {
    const steps = buildTimeline(
      {
        outward: status("outward", "DISPATCHED", "Dispatched"),
        inward: status("inward", "VERIFIED", "Verified"),
      },
      null,
    );
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
    expect(steps[2]!.at).toBe("2026-09-21T10:00:00Z");
  });

  it("shows a started placement as the current, partial step", () => {
    const steps = buildTimeline(
      {
        outward: status("outward", "DISPATCHED", "Dispatched"),
        inward: status("inward", "VERIFIED", "Verified"),
        rack: status("rack", "PARTIALLY_PLACED", "Partially placed"),
      },
      null,
    );
    expect(steps[3]).toMatchObject({ state: "current", partial: true, label: "Partially placed" });
  });

  it("never ticks a stage a later one skipped — placed before verified", () => {
    const steps = buildTimeline(
      {
        outward: status("outward", "DISPATCHED", "Dispatched"),
        inward: status("inward", "YET_TO_VERIFY", "Yet to verify"),
        rack: status("rack", "PLACED", "Placed"),
      },
      null,
    );
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "skipped", "current"]);
    expect(steps[2]!.label).toBe("Yet to verify");
  });

  it("has nothing current for a line never dispatched", () => {
    const steps = buildTimeline({}, null);
    expect(steps.every((s) => s.state === "upcoming")).toBe(true);
    expect(steps[0]!.label).toBe("Not dispatched");
  });
});
