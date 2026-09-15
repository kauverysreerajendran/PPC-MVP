import { redirect } from "next/navigation";

// Backward-compatible redirect: the SAP Outward page moved to /sap-outward.
export default function SapUploadRedirect() {
  redirect("/sap-outward");
}
