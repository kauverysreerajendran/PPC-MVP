import type { Metadata } from "next";
import { SapInwardView } from "@/features/sap-inward/components/SapInwardView";

export const metadata: Metadata = { title: "SAP Inward" };

export default function SapInwardPage() {
  return <SapInwardView />;
}
