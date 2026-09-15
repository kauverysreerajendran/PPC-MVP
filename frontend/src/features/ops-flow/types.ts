import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, MapPin, PackageOpen, ShieldCheck, Truck } from "lucide-react";

export type StageKey = "outward" | "qc" | "inward" | "verify" | "rack";

export interface StageSpec {
  key: StageKey;
  /** Step heading on the node. */
  title: string;
  /** One line on what happens at this step. */
  detail: string;
  icon: LucideIcon;
  /** Screen that owns this step, so the diagram doubles as a way in. */
  href: string;
}

/**
 * The MVP process, end to end. This is planned workflow — the shape the
 * traceability MVP is being built around — not a report of anything in the
 * database, so it reads the same on an empty system as on a busy one.
 *
 * When the flow should show live numbers instead, each step maps onto the
 * status master (services/status/alembic/versions/0001_initial.py): outward
 * DISPATCHED / RECEIVED, inward NOT_RECEIVED → YET_TO_VERIFY → VERIFIED, rack
 * NOT_PLACED → PARTIALLY_PLACED → PLACED.
 */
export const STAGES: readonly StageSpec[] = [
  {
    key: "outward",
    title: "Stock outward to vendor",
    detail: "Boxes picked against the SAP line and dispatched with a Titan challan.",
    icon: Truck,
    href: "/sap-outward",
  },
  {
    key: "qc",
    title: "QC done",
    detail: "Vendor completes the job and passes quality check on the lot.",
    icon: ShieldCheck,
    href: "/sap-outward",
  },
  {
    key: "inward",
    title: "Stock inward",
    detail: "Consignment comes back and is booked in against the vendor challan.",
    icon: PackageOpen,
    href: "/sap-inward",
  },
  {
    key: "verify",
    title: "Verification",
    detail: "Box UID scanned, quantity and model checked line by line.",
    icon: ClipboardCheck,
    href: "/sap-inward",
  },
  {
    key: "rack",
    title: "Location placement",
    detail: "Verified stock put away into a suggested tray and the slot recorded.",
    icon: MapPin,
    href: "/rack-locator",
  },
];
