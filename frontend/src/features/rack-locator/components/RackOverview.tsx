"use client";

import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OccupancyTone } from "./trayStyles";
import type { RackSummary, WarehouseSummary } from "../types";
import { AisleMap } from "./AisleMap";

/**
 * The landing view for one warehouse: every aisle drawn as a floor plan of
 * colour tiles.
 *
 * The occupancy readout, the stacked bar and the 5-colour legend that used to
 * sit above these maps now live in OverviewHeaderCard, together with the
 * breadcrumb and the controls. The filter they toggle is owned by
 * RackLocatorView and passed in, so a legend chip still dims every rack that
 * isn't in that state — same client-side toggle, no new data.
 */
export function RackOverview({
  warehouse,
  activeRackCode,
  filter,
  onOpen,
}: {
  warehouse: WarehouseSummary;
  activeRackCode?: string | undefined;
  filter: OccupancyTone | null;
  onOpen: (rack: RackSummary) => void;
}) {
  if (warehouse.aisles.length === 0) {
    return (
      <EmptyState
        icon={<Warehouse />}
        title="No racks registered yet"
        description="Add a rack to the topology master and its shelves, rows and trays will appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {warehouse.aisles.map((aisle) => (
        <AisleMap
          key={aisle.aisle_code}
          aisle={aisle}
          activeRackCode={activeRackCode}
          dimmedTone={filter}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
