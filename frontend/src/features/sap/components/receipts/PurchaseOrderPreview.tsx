import { fmtDate, fmtNum } from "@/features/sap-inward/utils/format";
import {
  BLANK,
  ReceiptHeader,
  ReceiptLines,
  ReceiptSheet,
  ReceiptSignatures,
} from "@/features/sap-inward/components/receipts/ReceiptSheet";
import type { OutwardDocumentLine } from "./types";

/** SAP purchase order for the job work: Titan → vendor. */
export function PurchaseOrderPreview({
  line,
  vendorLabel,
}: {
  line: OutwardDocumentLine;
  /** vendor name + code, see `vendorLabel()` */
  vendorLabel: string;
}) {
  return (
    <ReceiptSheet title="PURCHASE ORDER" from="Titan" to="Vendor">
      <ReceiptHeader
        fields={[
          ["PO No.", line.po_no ?? BLANK],
          ["Date", fmtDate(line.transaction_date)],
          ["Vendor", vendorLabel],
          ["Plant", "CBE"],
        ]}
      />
      <ReceiptLines
        columns={[
          { label: "Item", align: "right" },
          { label: "Material" },
          { label: "Model" },
          { label: "Batch" },
          { label: "Qty", align: "right" },
          { label: "Movement type" },
        ]}
        rows={[
          [
            "1",
            line.material_no ?? BLANK,
            line.model_no ?? BLANK,
            line.batch_no ?? BLANK,
            fmtNum(line.quantity),
            line.movement_type ?? BLANK,
          ],
        ]}
      />
      <ReceiptSignatures labels={["Authorised by", "Received by"]} />
    </ReceiptSheet>
  );
}
