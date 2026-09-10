"use client";

import { Boxes, Layers, PackageOpen, Warehouse } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RackSummary, Topology } from "../types";
import { AisleMap } from "./AisleMap";
import { num, pct } from "./trayStyles";

/**
 * The landing view: the whole physical structure the backend knows about, one
 * aisle map per aisle. Answers "how many aisles, how many racks, how many
 * shelves each" without opening anything.
 */
export function RackOverview({
  topology,
  activeRackCode,
  onOpen,
}: {
  topology: Topology;
  activeRackCode?: string | undefined;
  onOpen: (rack: RackSummary) => void;
}) {
  if (topology.warehouses.length === 0) {
    return (
      <EmptyState
        icon={<Warehouse />}
        title="No racks registered yet"
        description="Add a rack to the topology master and its shelves, rows and trays will appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-5">
      {topology.warehouses.map((warehouse) => (
        <section key={warehouse.warehouse_code} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Warehouse className="size-4 text-text-muted" />
              <h2 className="text-sm font-semibold">
                {warehouse.warehouse_name ?? warehouse.warehouse_code}
              </h2>
              <span className="text-xs text-text-muted">
                {warehouse.warehouse_code}
              </span>
            </div>
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs tabular-nums">
              <Metric icon={<Layers />} label="Aisles" value={num(warehouse.aisle_count)} />
              <Metric icon={<Boxes />} label="Racks" value={num(warehouse.rack_count)} />
              <Metric
                icon={<PackageOpen />}
                label="Empty trays"
                value={`${num(warehouse.occupancy.empty)} of ${num(warehouse.occupancy.capacity)}`}
                hint={pct(warehouse.occupancy.availability_pct)}
              />
            </dl>
          </div>

          {warehouse.aisles.map((aisle) => (
            <AisleMap
              key={aisle.aisle_code}
              aisle={aisle}
              activeRackCode={activeRackCode}
              onOpen={onOpen}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted [&>svg]:size-3.5">{icon}</span>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium">
        {value}
        {hint ? <span className="ml-1 text-text-muted">({hint})</span> : null}
      </dd>
    </div>
  );
}
