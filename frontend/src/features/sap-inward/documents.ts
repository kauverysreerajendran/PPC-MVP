/**
 * The four inward receipts checked in the Verify window, in flow order.
 * `id` is the value the verify endpoint accepts in `documents_checked`.
 */
export const INWARD_DOCUMENTS = [
  { id: "gi_slip", label: "Goods issue slip", check: "Goods issue slip checked" },
  { id: "titan_challan", label: "Titan challan", check: "Titan challan / gate pass checked" },
  { id: "vendor_challan", label: "Vendor challan", check: "Vendor delivery challan checked" },
  { id: "qed_sheet", label: "QED audit sheet", check: "QED audit sheet checked (no deviations)" },
] as const;

export type InwardDocument = (typeof INWARD_DOCUMENTS)[number]["id"];
