"""Clear transaction / history data so the application starts fresh.

Masters, the rack layout and users are kept. Everything the operators create
while working is removed, so SAP Outward, SAP Inward and the racks look like
day one and a new SAP sync starts from a clean slate.

    python clearDB.py --dry-run          # show what would change, touch nothing
    python clearDB.py                    # asks you to type CLEAR, then clears
    python clearDB.py --yes              # no prompt (scripts / CI)
    python clearDB.py --include-sessions # also sign every user out

Reads DATABASE_URL from the environment or the repo-root .env. All changes
run in ONE transaction: either everything is cleared or nothing is.
Refuses to run when ENVIRONMENT is staging/production.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# --- what gets cleared ---------------------------------------------------------

#: Emptied completely (TRUNCATE). Order does not matter — one statement.
CLEAR_TABLES: list[tuple[str, str]] = [
    ("sap.sap_inward_record", "SAP feed lines (SAP Outward grid; re-sync to reload)"),
    ("sap.sap_sync_run", "SAP sync history"),
    ("masterdata.sap_outwards", "Outward/inward transactions: box UID, trays, dispatch, receiving"),
    ("public.audit_log", "Audit history"),
    ("status.line_status", "Current status of every line (outward / inward / rack)"),
    ("status.status_event", "Status change history"),
]

#: Only with --include-sessions: logs every user out (users themselves stay).
SESSION_TABLES: list[tuple[str, str]] = [
    ("public.refresh_tokens", "Login sessions"),
]

#: Rack slots are the physical layout (derived from rack.rack_master), so the
#: rows stay — only what is placed in them is reset. "blocked" slots stay blocked.
RACK_RESET_SQL = """
UPDATE rack.rack
   SET slot_state        = CASE WHEN slot_state = 'blocked' THEN 'blocked' ELSE 'empty' END,
       occupied          = false,
       occupied_by_model = NULL,
       date_of_occupied  = NULL,
       qty               = NULL,
       lot_no            = NULL,
       sap_reference_id  = NULL,
       placement_source  = NULL,
       updated_at        = now()
 WHERE occupied
    OR slot_state = 'reserved'
    OR qty IS NOT NULL
    OR lot_no IS NOT NULL
    OR sap_reference_id IS NOT NULL
    OR placement_source IS NOT NULL
"""
RACK_RESET_COUNT_SQL = "SELECT count(*) FROM rack.rack WHERE " + RACK_RESET_SQL.split("WHERE", 1)[1]

#: Never touched — listed so the summary shows what is kept.
KEPT_TABLES: list[str] = [
    "masterdata.master_models",
    "masterdata.plating_colors",
    "masterdata.vendors",
    "masterdata.locations",
    "masterdata.trays",
    "masterdata.boxes",
    "masterdata.outward_status_master",
    "masterdata.movement_type_master",
    "rack.rack_master",
    "rack.rack (slot layout)",
    "status.status_definition",
    "public.users",
    "public.projects",
    "*.alembic_version",
]

PROTECTED_ENVIRONMENTS = {"staging", "production", "prod"}


# --- helpers ---------------------------------------------------------------------


def load_env_file(path: Path) -> None:
    """Minimal .env reader (no dependency): KEY=VALUE, # comments, env wins."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def dsn_from_env() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("DATABASE_URL is not set (environment or repo-root .env).")
    # SQLAlchemy style -> plain libpq style for asyncpg
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def table_exists(conn, qualified: str) -> bool:
    return await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", qualified)


async def count(conn, qualified: str) -> int:
    schema, table = qualified.split(".", 1)
    return await conn.fetchval(f'SELECT count(*) FROM "{schema}"."{table}"')


# --- main ------------------------------------------------------------------------


async def run(args: argparse.Namespace) -> int:
    try:
        import asyncpg  # optional dependency, checked at runtime
    except ImportError:
        print("asyncpg is required: pip install asyncpg (or use backend\\.venv python)")
        return 1

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in PROTECTED_ENVIRONMENTS:
        print(f"Refusing to clear data: ENVIRONMENT={env}.")
        return 1

    dsn = dsn_from_env()
    conn = await asyncpg.connect(dsn)
    try:
        targets = CLEAR_TABLES + (SESSION_TABLES if args.include_sessions else [])
        present = [(t, d) for t, d in targets if await table_exists(conn, t)]
        missing = [t for t, _ in targets if (t, _) not in present]
        rack_present = await table_exists(conn, "rack.rack")

        host = dsn.rsplit("@", 1)[-1]
        print(f"\nDatabase: {host}   ENVIRONMENT={env}\n")
        print("WILL CLEAR")
        for table, desc in present:
            print(f"  {table:<32} {await count(conn, table):>7} rows   {desc}")
        if rack_present:
            n = await conn.fetchval(RACK_RESET_COUNT_SQL)
            print(f"  {'rack.rack (occupancy only)':<32} {n:>7} slots  reset to empty; layout kept")
        for table in missing:
            print(f"  {table:<32} (table not found - skipped)")

        print("\nKEPT")
        for table in KEPT_TABLES:
            print(f"  {table}")
        if not args.include_sessions:
            print("  public.refresh_tokens (users stay signed in; add --include-sessions to clear)")
        print()

        if args.dry_run:
            print("Dry run - nothing changed.")
            return 0

        if not args.yes:
            answer = input("Type CLEAR to delete the transaction data above: ").strip()
            if answer != "CLEAR":
                print("Cancelled - nothing changed.")
                return 1

        async with conn.transaction():
            if present:
                names = ", ".join(
                    '"{}"."{}"'.format(*t.split(".", 1)) for t, _ in present
                )
                await conn.execute(f"TRUNCATE {names} RESTART IDENTITY")
            if rack_present:
                await conn.execute(RACK_RESET_SQL)

        print("Done. Transaction data cleared; masters, rack layout and users kept.")
        print("Run a SAP sync to pull fresh SAP lines.")
        return 0
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="show what would change and exit")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    parser.add_argument(
        "--include-sessions", action="store_true", help="also clear refresh tokens (signs everyone out)"
    )
    args = parser.parse_args()

    load_env_file(Path(__file__).resolve().parent / ".env")
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
