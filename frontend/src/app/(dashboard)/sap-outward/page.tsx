import type { Metadata } from "next";
import { SapUploadView } from "@/features/sap/components/SapUploadView";

export const metadata: Metadata = { title: "SAP Outward" };

export default function SapOutwardPage() {
  return <SapUploadView />;
}
