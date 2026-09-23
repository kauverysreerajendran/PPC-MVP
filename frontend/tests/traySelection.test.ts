import { describe, expect, it } from "vitest";
import { planPlacement } from "@/features/rack-locator/placementPlan";
import {
  addTray,
  addTrays,
  fillsMessage,
  followInHand,
  maxTraysFor,
  removeTray,
} from "@/features/rack-locator/traySelection";
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

const QTY = 232;
const CAP = 25;
const NINE_AND_SEVEN = [25, 25, 25, 25, 25, 25, 25, 25, 25, 7];

describe("tray selection is capped by qty, not by trays in hand", () => {
  const max = maxTraysFor(QTY, CAP);

  it("232 qty at 25 per tray allows 10 trays", () => {
    expect(max).toBe(10);
    expect(fillsMessage(QTY, max)).toBe("232 qty fills 10 trays");
    expect(fillsMessage(20, 1)).toBe("20 qty fills 1 tray");
  });

  it("with the stepper at 1, clicks 2..10 are all accepted and the stepper follows", () => {
    let chosen: ChosenTray[] = [];
    let inHand = 1;
    for (let n = 1; n <= 10; n += 1) {
      const res = addTray(chosen, tray(n), max);
      expect(res.replaced).toBeNull();
      chosen = res.chosen;
      inHand = followInHand(inHand, chosen.length, max);
      expect(chosen).toHaveLength(n);
      expect(inHand).toBe(n);
      const plan = planPlacement(chosen, QTY, CAP);
      expect(plan.allocation).toEqual(NINE_AND_SEVEN.slice(0, n - 1).concat(n === 10 ? 7 : 25));
    }
    const plan = planPlacement(chosen, QTY, CAP);
    expect(plan.allocation).toEqual(NINE_AND_SEVEN);
    expect(plan.total).toBe(232);
    expect(plan.blockReason).toBeNull();
  });

  it("the eleventh click swaps with the last tray instead of adding", () => {
    const ten = Array.from({ length: 10 }, (_, i) => tray(i + 1));
    const res = addTray(ten, tray(11), max);
    expect(res.chosen).toHaveLength(10);
    expect(res.replaced?.code).toBe("A1-S5-R2-T10");
    expect(res.chosen[9]!.code).toBe("A1-S5-R2-T11");
    expect(followInHand(10, res.chosen.length, max)).toBe(10);
    expect(planPlacement(res.chosen, QTY, CAP).allocation).toEqual(NINE_AND_SEVEN);
  });

  it("clicking a tray already chosen changes nothing in addTray", () => {
    const res = addTray([tray(1)], tray(1), max);
    expect(res.chosen).toHaveLength(1);
    expect(res.replaced).toBeNull();
  });

  it("removing a tray re-splits over the rest", () => {
    const ten = Array.from({ length: 10 }, (_, i) => tray(i + 1));
    const nine = removeTray(ten, "A1-S5-R2-T04");
    const plan = planPlacement(nine, QTY, CAP);
    expect(nine.map((c) => c.tray_no)).not.toContain(4);
    expect(plan.allocation).toEqual([25, 25, 25, 25, 25, 25, 25, 25, 25]);
    expect(plan.total).toBe(225);
  });

  it("taking many stops at the cap", () => {
    const res = addTrays([tray(1)], Array.from({ length: 12 }, (_, i) => tray(i + 1)), max);
    expect(res.offered).toBe(11);
    expect(res.taken).toBe(9);
    expect(res.chosen).toHaveLength(10);
  });

  it("the stepper stays within 1..max", () => {
    expect(followInHand(0, 0, max)).toBe(1);
    expect(followInHand(40, 0, max)).toBe(10);
    expect(followInHand(3, 7, max)).toBe(7);
  });

  it("no selection path ever sends a zero-qty tray", () => {
    let chosen: ChosenTray[] = [];
    for (let n = 1; n <= 15; n += 1) {
      chosen = addTray(chosen, tray(n), max).chosen;
      const plan = planPlacement(chosen, QTY, CAP);
      expect(plan.pieces.every((p) => p.qty > 0)).toBe(true);
      expect(plan.pieces).toHaveLength(chosen.length);
    }
    chosen = removeTray(chosen, "A1-S5-R2-T02");
    expect(planPlacement(chosen, QTY, CAP).pieces.every((p) => p.qty > 0)).toBe(true);
  });
});
