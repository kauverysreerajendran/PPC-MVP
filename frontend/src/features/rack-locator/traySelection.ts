/**
 * Which trays a placement may choose — the rules behind every click.
 *
 * The only real limit is the quantity: `remainingQty` fills
 * `traysNeeded(remainingQty, capacity)` trays, and a tray past that would take
 * 0 qty, which the rack service refuses. "Trays in hand" is only a seed for how
 * many trays the suggestion run asks for; it never caps what the operator can
 * click, and it follows the operator up when they choose more.
 */

import { traysNeeded } from "./trayCapacity";
import type { ChosenTray } from "./types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The most trays this qty can use — at least 1, so the stepper always has a range. */
export function maxTraysFor(remainingQty: number, capacity: number): number {
  return Math.max(1, traysNeeded(remainingQty, capacity));
}

/** `232 qty fills 10 trays` */
export function fillsMessage(remainingQty: number, maxTrays: number): string {
  return `${remainingQty.toLocaleString()} qty fills ${plural(maxTrays, "tray")}`;
}

export interface AddResult {
  chosen: ChosenTray[];
  /** the tray the new one replaced, when the selection was already full */
  replaced: ChosenTray | null;
}

/**
 * Take `tray` as the next location. Under the cap it is appended; at the cap
 * it replaces the last tray chosen — the operator changed their mind about
 * where that one goes.
 */
export function addTray(chosen: ChosenTray[], tray: ChosenTray, maxTrays: number): AddResult {
  if (chosen.some((c) => c.code === tray.code)) return { chosen, replaced: null };
  if (chosen.length < maxTrays) return { chosen: [...chosen, tray], replaced: null };
  const replaced = chosen[chosen.length - 1] ?? null;
  return { chosen: [...chosen.slice(0, maxTrays - 1), tray], replaced };
}

/** Give a chosen tray back. */
export function removeTray(chosen: ChosenTray[], code: string): ChosenTray[] {
  return chosen.filter((c) => c.code !== code);
}

export interface AddManyResult {
  chosen: ChosenTray[];
  /** how many of the offered trays were new */
  offered: number;
  /** how many of those were taken before the cap */
  taken: number;
}

/** Take several trays in order (a column's "All empty", "Accept all"), up to the cap. */
export function addTrays(
  chosen: ChosenTray[],
  trays: ChosenTray[],
  maxTrays: number,
): AddManyResult {
  const fresh = trays.filter((t) => !chosen.some((c) => c.code === t.code));
  const take = fresh.slice(0, Math.max(0, maxTrays - chosen.length));
  return { chosen: [...chosen, ...take], offered: fresh.length, taken: take.length };
}

/** The stepper follows the operator: never below the trays chosen, never above the cap. */
export function followInHand(inHand: number, chosenCount: number, maxTrays: number): number {
  return Math.min(Math.max(inHand, chosenCount, 1), maxTrays);
}
