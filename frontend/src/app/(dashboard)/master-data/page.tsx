import type { Metadata } from "next";
import { MasterDataView } from "@/features/masterdata/components/MasterDataView";

export const metadata: Metadata = { title: "Master Data" };

export default function MasterDataPage() {
  return <MasterDataView />;
}
