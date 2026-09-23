/**
 * How much a tray holds — the one place that rule lives on the client.
 *
 * Mirrors `services/rack/app/capacity.py`: a tray holds a bounded *quantity*
 * of received stock, partial allowed, so the last tray of a line usually
 * carries the remainder. This is quantity, not the app's front+back piece
 * count (`received_pieces`) — a 60-qty line is one piece but three trays.
 */

/** Quantity one tray holds when nothing in the data says otherwise. */
export const DEFAULT_TRAY_CAPACITY_QTY = 25;

/** The capacity to use for a tray — its own, when it carries one. */
export function trayCapacity(own?: number | null): number {
  return own != null && own >= 1 ? Math.floor(own) : DEFAULT_TRAY_CAPACITY_QTY;
}

/** Trays it takes to hold `qty` — the last one may be partial. */
export function traysNeeded(qty: number, capacity = DEFAULT_TRAY_CAPACITY_QTY): number {
  return qty > 0 ? Math.ceil(qty / trayCapacity(capacity)) : 0;
}

/**
 * How `qty` falls into `trays` tray-loads, walking down: each takes
 * `min(capacity, qty left)`, so the last carries the remainder —
 * `splitQty(60, 3)` is `[25, 25, 10]`. Asking for fewer trays than the stock
 * needs fills the ones in hand and leaves the rest for later.
 */
export function splitQty(
  qty: number,
  trays: number,
  capacity = DEFAULT_TRAY_CAPACITY_QTY,
): number[] {
  const cap = trayCapacity(capacity);
  const out: number[] = [];
  let left = qty;
  for (let i = 0; i < trays && left > 0; i += 1) {
    const take = Math.min(cap, left);
    out.push(take);
    left -= take;
  }
  return out;
}

/** Every tray-load `qty` needs — `trayAllocations(60)` is `[25, 25, 10]`. */
export function trayAllocations(qty: number, capacity = DEFAULT_TRAY_CAPACITY_QTY): number[] {
  return splitQty(qty, traysNeeded(qty, capacity), capacity);
}

/** `60 qty ÷ 25 per tray → 3 trays needed · last 10` */
export function capacityExplainer(qty: number, capacity = DEFAULT_TRAY_CAPACITY_QTY): string {
  const cap = trayCapacity(capacity);
  const trays = traysNeeded(qty, cap);
  const remainder = qty % cap;
  const head = `${qty} qty ÷ ${cap} per tray → ${trays} tray${trays === 1 ? "" : "s"} needed`;
  return remainder > 0 && trays > 1 ? `${head} · last ${remainder}` : head;
}
