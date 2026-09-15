import type { SapOutward } from "@/features/masterdata/types";

/**
 * Whole parts in received piece number `pieceNo`: the received (accepted) qty
 * split over the received pieces the way receiving splits a lot — equal whole
 * shares, the first `received % pieces` pieces carrying one more.
 */
export function pieceQty(line: SapOutward, pieceNo: number): number | null {
  const received = Number(line.received_qty);
  if (line.received_qty == null || !Number.isFinite(received) || line.received_pieces <= 0) {
    return null;
  }
  const whole = Math.trunc(received);
  const base = Math.floor(whole / line.received_pieces);
  return base + (pieceNo <= whole % line.received_pieces ? 1 : 0);
}
