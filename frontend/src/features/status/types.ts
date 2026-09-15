/** Mirrors the Status service contract (`services/status/app/schemas.py`). */

export type StatusStage = "outward" | "inward" | "rack";

export type StatusToneName =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "orange"
  | "danger"
  | "progress";

/** One allowed status of a stage — the master behind every status label. */
export interface StatusDefinition {
  stage: StatusStage;
  code: string;
  label: string;
  tone: StatusToneName;
  sort_order: number;
  is_initial: boolean;
}

/** Current status of one SAP line at one stage. */
export interface LineStatus {
  sap_reference_id: string;
  stage: StatusStage;
  code: string;
  label: string;
  tone: StatusToneName;
  note: string | null;
  actor: string | null;
  source: string | null;
  changed_at: string;
}

/** What a screen shows for a line at a stage (reported, or the stage's initial). */
export interface ResolvedStatus {
  code: string;
  label: string;
  tone: StatusToneName;
  changed_at: string | null;
}
