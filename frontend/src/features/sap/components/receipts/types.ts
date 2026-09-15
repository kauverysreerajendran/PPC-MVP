/**
 * The outward-line fields the document previews print. Both the SAP feed
 * record (SAP Outward) and the Masterdata outward line (SAP Inward) satisfy it.
 */
export interface OutwardDocumentLine {
  dc_no: string | null;
  po_no: string | null;
  transaction_date: string | null;
  material_no: string | null;
  model_no: string | null;
  batch_no: string | null;
  quantity: number | string | null;
  movement_type: string | null;
}

/** Which outward document: the Titan delivery challan or the purchase order. */
export type OutwardDocKind = "dc" | "po";

export const OUTWARD_DOCUMENT_TITLE: Record<OutwardDocKind, string> = {
  dc: "Titan challan",
  po: "Purchase order",
};

/** "Vendor name (code)" as printed on the documents; "—" for a line with no vendor. */
export function vendorLabel(name: string | null | undefined, code: string | null | undefined): string {
  if (!code) return "—";
  return `${name ?? "—"} (${code})`;
}
