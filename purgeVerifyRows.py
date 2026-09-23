"""Remove the DC-VERIFY / PO-VERIFY / M-VERIFY lines a QA run left in the dev DB.

A manual verification run on 2026-09-20 POSTed two outward lines whose SAP
identifiers were placeholders (``VERIFY-<hex>``, ``DC-VERIFY``, ``M-VERIFY``,
no vendor / batch / movement type), scanned them in SAP Inward and short-received
them. Each spawned a ``-S1`` back-order, which correctly inherited the
placeholders from its parent, and the placement step left two rack slots
occupied by model ``M-VERIFY``. The result is a Pending row on SAP Outward's
Main Table reading ``DC-VERIFY / PO-VERIFY / M-VERIFY`` with empty Vendor,
Batch and SAP columns.

Nothing in the four services can produce those identifiers any more — masterdata
now rejects a ``model_no`` that no Models master row matches — so this is a
one-off cleanup of data, not a fix.

    python purgeVerifyRows.py --dry-run   # show what would change, touch nothing
    python purgeVerifyRows.py             # asks you to type PURGE, then deletes
    python purgeVerifyRows.py --yes       # no prompt (scripts / CI)

Every row it is about to touch is written to a timestamped JSON snapshot first
(``--snapshot-dir``, default ``.dev``), so the change can be walked back by hand.
All deletes run in ONE transaction. Reads DATABASE_URL from the environment or
the repo-root .env, and refuses to run when ENVIRONMENT is staging/production.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

# --- what gets purged ------------------------------------------------------------

#: The QA run's outward lines, parents first. Matched by exact reference rather
#: than a LIKE so a real line can never be caught by this script.
VERIFY_REFERENCES: list[str] = [
    "VERIFY-38DF6518",
    "VERIFY-38DF6518-S1",
    "VERIFY-F0264F70",
    "VERIFY-F0264F70-S1",
]

#: Rows keyed by ``sap_reference_id``. No FK joins these to sap_outwards — the
#: services own separate schemas and reference each other by that string — so
#: each table has to be cleared deliberately.
PURGE_BY_REFERENCE: list[tuple[str, str]] = [
    ("masterdata.sap_outwards", "the outward lines themselves"),
    ("status.line_status", "current outward / inward / rack status per line"),
    ("status.status_event", "status change history"),
    ("sap.sap_inward_record", "SAP feed lines (none expected: these never came from a sync)"),
]

#: Rack slots are the physical layout, so the rows stay — only what the QA run
#: placed in them is reset, exactly as clearDB.py resets occupancy. Leaving them
#: occupied would keep M-VERIFY in Rack Locator and block real placement.
RACK_RELEASE_SQL = """
UPDATE rack.rack
   SET slot_state        = CASE WHEN slot_state = 'blocked' THEN 'blocked' ELSE 'empty' END,
       occupied          = false,
       occupied_by_model = NULL,
       date_of_occupied  = NULL,
       qty               = NULL,
       pieces            = NULL,
       lot_no            = NULL,
       sap_reference_id  = NULL,
       placement_source  = NULL,
       updated_at        = now()
 WHERE sap_reference_id = ANY($1::text[])
"""

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


async def rows_for_references(conn, qualified: str) -> list[dict]:
    schema, table = qualified.split(".", 1)
    found = await conn.fetch(
        f'SELECT * FROM "{schema}"."{table}" WHERE sap_reference_id = ANY($1::text[])',
        VERIFY_REFERENCES,
    )
    return [dict(r) for r in found]


def write_snapshot(directory: Path, payload: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    path = directory / f"purge-verify-rows-{stamp}.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


# --- main ------------------------------------------------------------------------


async def run(args: argparse.Namespace) -> int:
    try:
        import asyncpg  # optional dependency, checked at runtime
    except ImportError:
        print("asyncpg is required: pip install asyncpg (or use backend\\.venv python)")
        return 1

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in PROTECTED_ENVIRONMENTS:
        print(f"Refusing to purge data: ENVIRONMENT={env}.")
        return 1

    dsn = dsn_from_env()
    conn = await asyncpg.connect(dsn)
    try:
        host = dsn.rsplit("@", 1)[-1]
        print(f"\nDatabase: {host}   ENVIRONMENT={env}")
        print("References: " + ", ".join(VERIFY_REFERENCES) + "\n")

        snapshot: dict[str, list[dict]] = {}
        print("WILL DELETE")
        for table, desc in PURGE_BY_REFERENCE:
            if not await table_exists(conn, table):
                print(f"  {table:<28} (table not found - skipped)")
                continue
            rows = await rows_for_references(conn, table)
            snapshot[table] = rows
            print(f"  {table:<28} {len(rows):>3} rows   {desc}")

        rack_rows: list[dict] = []
        if await table_exists(conn, "rack.rack"):
            rack_rows = await rows_for_references(conn, "rack.rack")
            snapshot["rack.rack"] = rack_rows
            print("\nWILL RELEASE")
            for slot in rack_rows:
                print(
                    f"  {slot['location_name']:<28} model {slot['occupied_by_model']},"
                    f" qty {slot['qty']} -> empty; layout kept"
                )

        total = sum(len(v) for v in snapshot.values())
        if total == 0:
            print("\nNothing to purge - the dev database is already clean.")
            return 0

        if args.dry_run:
            print("\nDry run - nothing changed.")
            return 0

        if not args.yes:
            answer = input(f"\nType PURGE to remove the {total} rows above: ").strip()
            if answer != "PURGE":
                print("Cancelled - nothing changed.")
                return 1

        # Snapshot BEFORE the transaction: if the purge then fails, the file is a
        # harmless extra; if it succeeds, the rows are still recoverable by hand.
        path = write_snapshot(Path(args.snapshot_dir), snapshot)
        print(f"\nSnapshot written: {path}")

        async with conn.transaction():
            for table, _ in PURGE_BY_REFERENCE:
                if table not in snapshot:
                    continue
                schema, name = table.split(".", 1)
                await conn.execute(
                    f'DELETE FROM "{schema}"."{name}" WHERE sap_reference_id = ANY($1::text[])',
                    VERIFY_REFERENCES,
                )
            if rack_rows:
                await conn.execute(RACK_RELEASE_SQL, VERIFY_REFERENCES)

        print("Done. No VERIFY line is left in SAP Outward, the status tabs or the racks.")
        return 0
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dry-run", action="store_true", help="show what would change and exit")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    parser.add_argument(
        "--snapshot-dir",
        default=".dev",
        help="where the pre-delete JSON snapshot is written (default: .dev)",
    )
    args = parser.parse_args()

    load_env_file(Path(__file__).resolve().parent / ".env")
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
