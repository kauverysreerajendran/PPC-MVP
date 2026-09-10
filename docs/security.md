# Security

## Authentication

- **Password hashing**: Argon2id (`argon2-cffi`) with sane memory/time cost. Legacy bcrypt
  verification path kept for migration.
- **Access token**: JWT (HS256 dev / RS256 prod-ready), `exp` ~15 min, claims `sub`, `role`,
  `jti`, `type=access`. Verified statelessly on every request.
- **Refresh token**: opaque 256-bit random string. Only its SHA-256 hash is stored
  (`refresh_tokens` table) with `family_id`, `expires_at`, `used_at`, `revoked_at`.
  - On `/auth/refresh`: token must exist, be unexpired, unused, unrevoked. It is marked `used`
    and a **new** token in the **same family** is issued (rotation).
  - **Reuse detection**: presenting an already-used/revoked token revokes the entire family and
    returns 401 `token_reused`.
- **Cookie strategy**: refresh token in `Set-Cookie: refresh_token=...; HttpOnly; Secure;
  SameSite=Strict; Path=/api/v1/auth`. Access token returned in the JSON body and held in memory
  by the frontend (never in `localStorage`).
- **CSRF**: refresh cookie is `SameSite=Strict` and scoped to the auth path; state-changing APIs
  use the `Authorization` header (not cookies), so they are not CSRF-exploitable. A
  double-submit CSRF token is available for any future cookie-authed endpoint.

## Authorization / RBAC

- `users.role` enum: `owner`, `admin`, `member`, `viewer` (+ per-resource membership table for
  fine-grained project roles).
- `require_role(*roles)` and `require_permission("project:write")` FastAPI dependencies.
- Permission matrix in `app/core/rbac.py`; services re-check authorization (defense in depth),
  never trust the router alone.

## Brute-force / abuse protection

- Login: Redis counter per `(email, ip)`; exponential lockout after 5 failures; generic error
  message (no user enumeration).
- Global rate limit: token bucket per API key / IP in Redis (`app/middleware/rate_limit.py`).
- Nginx: `limit_conn` + `limit_req` as a coarse outer guard.

## Transport / headers

Set by Nginx **and** asserted by FastAPI middleware:
`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`. HTTP redirects to HTTPS.

## Input / output safety

- All input validated by Pydantic schemas; unknown fields rejected (`extra="forbid"`).
- SQL exclusively through SQLAlchemy parameterized queries / bound params — no string SQL.
- XSS: React escapes by default; `dangerouslySetInnerHTML` is banned by lint rule; API returns
  JSON only.
- Response size + upload limits enforced at Nginx and FastAPI.

## Secrets

- Never in Git. `.env` is git-ignored; only `.env.example` is committed.
- Local: `.env`. Staging/prod: injected from the platform secret store (AWS Secrets Manager /
  GCP Secret Manager / Azure Key Vault / K8s Secrets sourced from those).
- GitHub Actions uses environment-scoped secrets + OIDC to the cloud (no long-lived cloud keys).
- `Settings.validate_production()` aborts boot if any secret is still a default placeholder.

## Auditing

Security-relevant events (login, logout, refresh, role change, password reset, admin actions)
are written to `audit_log` with actor, IP, request ID, and a redacted diff.

## Production error sanitization

Global exception handler returns the generic error schema; stack traces go to logs + Sentry
only. `DEBUG=false` in every non-local environment (asserted at startup).

## Dependency scanning

- Python: `pip-audit` in CI.
- Node: `npm audit --audit-level=high` in CI.
- Images: Trivy scan on build; fail on HIGH/CRITICAL with no fix pending.
- Dependabot weekly PRs.
