"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useRackDetail } from "../../hooks";
import type { ChosenTray, SelectedLocation } from "../../types";
import { RackDetailView } from "../RackDetail";

/**
 * "Change" on a suggestion card: the existing rack tray grid for that
 * suggestion's rack, restricted to empty/reserved trays — occupied and
 * blocked trays are disabled with a reason instead of a silent no-op click
 * (docs/01 §10 accessibility: every interactive state is announced).
 */
export function TrayPickerModal({
  open,
  onClose,
  rack,
  excludeCodes,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  rack: { warehouse_code: string; aisle_code: string; rack_code: string } | null;
  excludeCodes: string[];
  onPick: (tray: ChosenTray) => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const detail = useRackDetail(open ? rack : null);

  function handleSelect(loc: SelectedLocation) {
    if (!loc.id || (loc.state !== "empty" && loc.state !== "reserved")) return;
    if (excludeCodes.includes(loc.code)) {
      toast("info", `${loc.code} is already chosen for another piece`);
      return;
    }
    setSelected(loc);
    onPick({
      id: loc.id,
      code: loc.code,
      warehouse_code: loc.warehouse_code,
      aisle_code: loc.aisle_code,
      rack_code: loc.rack_code,
      shelf_no: loc.shelf_no,
      row_no: loc.row_no,
      tray_no: loc.tray_no,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rack ? `Choose a tray in rack ${rack.rack_code}` : "Choose a tray"}
      description="Occupied and blocked trays are disabled."
      size="lg"
    >
      {detail.isError ? (
        <ErrorState title="Unable to load this rack" onRetry={() => void detail.refetch()} />
      ) : detail.data ? (
        <RackDetailView
          detail={detail.data}
          selected={selected}
          recommendations={[]}
          onSelect={handleSelect}
          pickerMode
          className="border-0 p-0 shadow-none"
        />
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </Modal>
  );
}
