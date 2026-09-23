import { describe, expect, it } from "vitest";
import {
  planPlacement,
  remainderChangedMessage,
  withTrayCodes,
} from "@/features/rack-locator/placementPlan";
import type { ChosenTray } from "@/features/rack-locator/types";

const tray = (n: number): ChosenTray => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  code: `A1-S5-R2-T${String(n).padStart(2, "0")}`,
  warehouse_code: "CBFC",
  aisle_code: "A1",
  rack_code: "K",
  shelf_no: 5,
  row_no: 2,
  tray_no: n,
});
const trays = (count: number) => Array.from({ length: count }, (_, i) => tray(i + 1));

describe("placement payload comes from one source", () => {
  it("232 qty over 10 trays: 9 × 25 then 7, all sent", () => {
    const plan = planPlacement(trays(10), 232, 25);
    expect(plan.allocation).toEqual([25, 25, 25, 25, 25, 25, 25, 25, 25, 7]);
    expect(plan.pieces).toHaveLength(10);
    expect(plan.total).toBe(232);
    expect(plan.blockReason).toBeNull();
  });

  it("225 left with 10 trays chosen: 9 entries summing 225, never a zero", () => {
    const plan = planPlacement(trays(10), 225, 25);
    expect(plan.pieces).toHaveLength(9);
    expect(plan.pieces.reduce((sum, p) => sum + p.qty, 0)).toBe(225);
    expect(plan.pieces.every((p) => p.qty > 0)).toBe(true);
    expect(plan.unneeded.map((t) => t.code)).toEqual(["A1-S5-R2-T10"]);
    expect(plan.blockReason).toBe("1 tray is not needed — 225 qty fills 9 of the 10 you picked");
  });

  it("fewer trays than needed fills the ones in hand and leaves the rest", () => {
    const plan = planPlacement(trays(3), 232, 25);
    expect(plan.pieces.map((p) => p.qty)).toEqual([25, 25, 25]);
    expect(plan.blockReason).toBeNull();
  });

  it("blocks an empty selection and a duplicate tray", () => {
    expect(planPlacement([], 232, 25).blockReason).toMatch(/at least one tray/);
    expect(planPlacement([tray(1), tray(1)], 232, 25).blockReason).toBe(
      "A1-S5-R2-T01 is chosen twice — remove one",
    );
  });
});

describe("placement messages", () => {
  it("says what changed when qty was placed elsewhere", () => {
    expect(
      remainderChangedMessage(
        { placedQty: 0, remainingQty: 232 },
        { placedQty: 7, remainingQty: 225 },
        25,
      ),
    ).toBe("7 qty was already placed — 225 left, 9 trays needed");
  });

  it("names trays by code, not id", () => {
    expect(withTrayCodes(`tray ${tray(4).id} is gone`, [tray(4)])).toBe(
      "tray A1-S5-R2-T04 is gone",
    );
  });
});
