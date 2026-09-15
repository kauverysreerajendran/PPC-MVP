# Performance standards audit — 2026-09-13

Scope: "the whole application responds slowly on every click". Audited against
`docs/00`–`10` using the repository files as the only source of truth. Evidence
is `file:line` as found at audit time. Status **before** the fixes in this
change set, and **after** where the fix is applied in code. Items that need the
running system (measurements, EXPLAIN, `pg_stat_*`) are marked *to measure* and
listed under "Left for the running system".

## A. Audit table

| Rule | Where checked | Before | Evidence | Fix (Part B step) | After |
|---|---|---|---|---|---|
| docs/05 §1 measure before changing | this review | FAIL | no baseline recorded in repo | step 0 — baseline must be taken on the dev machine (see §C) | *to measure* |
| docs/05 §2 simple read < 200 ms; queries/request < 10 | services | *to measure* | `Server-Timing` was absent, so it could not be seen | step 7 adds `Server-Timing` to every service | *to measure* |
| docs/05 §3.1 no N+1, query count asserted | `services/masterdata/app/api.py`, `crud.py`, `services/sap-integration/app/repository.py` | PASS (list endpoints are single-query + count) | `crud.py` `list()`; `repository.py` `list_records()` | — | PASS |
| docs/05 §3.7 connection pooling | `backend/app/db/session.py:334-343`, `services/*/app/db.py` | PASS | `pool_size`, `max_overflow`, `pool_pre_ping`, `pool_recycle` set | — | PASS |
| docs/05 §4.4 dedupe / one call per data need | `frontend/src/features/*/hooks.ts` | FAIL | every list hook `refetchInterval: 5_000, staleTime: 2_000` (`masterdata/hooks.ts:18-20`, `sap/hooks.ts:18-20`, `sap-inward/hooks.ts:28-30`, `rack/hooks.ts:16-18`, `status/hooks.ts:35-37`, `rack-locator/hooks.ts` ×4 at 8 s) | step 1 | PASS — one helper `lib/polling.ts`; lookups no longer poll |
| docs/05 §4.10 / docs/01 §7 no sequential dependent calls on mount | `SapUploadView.tsx`, `SapInwardView.tsx`, `RackLocatorView.tsx` | PARTIAL | calls are parallel, but 6 queries on SAP Outward of which 4 polled | step 1 reduces to 1–2 polled queries per screen | PARTIAL (aggregation endpoint not in scope) |
| docs/05 §4.5 images modern format, explicit dimensions | `frontend/src/app/(auth)/login/page.tsx:4`, `src/assets/images/` | FAIL | login imported `14.png` (1.7 MB); `1,2,4–9.png` ≈ 14 MB in `assets/images` | step 3 | PASS for login (`3.webp`, 105 KB, same 1536×1024); unused PNGs reported, not deleted (see §C) |
| docs/01 §7 initial bundle < 250 KB gz | `npm run build` | *to measure* | build not run here | step 0 | *to measure* |
| docs/09 §1 / guardrails §3.9 fast when Redis unavailable | `backend/app/middleware/rate_limit.py:60-83`, `backend/app/infra/redis.py:28-45` | PARTIAL | fail-open exists; breaker re-probes every 20 s → one 0.5 s stall per 20 s when Redis is down | step 4 | PASS — cooldown 120 s |
| docs/09 §2 / §4 master data cacheable, TTL 1–24 h | `frontend/src/features/masterdata/hooks.ts:18-20` | FAIL | vendors/boxes/models re-fetched every 5 s | step 1 | PASS — `LOOKUP_STALE_MS` 5 min, invalidated on own mutations |
| docs/09 §8.1 don't refetch what hasn't changed | `providers.tsx:19` + all hooks | FAIL | global `refetchOnWindowFocus: true` + 5 s timers | step 1 | PASS — focus refetch opt-in per transactional query |
| docs/02 §4.3 `total` only when needed | `crud.py` `list()`, `repository.py` | FAIL | `COUNT(*)` over a subquery on every list call, including 200-row lookup fetches | step 5 | PASS — `with_total=false` for lookup fetches; direct count otherwise |
| docs/06 §3 `LIKE '%term%'` needs trigram / FTS | `api.py` `searchable=` (8–13 columns), `repository.py` `_SEARCHABLE` | FAIL | `ILIKE` across all searchable columns, no `pg_trgm` index; `01-extensions.sql` does not enable `pg_trgm` | step 5 — **deferred**: needs `EXPLAIN` on real data and a migration run on the dev DB (see §C) | FAIL (open) |
| docs/06 §2.6 remove unused indexes | `services/masterdata/app/models.py:250-281` (13 single-column indexes on `sap_outwards`), `services/rack/app/models.py:184-191` (8 on `rack`) | FAIL | index piles; no `pg_stat_user_indexes` review | step 5 — **deferred** (report only) | FAIL (open) |
| docs/06 §4.1–4.2 `pg_stat_statements`, slow log 500 ms | `infrastructure/postgres/init/01-extensions.sql` | PARTIAL | extension created; `log_min_duration_statement` not set | not in scope | PARTIAL |
| docs/10 §4.1 `/healthz` cheap, `/readyz` checks | `services/masterdata/app/main.py:54-63`, `rack/app/main.py:78-87`, `status/app/main.py:53-62`, `sap-integration/app/main.py:49-51` | FAIL | `/healthz` ran `SELECT 1` in 3 of 4 services; probed every 10 s by compose | step 6 | PASS — `/healthz` no DB; `/readyz` + `/api/v1/<svc>/health` do the DB check |
| docs/10 §7 request timing observable | services (no timing), monolith `middleware/request_context.py` (log only) | FAIL | no `Server-Timing`; nothing visible in the browser | step 7 | PASS — `Server-Timing: app;dur=` on all five backends; `window.__ppcPerf` in dev; `LiveIndicator` "SLOW NETWORK" |
| docs/08 §1 background refresh must not blank; no work in hot loops | `components/shell/RouteProgress.tsx:72-100`, `components/BootLoader.tsx:26-32` | FAIL | `MutationObserver` on `document.body` with `subtree: true` + `querySelector` per added node, forever; boot overlay waits for `window.load` | steps 2, 3 | PASS — observer on `<body>` children only; overlay dismissed on `DOMContentLoaded` |
| docs/08 §3 search debounced 300 ms | `SapUploadView.tsx:236`, `SapInwardView.tsx:295` | FAIL | 180 ms | step 8 | PASS |
| guardrails §3.4 every list paginated | lookups `page_size: 200` (server cap `le=200`), `rack/app/masterdata_client.py` pages ×25 | PASS (bounded) | server enforces `le=200` | — | PASS |
| docs/09 §2 permissions cacheable 5–15 min | `backend/app/api/dependencies/auth.py:26-35` | PARTIAL | one PK lookup per request; `users/service.py` already invalidates `cache.key("user", id)` | step 4 user cache — **deferred**: `cache.get_or_set` returns JSON, the dependency must return an ORM `User`; changing that touches auth (out of the "do not change auth flow" boundary) | PARTIAL (open) |
| dev-mode cost (not a standard) | `frontend/package.json` `next dev --turbopack`, `next.config.ts` rewrites to 5 targets | n/a | first visit compiles each route; all API traffic proxied by the dev server | step 0 separates it | n/a |

