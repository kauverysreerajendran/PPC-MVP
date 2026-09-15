import type { SapOutward } from "@/features/masterdata/types";
import { fmtDate } from "../../utils/format";
import { BLANK, ReceiptHeader, ReceiptLines, ReceiptSheet, ReceiptSignatures } from "./ReceiptSheet";

/**
 * Vendor QED audit confirmation sheet: vendor QED → Titan QC. The Box UID
 * column is the value scanned on the SAP Inward screen.
 */
export function QedAuditSheetPreview({
  line,
  vendorLabel,
}: {
  line: SapOutward;
  vendorLabel: string;
}) {
  return (
    <ReceiptSheet title="QED AUDIT CONFIRMATION SHEET" from="Vendor QED" to="Titan QC">
      <ReceiptHeader
        fields={[
          ["Vendor", vendorLabel],
          ["Audit in-charge", BLANK],
          ["Date", fmtDate(line.inward_last_scan_at)],
          ["Function", "QED"],
          ["Plant", "SS PLANT"],
        ]}
      />
      <ReceiptLines
        columns={[
          { label: "S.No", align: "right" },
          { label: "Model No" },
          { label: "Part" },
          { label: "Box UID" },
          { label: "Inspected", align: "right" },
          { label: "Accepted", align: "right" },
          { label: "Rework", align: "right" },
          { label: "Verdict" },
        ]}
        rows={[
          [
            "1",
            line.model_no ?? BLANK,
            BLANK,
            line.box_uid ? <span className="ds-chip ds-chip-0 font-mono">{line.box_uid}</span> : BLANK,
            BLANK,
            String(line.received_pieces),
            BLANK,
            BLANK,
          ],
        ]}
        footer={["", "Grand total", "", "", BLANK, String(line.received_pieces), BLANK, ""]}
      />
      <ReceiptSignatures labels={["QED seal & signature", "CC", "BR", "PL"]} />
    </ReceiptSheet>
  );
}
