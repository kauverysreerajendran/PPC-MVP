import type { SapOutward } from "@/features/masterdata/types";
import { fmtDate, fmtNum } from "../../utils/format";
import { BLANK, ReceiptHeader, ReceiptLines, ReceiptSheet, ReceiptSignatures } from "./ReceiptSheet";

/** The vendor's delivery challan for the return leg: vendor → Titan. */
export function VendorChallanPreview({
  line,
  vendorName,
}: {
  line: SapOutward;
  vendorName: string;
}) {
  return (
    <ReceiptSheet title="DELIVERY CHALLAN" letterhead={vendorName} from="Vendor" to="Titan">
      <ReceiptHeader
        fields={[
          ["DC No", BLANK],
          ["DC Date", BLANK],
          ["To", "M/s Titan Company Limited, Kallapalayam"],
          ["Vendor code", line.vendor_code ?? BLANK],
          ["Vehicle / Driver", BLANK],
        ]}
      />
      <ReceiptLines
        columns={[
          { label: "S.No", align: "right" },
          { label: "Output stock no" },
          { label: "HSN" },
          { label: "Challan No" },
          { label: "PO No" },
          { label: "Challan date" },
          { label: "Qty", align: "right" },
          { label: "Remarks" },
          { label: "Value", align: "right" },
        ]}
        rows={[
          [
            "1",
            line.material_no ?? BLANK,
            BLANK,
            line.dc_no ?? BLANK,
            line.po_no ?? BLANK,
            fmtDate(line.transaction_date),
            fmtNum(line.quantity),
            BLANK,
            BLANK,
          ],
        ]}
      />
      <ReceiptSignatures labels={[`For ${vendorName}`, "Goods received — receiver signature"]} />
    </ReceiptSheet>
  );
}
