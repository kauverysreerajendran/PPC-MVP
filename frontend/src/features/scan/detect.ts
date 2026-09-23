/**
 * What an operator scanned, told apart by its shape alone — no dropdown to
 * pick the type first. A guess (a bare number, a free-text term) is flagged
 * `ambiguous` and carries the other readings the operator can switch to.
 */

export type ScanKind =
  | "box_uid"
  | "po"
  | "dc"
  | "location"
  | "sap_ref"
  | "lot"
  | "model"
  | "search";

export const SCAN_KIND_LABEL: Record<ScanKind, string> = {
  box_uid: "Box UID",
  po: "PO",
  dc: "DC",
  location: "Location",
  sap_ref: "SAP reference",
  lot: "Lot",
  model: "Model",
  search: "Search",
};

export interface Detection {
  /** the scanned value, trimmed and upper-cased — what is looked up */
  value: string;
  kind: ScanKind;
  /** true when the shape alone can't settle it — offer `alternatives` */
  ambiguous: boolean;
  /** other readings the operator may pick instead */
  alternatives: ScanKind[];
}

/** Rack tray code, as the rack service parses it: `A1-S1-R2-T02`, `K/S4/R2/T5`. */
const LOCATION = /^[A-Z0-9]+[-/ ]?S\d+[-/ ]?R\d+[-/ ]?T\d+$/;
const BOX_UID = /^BUID[- ]?\d+$/;
const PO = /^PO[- ]?\d+$/;
const DC = /^DC[- ]?\d+(?:-\d+)*$/;
const SAP_REF = /^SAP-[A-Z0-9-]+$/;
const LOT = /^LOT[- ]?[A-Z0-9-]+$/;
/** a model number: digits, optionally a letter suffix and digits (`90086`, `1580SL01`) */
const MODEL = /^\d{4,8}[A-Z]{0,4}\d{0,3}$/;
/** a bare SAP purchase-order number without its `PO-` prefix */
const BARE_PO = /^45\d{8}$/;

/**
 * A barcode gun sends the code plus a trailing newline (sometimes a tab);
 * whitespace inside is collapsed. Matching is case-insensitive, so the value
 * is upper-cased.
 */
export function normalizeScan(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

export function detectScan(raw: string): Detection {
  const value = normalizeScan(raw);
  const exact = (kind: ScanKind): Detection => ({ value, kind, ambiguous: false, alternatives: [] });
  if (BOX_UID.test(value)) return exact("box_uid");
  if (PO.test(value)) return exact("po");
  if (DC.test(value)) return exact("dc");
  if (SAP_REF.test(value)) return exact("sap_ref");
  if (LOT.test(value)) return exact("lot");
  if (LOCATION.test(value)) return exact("location");
  if (BARE_PO.test(value)) {
    return { value, kind: "po", ambiguous: true, alternatives: ["model", "search"] };
  }
  if (MODEL.test(value)) {
    return { value, kind: "model", ambiguous: true, alternatives: ["po", "lot", "search"] };
  }
  return {
    value,
    kind: "search",
    ambiguous: true,
    alternatives: ["box_uid", "po", "dc", "model"],
  };
}
