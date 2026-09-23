import type { SapOutward } from "@/features/masterdata/types";
import type { LineStatus, StatusStage, StatusToneName } from "@/features/status/types";
import { INWARD_LABEL } from "@/features/sap-inward/utils/format";

/**
 * Dispatched → Received → Verified → Placed for one SAP line, read from the
 * Status service's current status per stage. Received and Verified share the
 * `inward` stage, so Received takes its time from the line's last receiving
 * scan once the line has moved on to Verified.
 */

export type StepKey = "dispatched" | "received" | "verified" | "placed";
/**
 * `skipped`: a later stage was reached without this one — a line can be placed
 * before it is verified — so it is shown as not done, never as a tick.
 */
export type StepState = "done" | "current" | "skipped" | "upcoming";

export interface TimelineStep {
  key: StepKey;
  title: string;
  state: StepState;
  /** the status label for this step (what the badge says) */
  label: string;
  tone: StatusToneName;
  /** ISO time the step was reached, when known */
  at: string | null;
  /** reached only in part — placement started, not finished */
  partial: boolean;
}

/** Rack statuses meaning placement has started and not finished. */
export const RACK_IN_PROGRESS = new Set(["IN_PROGRESS", "DRAFT", "PARTIALLY_PLACED"]);

type Statuses = Partial<Record<StatusStage, LineStatus>>;

export function buildTimeline(statuses: Statuses, outward: SapOutward | null): TimelineStep[] {
  const out = statuses.outward;
  const inward = statuses.inward;
  const rack = statuses.rack;

  const dispatched =
    (out ? out.code === "DISPATCHED" || out.code === "RECEIVED" : false) ||
    (!!outward?.box_uid && outward.outward_status === "DISPATCHED");
  const receivedLocally = !!outward && (outward.received_pieces > 0 || !!outward.inward_status);
  const received =
    receivedLocally || inward?.code === "YET_TO_VERIFY" || inward?.code === "VERIFIED";
  const verified = inward?.code === "VERIFIED";
  const placed = rack?.code === "PLACED";
  const placing = !!rack && RACK_IN_PROGRESS.has(rack.code);

  const steps: Omit<TimelineStep, "state">[] = [
    {
      key: "dispatched",
      title: "Dispatched",
      label: dispatched ? (out?.code === "DISPATCHED" ? out.label : "Dispatched") : "Not dispatched",
      tone: dispatched ? "success" : "neutral",
      at: dispatched ? (out?.changed_at ?? null) : null,
      partial: false,
    },
    {
      key: "received",
      title: "Received",
      label: received
        ? (INWARD_LABEL[outward?.inward_status ?? ""] ?? "Received")
        : (inward?.code === "NOT_RECEIVED" ? inward.label : "Not received"),
      tone: received ? (outward?.inward_status === "SHORT" ? "danger" : "success") : "neutral",
      at: received
        ? (outward?.inward_last_scan_at ??
          (inward?.code === "YET_TO_VERIFY" ? inward.changed_at : null))
        : null,
      partial: false,
    },
    {
      key: "verified",
      title: "Verified",
      label: verified
        ? inward!.label
        : inward?.code === "YET_TO_VERIFY"
          ? inward.label
          : "Not verified",
      tone: verified ? inward!.tone : inward?.code === "YET_TO_VERIFY" ? inward.tone : "neutral",
      at: verified ? inward!.changed_at : null,
      partial: false,
    },
    {
      key: "placed",
      title: "Placed",
      label: rack && (placed || placing) ? rack.label : "Not placed",
      tone: rack && (placed || placing) ? rack.tone : "neutral",
      at: rack && (placed || placing) ? rack.changed_at : null,
      partial: placing,
    },
  ];

  const reached = [dispatched, received, verified, placed || placing];
  const last = reached.lastIndexOf(true);
  return steps.map((s, i) => ({
    ...s,
    state: i === last ? "current" : i > last ? "upcoming" : reached[i] ? "done" : "skipped",
  }));
}
