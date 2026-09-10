# Admin panel (`/admin`)

A Django-Admin-equivalent, browser-based database administration UI built with
[SQLAdmin](https://aminalaee.dev/sqladmin/). It runs **inside the existing FastAPI
process** — no separate frontend, no separate service.

```
Next.js
  ↓
FastAPI
  ├── /api/v1/*   application APIs
  └── /admin      SQLAdmin UI  ──► SQLAlchemy ──► PostgreSQL
```

- URL (direct): `http://localhost:8000/admin`
- URL (through Nginx): `http://localhost/admin`

## What you get

For every registered model: list view with **search, column filters, sortable
columns, server-side pagination** (25/50/100/200 per page), detail view, create /
edit / delete forms, foreign-key links and searchable FK pickers, CSV/JSON export.
All actions are plain SQLAlchemy ORM operations — **there is no raw-SQL surface.**

## Registered views

| Menu | Model | Notes |
|------|-------|-------|
| Users | `app.models.user.User` | search email/name; filter by role, admin role, active, verified. `hashed_password` never shown. |
| Sessions (Refresh Tokens) | `app.models.refresh_token.RefreshToken` | read-only + delete (revoke). `token_hash` never shown. |
| Projects | `app.models.project.Project` | FK to owner with ajax picker; filter by status and owner email. |
| Audit Logs | `app.models.audit.AuditLog` | **immutable for everyone** — browse/filter/export only. |

> The brief's example menu (Roles, Permissions, Products, Orders, Categories) maps
> onto this codebase as documented in `backend/app/admin/views/__init__.py`:
> roles/permissions are an enum + the `app.core.rbac` matrix (surfaced on the Users
> view); products/orders/categories are domain tables this starter doesn't have
> yet — add the model, add a `*Admin` view, append it to `ADMIN_VIEWS`.

## Layout

```
backend/app/admin/
├── __init__.py          init_admin(app)  — called from app.main
├── config.py            builds the SQLAdmin Admin instance, registers views
├── authentication.py    AdminAuth backend (session cookie, reuses user table)
├── permissions.py       AdminRole enum + BaseAdminView (RBAC enforcement)
├── create_superuser.py  python -m app.admin.create_superuser
└── views/
    ├── users.py
    ├── projects.py
    ├── sessions.py
    └── audit_logs.py
```

## Authentication & roles

`/admin` is not reachable without logging in — unauthenticated requests to any
admin page 302 to `/admin/login`. Login verifies the email + Argon2 password
against the **existing `users` table** and requires a non-null `admin_role`.

| `admin_role` | Capabilities |
|--------------|--------------|
| `super_admin` | everything, incl. setting `admin_role` / app `role`, deleting user rows |
| `admin` | create / edit / delete operational data; **cannot** change `admin_role`/`role` or delete users |
| `read_only_admin` | browse, search, filter, sort, open records — **no writes at all** |

Enforcement is centralised in `BaseAdminView` (`check_can_create/edit/delete`,
`is_accessible`, and a `_sanitize()` hook that strips super-user-only fields from
non-super-user form submissions). Revoking someone's `admin_role` takes effect on
their **next request** (the auth backend re-checks the DB each time).

### Protected fields

`hashed_password` and `token_hash` are excluded from every list, detail, form and
export. If you add columns like `api_key` / `secret` / `token`, add them to the
relevant view's exclude lists (there's a unit test — `tests/unit/test_admin_safety.py`
— that fails if a known-sensitive name appears in any admin surface).

## Create the first superuser

Credentials are never hardcoded.

```bash
# interactive (password via getpass, entered twice)
make superuser
#   docker compose exec backend python -m app.admin.create_superuser

# non-interactive (CI / first deploy) — vars consumed, not stored
docker compose exec -e ADMIN_EMAIL=you@corp.com -e ADMIN_PASSWORD='…' \
  backend python -m app.admin.create_superuser

# grant a lesser tier / reset an existing user's password
python -m app.admin.create_superuser --role read_only_admin
python -m app.admin.create_superuser --reset-password
```

Running again for an existing email **promotes** that user.

## Production notes

- Works unchanged with the existing Docker / Postgres / Redis / Nginx / gunicorn
  setup — it's the same ASGI app. `docker-compose.prod.yml` needs nothing added.
- Nginx proxies `/admin` to the backend upstream (see
  `infrastructure/nginx/conf.d/*.conf`). For extra defence in depth, uncomment the
  IP allowlist in `prod.conf`'s `location /admin` block.
- The session cookie is signed with `SECRET_KEY` and (in staging/production, where
  `ENVIRONMENT` is production-like) marked `Secure`; TLS is terminated at Nginx.
- Pagination/filtering/search are server-side and hit indexed columns
  (`users.email` via the functional unique index, `projects.owner_id`,
  `audit_log.entity/created_at`, etc. — see `docs/database.md`).

## Migration

The panel adds one nullable column:

```bash
make migrate    # applies alembic 0002_add_user_admin_role
```
