import type { Metadata } from "next";
import { ScanView } from "@/features/scan/components/ScanView";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return <ScanView />;
}
