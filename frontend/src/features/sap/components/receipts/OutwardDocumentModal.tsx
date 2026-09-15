"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PurchaseOrderPreview } from "./PurchaseOrderPreview";
import { TitanChallanPreview } from "./TitanChallanPreview";
import { OUTWARD_DOCUMENT_TITLE, type OutwardDocKind, type OutwardDocumentLine } from "./types";

export interface OutwardDocumentView {
  kind: OutwardDocKind;
  line: OutwardDocumentLine;
  vendorLabel: string;
}

/** The full outward document sheet (Titan challan or purchase order) in a modal. */
export function OutwardDocumentModal({
  view,
  onClose,
}: {
  view: OutwardDocumentView | null;
  onClose: () => void;
}) {
  if (!view) return null;
  const { kind, line, vendorLabel } = view;
  const no = kind === "dc" ? `DC ${line.dc_no ?? "—"}` : `PO ${line.po_no ?? "—"}`;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${OUTWARD_DOCUMENT_TITLE[kind]} — ${no}`}
      description={vendorLabel}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {kind === "dc" ? (
        <TitanChallanPreview line={line} vendorLabel={vendorLabel} />
      ) : (
        <PurchaseOrderPreview line={line} vendorLabel={vendorLabel} />
      )}
    </Modal>
  );
}
