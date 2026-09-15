# Engineering Guardrails

Applies to all full stack projects. Stack assumed: React / Next.js on the frontend, Django or FastAPI on the backend, PostgreSQL as the primary datastore, Redis for cache and queues.

## 1. Purpose

This document defines the rules that are not open to per developer preference. Everything listed here is enforced at pull request review. A change that violates a guardrail is rejected regardless of whether it works.

## 2. Document set

| File | Covers | Owner |
|---|---|---|
| `01-frontend-architecture.md` | Folder structure, layering, state, routing, component rules | Frontend lead |
| `02-backend-architecture.md` | API layering, services, transactions, response contract | Backend lead |
| `03-security-and-vulnerability-checklist.md` | OWASP checks, scanning, release gate | Tech lead |
| `04-authorization-and-url-protection.md` | Object level access control, route guards, ID exposure | Tech lead |
| `05-code-optimization.md` | Performance rules and budgets, both tiers | Tech lead |
| `06-database-optimization.md` | Indexing, query patterns, migrations, monitoring | Backend lead |
| `07-error-handling-standards.md` | Where a defect gets fixed, error contract, logging | Tech lead |
| `08-ui-input-and-interaction-standards.md` | Loading states, alerts, input rules, sanitization | Frontend lead |
| `09-redis-caching.md` | What to cache, keys, TTL, invalidation, failure mode | Backend lead |
| `10-infrastructure-and-load-balancing.md` | Environments, scaling, deployment, health checks | DevOps owner |

## 3. Non negotiable rules

| # | Rule | Why |
|---|---|---|
| 1 | No business logic in a React component or a Django view. Logic lives in a service or hook | Testability, reuse |
| 2 | No raw SQL string concatenation with user input anywhere | SQL injection |
| 3 | Every API endpoint declares authentication and authorization explicitly. There is no default open endpoint | Broken access control is the most common production breach |
| 4 | Every list endpoint is paginated. No unbounded queryset is returned | Memory and response time blowups |
| 5 | Every mutating endpoint validates the payload against a schema or serializer before touching the database | Data integrity |
| 6 | Secrets never enter the repository. Environment variables only, with a committed `.env.example` | Credential leakage |
| 7 | A backend defect is fixed in the backend. Frontend workarounds for backend bugs are rejected | See `07-error-handling-standards.md` |
| 8 | Every database migration is reviewed for lock behaviour before it reaches production | Downtime |
| 9 | The application must continue serving traffic when Redis is unavailable | Cache is an optimization, not a dependency |
| 10 | No console logging of user data, tokens, or payloads in production builds | Privacy and compliance |

## 4. Pull request gate

A pull request is not merged until all of the following are true.

1. Branch naming follows `feature/<ticket-id>-short-name`, `bugfix/<ticket-id>-short-name`, or `hotfix/<ticket-id>-short-name`.
2. The linked ticket ID is present in the PR title.
3. Linting and formatting pass with zero warnings introduced.
4. Unit tests for changed logic exist and pass.
5. No new dependency is added without justification in the PR description.
6. Documentation affected by the change is updated in the same PR.
7. At least one reviewer other than the author has approved.
8. Screenshots or a short recording are attached for any UI change.

## 5. Definition of done

A ticket is closed only when the code is merged, deployed to the staging environment, verified against the acceptance criteria, and the relevant documentation is current. Code merged but not verified is not done.

## 6. Exceptions

An exception to any guardrail requires a written entry in `docs/adr/` stating the context, the rule being broken, the reason, the expiry date, and the person accountable. Undocumented exceptions are treated as defects.
