import type { Metadata } from "next";
import { RackView } from "@/features/rack/components/RackView";

export const metadata: Metadata = { title: "Racks" };

export default function RacksPage() {
  return <RackView />;
}
