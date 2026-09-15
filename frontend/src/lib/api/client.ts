import { publicEnv } from "@/config/env";
import { ApiError, NetworkError, type ApiErrorBody } from "./errors";
import { parseServerTiming, recordSample } from "@/lib/perf";

/**
 * Central typed API client. One place for:
 *  - base URL resolution (browser -> Nginx; server -> internal service DNS)
 *  - auth header injection
 *  - request IDs
 *  - timeout + abort
 *  - bounded retry for idempotent verbs
 *  - single refresh-and-retry on 401 (browser only)
 *  - per-request timing sample (browser only) for lib/perf.ts — total wall time
 *    plus the server's own `Server-Timing: app;dur=` so network vs server cost
 *    is visible (docs/10 §7)
 *
 * Business logic never talks to fetch directly — it calls feature `api.ts` modules
 * which call this client.
 */

export interface RequestOptions extends Omit<RequestInit, "body"> {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** ms; default 15000 */
  timeoutMs?: number;
  /** retry idempotent requests on network/5xx; default 2 for GET */
  retries?: number;
  /** bearer token override (server-side rendering passes it explicitly) */
  accessToken?: string;
  signal?: AbortSignal;
}

const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS"]);

function baseUrl(): string {
  if (typeof window === "undefined") {
    // Server Component / route handler: hit the API service directly.
    return process.env.API_INTERNAL_BASE_URL ?? "http://backend:8000/api/v1";
  }
  return publicEnv.NEXT_PUBLIC_API_BASE_URL;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(
    path.startsWith("http") ? path : `${baseUrl()}${path}`,
    typeof window === "undefined" ? undefined : window.location.origin,
  );
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function requestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = { error: { code: "http_error", message: res.statusText, status: res.status } };
  }
  return new ApiError(body, res.status);
}

export type TokenProvider = {
  get(): string | null;
  set(token: string | null): void;
  refresh(): Promise<string | null>;
};

let tokenProvider: TokenProvider | null = null;
export function configureTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

async function raw<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  const {
    query,
    body,
    timeoutMs = 15_000,
    retries = IDEMPOTENT.has(method) ? 2 : 0,
    accessToken,
    headers,
    signal,
    ...rest
  } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  const token = accessToken ?? tokenProvider?.get() ?? null;

  const init: RequestInit = {
    ...rest,
    method,
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      "X-Request-ID": requestId(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // send refresh cookie on same-origin browser requests
    credentials: typeof window === "undefined" ? "omit" : "include",
  };

  let attempt = 0;
  const browser = typeof window !== "undefined";
  const sample = (res: Response | null, startedAt: number) => {
    if (!browser) return;
    recordSample({
      path,
      method,
      status: res?.status ?? null,
      total_ms: performance.now() - startedAt,
      server_ms: res ? parseServerTiming(res.headers.get("server-timing")) : null,
      at: Date.now(),
    });
  };
  try {
    for (;;) {
      let res: Response;
      const startedAt = browser ? performance.now() : 0;
      try {
        res = await fetch(buildUrl(path, query), init);
      } catch (err) {
        if (controller.signal.aborted) throw err;
        sample(null, startedAt);
        if (attempt++ < retries) {
          await backoff(attempt);
          continue;
        }
        throw new NetworkError(err);
      }

      if (res.status === 401 && tokenProvider && typeof window !== "undefined" && !opts.accessToken) {
        const refreshed = await tokenProvider.refresh();
        if (refreshed) {
          (init.headers as Record<string, string>).Authorization = `Bearer ${refreshed}`;
          const retryRes = await fetch(buildUrl(path, query), init);
          if (!retryRes.ok) throw await parseError(retryRes);
          return decode<T>(retryRes);
        }
      }

      if (!res.ok) {
        sample(res, startedAt);
        if (res.status >= 500 && attempt++ < retries) {
          await backoff(attempt);
          continue;
        }
        throw await parseError(res);
      }
      const decoded = await decode<T>(res);
      sample(res, startedAt);
      return decoded;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function decode<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 4000) + Math.random() * 200;
  return new Promise((r) => setTimeout(r, ms));
}

export const api = {
  get: <T>(path: string, opts: RequestOptions = {}) => raw<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    raw<T>("POST", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    raw<T>("PATCH", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    raw<T>("PUT", path, { ...opts, body }),
  delete: <T>(path: string, opts: RequestOptions = {}) => raw<T>("DELETE", path, opts),
};
