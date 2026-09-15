import type { SapOutward } from "@/features/masterdata/types";
import { fmtDate, fmtNum } from "../../utils/format";
import { BLANK, ReceiptHeader, ReceiptLines, ReceiptSheet, ReceiptSignatures } from "./ReceiptSheet";

/** SAP goods issue slip that sends the cases out: Titan stores → vendor pickup. */
export function GoodsIssueSlipPreview({ line }: { line: SapOutward }) {
  return (
    <ReceiptSheet
      title="Watch Case Manufacturing Plant — GOODS ISSUE SLIP"
      from="Titan stores (CBSC)"
      to="Vendor pickup"
    >
      <ReceiptHeader
        fields={[
          ["Posting date", fmtDate(line.transaction_date)],
          ["GI No.", line.sap_document_no ?? BLANK],
          ["Plant", "CBE"],
          ["Mvt type", line.movement_type ?? BLANK],
          ["Header text", BLANK],
        ]}
      />
      <ReceiptLines
        columns={[
          { label: "Item" },
          { label: "Material" },
          { label: "Batch" },
          { label: "SLoc" },
          { label: "Qty", align: "right" },
        ]}
        rows={[["1", line.material_no ?? BLANK, line.batch_no ?? BLANK, BLANK, fmtNum(line.quantity)]]}
      />
      <ReceiptSignatures labels={["Issued by (CBSC)", "Received by"]} />
    </ReceiptSheet>
  );
}
