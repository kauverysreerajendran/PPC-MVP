import { api, type RequestOptions } from "@/lib/api/client";
import type { StatusStage } from "@/features/status/types";
import type { StatusRefs } from "./types";

/**
 * Read-only view of the Status microservice used by the Overview flow. The
 * gateway path `/status` is rewritten to the service by `next.config.ts`, the
 * same as `features/status/api.ts` — counts are never computed in the browser.
 */
export const opsFlowApi = {
  refs: (stage: StatusStage, code: string, opts: RequestOptions = {}) =>
    api.get<StatusRefs>("/status/refs", { ...opts, query: { stage, code } }),
};
