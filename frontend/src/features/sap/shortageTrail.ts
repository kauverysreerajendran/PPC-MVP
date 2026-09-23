import type { SapOutward } from "@/features/masterdata/types";
import { fmtNum } from "@/features/sap-inward/utils/format";
import type { ShortageTrail } from "./components/OutwardDocumentHover";

/**
 * The quantity trail of a shortage back-order, shared by every screen that
 * shows it (SAP Outward's DC / PO hover, the Scan page) so they can never
 * disagree.
 */

/** A stored quantity as a number, or null when it is genuinely unavailable. */
export function qtyOf(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The quantity trail behind a shortage back-order, for the DC / PO hover card.
 *
 * The figures are the parent's, snapshotted onto the back-order when it was
 * raised (masterdata revision 0024) so the trail stays truthful even if the
 * parent is later reset or re-received. Lines raised before that revision have
 * no snapshot, so the parent row the grid already holds is used instead; a
 * figure neither can supply stays null and the card prints "—".
 */
export function shortageTrail(line: SapOutward, parent: SapOutward | undefined): ShortageTrail {
  const pick = (
    snapshot: number | string | null | undefined,
    fallback: number | string | null | undefined,
  ) => qtyOf(snapshot) ?? qtyOf(fallback);
  return {
    lotQty: pick(line.shortage_parent_lot_qty, parent?.quantity),
    accepted: pick(line.shortage_parent_accepted_qty, parent?.received_qty),
    rejected: pick(line.shortage_parent_rejected_qty, parent?.rejected_qty),
    received: pick(line.shortage_parent_received_qty, parent?.received_qty),
    pendingQty: qtyOf(line.quantity),
    parentRef: line.parent_sap_reference_id,
  };
}

/** The non-document note printed under a back-order's document sheet. */
export function shortageSheetNote(trail: ShortageTrail): string {
  const n = (v: number | null) => (v == null ? "—" : fmtNum(v));
  return (
    `Balance of ${trail.parentRef ?? "the received line"} — lot ${n(trail.lotQty)}, ` +
    `accepted ${n(trail.accepted)}, rejected ${n(trail.rejected)}, ` +
    `pending ${n(trail.pendingQty)}`
  );
}
