import type { StatusTone } from "@/components/ui/StatusBadge";

/** "467.000" -> "467"; keeps up to 3 dp; non-numeric passes through. */
export function fmtNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : String(v);
}

export function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
}

export const INWARD_TONE: Record<string, StatusTone> = {
  PENDING: "neutral",
  PARTIAL: "progress",
  RECEIVED: "success",
  SHORT: "danger",
  OVER: "warning",
};

export const INWARD_LABEL: Record<string, string> = {
  PENDING: "Not started",
  PARTIAL: "Receiving",
  RECEIVED: "Received",
  SHORT: "Short",
  OVER: "Over",
};
