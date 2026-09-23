/**
 * What a placement confirm will send, derived from one source.
 *
 * The chosen trays and the qty split used to be two independent pieces of
 * state, zipped at submit time with `allocation[i] ?? 0` — so whenever the
 * remaining qty shrank under a selection (an earlier partial placement, another
 * tab), the trays past the split went out with `qty: 0` and the rack service
 * refused the whole batch. Here the split is taken over the chosen trays
 * themselves, trays with nothing to take never reach the payload, and anything
 * the service would reject is named up front so Confirm can stay disabled.
 */

import { splitQty, traysNeeded } from "./trayCapacity";
import type { ChosenTray } from "./types";

export interface PlacementPlan {
  /** qty each chosen tray takes, in order — 0 for a tray the qty does not reach */
  allocation: number[];
  /** the request body's `pieces`: only trays that take something */
  pieces: { slot_id: string; qty: number }[];
  /** qty the payload places — never more than `remainingQty` */
  total: number;
  /** trays the remaining qty needs */
  needed: number;
  /** chosen trays past what the remaining qty fills */
  unneeded: ChosenTray[];
  /** why Confirm must stay disabled, or null when the request is valid */
  blockReason: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Split `remainingQty` over the chosen trays (25, 25, … then the rest — the
 * same greedy split `splitQty` gives the trays in hand) and build the request
 * from that split.
 */
export function planPlacement(
  chosen: ChosenTray[],
  remainingQty: number,
  capacity: number,
): PlacementPlan {
  const split = splitQty(remainingQty, chosen.length, capacity);
  const allocation = chosen.map((_, i) => split[i] ?? 0);
  const pieces = chosen
    .map((c, i) => ({ slot_id: c.id, qty: allocation[i] ?? 0 }))
    .filter((p) => p.qty > 0);
  const total = pieces.reduce((sum, p) => sum + p.qty, 0);
  const needed = traysNeeded(remainingQty, capacity);
  const unneeded = chosen.filter((_, i) => (allocation[i] ?? 0) <= 0);

  return {
    allocation,
    pieces,
    total,
    needed,
    unneeded,
    blockReason: blockReason(chosen, remainingQty, needed, unneeded.length, pieces),
  };
}

function blockReason(
  chosen: ChosenTray[],
  remainingQty: number,
  needed: number,
  unneededCount: number,
  pieces: { slot_id: string; qty: number }[],
): string | null {
  if (remainingQty <= 0) return "Nothing is left to place for this line";
  if (chosen.length === 0) return "Pick at least one tray in the rack";
  const seen = new Set<string>();
  for (const c of chosen) {
    if (seen.has(c.id) || seen.has(c.code)) return `${c.code} is chosen twice — remove one`;
    seen.add(c.id);
    seen.add(c.code);
  }
  if (unneededCount > 0) return unneededMessage(unneededCount, remainingQty, needed, chosen.length);
  if (pieces.length !== chosen.length) return "Every tray needs the quantity it takes";
  return null;
}

/** `1 tray is not needed — 225 qty fills 9 of the 10 you picked` */
export function unneededMessage(
  count: number,
  remainingQty: number,
  needed: number,
  picked: number,
): string {
  return (
    `${plural(count, "tray")} ${count === 1 ? "is" : "are"} not needed — ` +
    `${remainingQty.toLocaleString()} qty fills ${needed} of the ${picked} you picked`
  );
}

/**
 * What moved between the figures on screen and the service's:
 * `7 qty was already placed — 225 left, 9 trays needed`.
 */
export function remainderChangedMessage(
  before: { placedQty: number; remainingQty: number },
  after: { placedQty: number; remainingQty: number },
  capacity: number,
): string {
  const needed = traysNeeded(after.remainingQty, capacity);
  const tail =
    after.remainingQty > 0
      ? `${after.remainingQty.toLocaleString()} left, ${plural(needed, "tray")} needed`
      : "nothing is left to place";
  const delta = after.placedQty - before.placedQty;
  if (delta > 0) return `${delta.toLocaleString()} qty was already placed — ${tail}`;
  return `the qty left changed from ${before.remainingQty.toLocaleString()} — ${tail}`;
}

/** The service names trays by id in some messages; show the code the operator sees. */
export function withTrayCodes(message: string, chosen: ChosenTray[]): string {
  return chosen.reduce((text, c) => text.split(c.id).join(c.code), message);
}
