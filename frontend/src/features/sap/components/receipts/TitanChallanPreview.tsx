import { fmtDate, fmtNum } from "@/features/sap-inward/utils/format";
import {
  BLANK,
  ReceiptHeader,
  ReceiptLines,
  ReceiptSheet,
  ReceiptSignatures,
} from "@/features/sap-inward/components/receipts/ReceiptSheet";
import type { OutwardDocumentLine } from "./types";

/** Titan job work / delivery challan cum gate pass: Titan → vendor. */
export function TitanChallanPreview({
  line,
  vendorLabel,
}: {
  line: OutwardDocumentLine;
  /** vendor name + code, see `vendorLabel()` */
  vendorLabel: string;
}) {
  return (
    <ReceiptSheet title="JOB WORK / DELIVERY CHALLAN CUM GATE PASS" from="Titan" to="Vendor">
      <ReceiptHeader
        fields={[
          ["Challan No.", line.dc_no ?? BLANK],
          ["Date", fmtDate(line.transaction_date)],
          ["From", "Titan Company Limited, Watch Case Mfg Plant, Kallapalayam"],
          ["To", vendorLabel],
          ["Nature of process", "FOR ASSAY REWORK AND RETURN"],
        ]}
      />
      <ReceiptLines
        columns={[
          { label: "S.No", align: "right" },
          { label: "Stock No" },
          { label: "Batch" },
          { label: "HSN" },
          { label: "Description" },
          { label: "Qty", align: "right" },
          { label: "Unit" },
          { label: "Value", align: "right" },
        ]}
        rows={[
          [
            "1",
            line.material_no ?? BLANK,
            line.batch_no ?? BLANK,
            BLANK,
            line.model_no ?? BLANK,
            fmtNum(line.quantity),
            "NO",
            BLANK,
          ],
        ]}
      />
      <ReceiptSignatures labels={["Prepared by", "Checked by", "Received by"]} />
    </ReceiptSheet>
  );
}