## B. What changed (files)

Frontend (`frontend/src`):
- `lib/polling.ts` (new) — single source of polling intervals; network-aware back-off; shared query options.
- `lib/perf.ts` (new) — request timing ring buffer, `Server-Timing` parser, `window.__ppcPerf` (dev).
- `lib/api/client.ts` — records one timing sample per request (browser only). No change to retries, 401→refresh, headers.
- `features/masterdata/hooks.ts` — lookups: no polling, 5 min stale, `with_total=false` on lookup fetches; `sap-outwards` stays polled. Query keys unchanged.
- `features/sap/hooks.ts`, `features/sap-inward/hooks.ts`, `features/rack/hooks.ts`, `features/rack-locator/hooks.ts`, `features/status/hooks.ts` — transactional lists use the shared interval (30 s, stale 15 s, refetch on focus). Invalidations unchanged.
- `app/providers.tsx` — global `refetchOnWindowFocus: false` (opt-in per query).
- `components/shell/RouteProgress.tsx` — boot-overlay observer watches `<body>` children only; overlay dismissed on `DOMContentLoaded`.
- `components/BootLoader.tsx` — inline script dismisses on `DOMContentLoaded` (20 s safety kept).
- `components/shell/LiveIndicator.tsx` — new `slow` state from measured timings.
- `app/(auth)/login/page.tsx` — imports `assets/images/3.webp` (added, 105 KB; `14.png` kept as source).
- `features/sap/components/SapUploadView.tsx`, `features/sap-inward/components/SapInwardView.tsx` — search debounce 180 → 300 ms only.

