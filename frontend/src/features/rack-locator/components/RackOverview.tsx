"use client";

import dynamic from "next/dynamic";
import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OccupancyTone } from "./trayStyles";
import type { RackSummary, WarehouseSummary } from "../types";
import { AisleMap } from "./AisleMap";
import { ViewModeToggle } from "./three/ViewModeToggle";
import { useLocatorViewMode } from "./three/sceneKit";

// The rack pictures are drawn with three.js, which is heavy and browser-only —
// load the gallery after the page.
const RackGallery = dynamic(() => import("./RackGallery").then((m) => m.RackGallery), {
  ssr: false,
  loading: () => (
    <div className="h-[clamp(380px,56vh,560px)] animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
  ),
});

/**
 * The landing view for one warehouse: by default a gallery of 3D rack
 * pictures (`RackGallery`, one framed card per rack — it scales to any number
 * of racks), or on the Grid toggle every aisle drawn as a floor plan of colour
 * tiles.
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
  showToggle = true,
}: {
  warehouse: WarehouseSummary;
  activeRackCode?: string | undefined;
  filter: OccupancyTone | null;
  onOpen: (rack: RackSummary) => void;
  /** off when the page carries the 3D / Grid tabs in its own toolbar */
  showToggle?: boolean;
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
    <OverviewBody
      warehouse={warehouse}
      activeRackCode={activeRackCode}
      filter={filter}
      onOpen={onOpen}
      showToggle={showToggle}
    />
  );
}

function OverviewBody({
  warehouse,
  activeRackCode,
  filter,
  onOpen,
  showToggle = true,
}: {
  warehouse: WarehouseSummary;
  activeRackCode?: string | undefined;
  filter: OccupancyTone | null;
  onOpen: (rack: RackSummary) => void;
  /** off when the page carries the 3D / Grid tabs in its own toolbar */
  showToggle?: boolean;
}) {
  const mode = useLocatorViewMode();
  // the 3D view is a gallery of rack pictures; it falls back to flat drawings
  // by itself when WebGL is missing, so it needs no guard here
  const gallery = mode === "3d";

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      {showToggle ? <ViewModeToggle mode={mode} variant="tabs" /> : null}
      {gallery ? (
        <RackGallery warehouse={warehouse} activeRackCode={activeRackCode} filter={filter} onOpen={onOpen} />
      ) : (
        warehouse.aisles.map((aisle) => (
          <AisleMap
            key={aisle.aisle_code}
            aisle={aisle}
            activeRackCode={activeRackCode}
            dimmedTone={filter}
            onOpen={onOpen}
          />
        ))
      )}
    </div>
  );
}
