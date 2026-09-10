import type { Metadata } from "next";
import { RackLocatorView } from "@/features/rack-locator/components/RackLocatorView";

export const metadata: Metadata = { title: "Rack Locator" };

export default function RackLocatorPage() {
  return <RackLocatorView />;
}
