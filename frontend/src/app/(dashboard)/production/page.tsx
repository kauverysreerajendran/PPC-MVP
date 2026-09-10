import { redirect } from "next/navigation";

// Backward-compatible redirect: the Production page moved to /sap-upload.
export default function ProductionRedirect() {
  redirect("/sap-upload");
}
