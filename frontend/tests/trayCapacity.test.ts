import { describe, expect, it } from "vitest";
import {
  capacityExplainer,
  DEFAULT_TRAY_CAPACITY_QTY,
  splitQty,
  trayAllocations,
  traysNeeded,
} from "@/features/rack-locator/trayCapacity";

describe("tray capacity counts quantity", () => {
  it("defaults to 25 qty per tray", () => {
    expect(DEFAULT_TRAY_CAPACITY_QTY).toBe(25);
  });

  it("puts 60 qty in 3 trays — 25, 25 and the remainder 10", () => {
    expect(traysNeeded(60)).toBe(3);
    expect(trayAllocations(60)).toEqual([25, 25, 10]);
    expect(capacityExplainer(60)).toBe("60 qty ÷ 25 per tray → 3 trays needed · last 10");
  });

  it("puts 25 qty in exactly one full tray", () => {
    expect(traysNeeded(25)).toBe(1);
    expect(trayAllocations(25)).toEqual([25]);
    expect(capacityExplainer(25)).toBe("25 qty ÷ 25 per tray → 1 tray needed");
  });

  it("needs no trays for no qty", () => {
    expect(traysNeeded(0)).toBe(0);
    expect(trayAllocations(0)).toEqual([]);
  });

  it("fills only the trays in hand when fewer than needed", () => {
    expect(splitQty(60, 2)).toEqual([25, 25]);
  });
});