Backend (`backend/app`):
- `middleware/request_context.py` — adds `Server-Timing: app;dur=`.
- `infra/redis.py` — breaker cooldown 20 s → 120 s.

Services:
- `services/{masterdata,rack,sap-integration,status}/app/timing.py` (new) — `ServerTimingMiddleware`.
- `services/{masterdata,rack,sap-integration,status}/app/main.py` — middleware installed; `/healthz` liveness only; `/readyz` (+ `/api/v1/<svc>/health`) does the DB check. Compose healthchecks keep probing `/healthz` (now cheap).
- `services/masterdata/app/crud.py` — direct `COUNT(*)` with the same predicates; `with_total` flag.
- `services/masterdata/app/api.py` — `with_total` query param (default `true`, behaviour unchanged for existing callers).
- `services/sap-integration/app/repository.py` — direct `COUNT(*)`, no subquery.

## C. Left for the running system (cannot be done from files alone)

1. **Baseline and after-measurement (docs/05 §1)** — on the dev machine: `npm run build && npm run start`, then `npm run dev`; record click-to-painted for Dashboard → SAP Outward → SAP Inward → Rack Locator → Master Data, idle requests/minute on SAP Outward (expected to drop from ~50/min to ≤ 4/min), and TTFB of the slowest call per page. The `Server-Timing` column in the Network tab now shows server time per request.
2. **`pg_trgm` indexes (docs/06 §3)** — run `EXPLAIN (ANALYZE, BUFFERS)` on the SAP records search and the `sap-outwards` search with real data first; if sequential scans dominate, add `CREATE EXTENSION pg_trgm` + GIN trigram indexes on `dc_no, po_no, model_no, vendor_name/vendor_code, batch_no, box_uid` as `CREATE INDEX CONCURRENTLY` Alembic revisions in the owning service. Not written blind — a wrong index on a populated table is a lock risk (guardrails §3.8).
3. **Unused indexes (docs/06 §2.6)** — `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0` after a day of use; report before dropping anything.
4. **Redis reachability** — with the active `.env`: `redis-cli -u "$REDIS_URL" ping`. If Redis is not running natively, set `REDIS_ENABLED=false` for local dev; the limiter and cache then skip Redis entirely (`backend/app/infra/redis.py` `redis_available()`).
5. **Unreferenced artwork** — `frontend/src/assets/images/1,2,4,5,6,7,8,9.png` (~14 MB) are not imported anywhere under `src/` at audit time (`grep -rn "assets/images" frontend/src` → only `logo.png` and `3.webp`). Confirm and delete manually; not deleted here.
6. **`/auth/me` user cache** — open; see table row. Safe option if wanted later: cache a small `{id, role, is_active}` DTO and build the dependency around it, which is an auth-flow change and needs its own approval.
7. **Lint / typecheck / pytest** — run `npm run lint && npm run typecheck` in `frontend/` and `pytest` in `backend/` and each service. Edited TypeScript was syntax-checked here; Python files were byte-compiled here; full type resolution needs `node_modules` on the dev machine.
