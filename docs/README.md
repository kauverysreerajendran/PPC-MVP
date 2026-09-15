# Engineering Standards

Reference documentation set for full stack projects. Copy the folder into `docs/standards/` in the repository and adjust the values marked as project specific.

## Contents

| File | Covers |
|---|---|
| `00-engineering-guardrails.md` | Non negotiable rules, PR gate, definition of done, exception process |
| `01-frontend-architecture.md` | Folder structure, layering, state management, routing, performance budgets |
| `02-backend-architecture.md` | Service layering, API contract, status codes, transactions, logging, jobs |
| `03-security-and-vulnerability-checklist.md` | Authentication, input handling, headers, scanning tools, release gate |
| `04-authorization-and-url-protection.md` | Object level access control, tenant scoping, destructive action controls |
| `05-code-optimization.md` | Performance budgets, backend and frontend optimization rules, review checklist |
| `06-database-optimization.md` | Schema rules, indexing, query patterns, migration safety, operations |
| `07-error-handling-standards.md` | Where a defect is fixed, error contract, frontend handling by status code |
| `08-ui-input-and-interaction-standards.md` | Loading states, alerts, input validation rules, forms, tables |
| `09-redis-caching.md` | What to cache, key naming, TTL, invalidation, failure mode |
| `10-infrastructure-and-load-balancing.md` | Environments, scaling requirements, deployment, monitoring, backups |

## How to adopt

1. Review the numbered rules with the team and remove anything the project genuinely does not need. A standard nobody agrees with is not followed.
2. Fill in project specific values: performance budgets, page sizes, TTLs, retention periods, alert thresholds.
3. Add the pull request checklist from `00-engineering-guardrails.md` to the PR template.
4. Review the set once per quarter. Remove rules that are consistently ignored and either enforce them or drop them.

## Values that must be set per project

| Item | Document |
|---|---|
| API response budgets | 05 |
| Bundle size budget | 01, 05 |
| Default and maximum page size | 02, 08 |
| Cache TTL per data type | 09 |
| Data retention per table | 06 |
| RPO and RTO | 10 |
| Alert thresholds and on call owner | 10 |
