import { redirect } from "next/navigation";

// Backward-compatible redirect: the Production page moved to /sap-outward.
export default function ProductionRedirect() {
  redirect("/sap-outward");
}
