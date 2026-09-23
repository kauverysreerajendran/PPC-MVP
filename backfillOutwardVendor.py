"""Fill in the vendor on outward lines that were created without one.

``masterdata.sap_outwards.vendor_code`` was never seeded from the SAP feed: the
SAP Upload screen did not send it and it was not one of the fields a new line is
created from. SAP Outward hid that by falling back to the feed record it already
had on screen; SAP Inward reads masterdata alone, so its Vendor column came up
empty. Both sides now carry the vendor forward, and this fills in the lines
written before they did.

    python backfillOutwardVendor.py --dry-run   # show what would change
    python backfillOutwardVendor.py             # asks you to type FILL
    python backfillOutwardVendor.py --yes       # no prompt (scripts / CI)

A line that came from the feed takes its vendor from the matching
``sap.sap_inward_record``; a shortage back-order takes its parent's, the way
``_BACKORDER_INHERITED`` would have. ``vendor_id`` is resolved from the Vendors
master alongside it, and a code no active vendor matches is reported and
skipped rather than stored. Only rows whose ``vendor_code`` is NULL are touched
— an existing value is never overwritten.

This reads two schemas, so it is a maintenance script rather than a migration:
each service migrates only its own schema (BLUEPRINT §0). All writes run in ONE
transaction. Reads DATABASE_URL from the environment or the repo-root .env, and
refuses to run when ENVIRONMENT is staging/production.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

PROTECTED_ENVIRONMENTS = {"staging", "production", "prod"}

#: Lines that came from the feed: the vendor is on the matching feed record.
FROM_FEED = """
SELECT o.id, o.sap_reference_id, s.vendor_code
  FROM masterdata.sap_outwards o
  JOIN sap.sap_inward_record s ON s.sap_reference_id = o.sap_reference_id
 WHERE o.vendor_code IS NULL AND s.vendor_code IS NOT NULL
"""

#: Shortage back-orders have no feed record of their own — they inherit the
#: parent's vendor, which is what raising one would have copied across.
FROM_PARENT = """
SELECT o.id, o.sap_reference_id,
       COALESCE(p.vendor_code, s.vendor_code) AS vendor_code
  FROM masterdata.sap_outwards o
  JOIN masterdata.sap_outwards p ON p.sap_reference_id = o.parent_sap_reference_id
  LEFT JOIN sap.sap_inward_record s ON s.sap_reference_id = p.sap_reference_id
 WHERE o.vendor_code IS NULL
   AND COALESCE(p.vendor_code, s.vendor_code) IS NOT NULL
"""


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
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def run(args: argparse.Namespace) -> int:
    try:
        import asyncpg  # optional dependency, checked at runtime
    except ImportError:
        print("asyncpg is required: pip install asyncpg (or use backend\\.venv python)")
        return 1

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in PROTECTED_ENVIRONMENTS:
        print(f"Refusing to write data: ENVIRONMENT={env}.")
        return 1

    conn = await asyncpg.connect(dsn_from_env())
    try:
        missing = await conn.fetchval(
            "SELECT count(*) FROM masterdata.sap_outwards WHERE vendor_code IS NULL"
        )
        total = await conn.fetchval("SELECT count(*) FROM masterdata.sap_outwards")
        print(f"\nENVIRONMENT={env}   {missing} of {total} outward line(s) have no vendor\n")

        # A line matching a feed record wins; back-orders fall back to the parent.
        planned: dict = {}
        for sql in (FROM_FEED, FROM_PARENT):
            for row in await conn.fetch(sql):
                planned.setdefault(row["id"], (row["sap_reference_id"], row["vendor_code"]))

        # Resolve every code against the Vendors master before writing any of
        # them — a code no active vendor matches is reported, never stored.
        vendors = {
            r["vendor_code"].lower(): r["id"]
            for r in await conn.fetch(
                "SELECT id, vendor_code FROM masterdata.vendors WHERE status = 'active'"
            )
        }
        writes, unknown = [], []
        for row_id, (ref, code) in sorted(planned.items(), key=lambda kv: kv[1][0]):
            vendor_id = vendors.get(code.lower())
            if vendor_id is None:
                unknown.append((ref, code))
                continue
            writes.append((row_id, code, vendor_id))
            print(f"  {ref:<24} -> {code}")

        for ref, code in unknown:
            print(f"  {ref:<24} -> {code}  (SKIPPED - no active vendor with that code)")

        if not writes:
            print("\nNothing to fill in.")
            return 0 if not unknown else 1

        if args.dry_run:
            print(f"\nDry run - {len(writes)} row(s) would change, nothing written.")
            return 0

        if not args.yes:
            if input(f"\nType FILL to set the vendor on {len(writes)} row(s): ").strip() != "FILL":
                print("Cancelled - nothing changed.")
                return 1

        async with conn.transaction():
            await conn.executemany(
                "UPDATE masterdata.sap_outwards"
                "   SET vendor_code = $2, vendor_id = $3, updated_at = now()"
                " WHERE id = $1 AND vendor_code IS NULL",
                writes,
            )

        left = await conn.fetchval(
            "SELECT count(*) FROM masterdata.sap_outwards WHERE vendor_code IS NULL"
        )
        print(f"\nDone. {len(writes)} row(s) filled in; {left} still without a vendor.")
        return 0
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dry-run", action="store_true", help="show what would change and exit")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = parser.parse_args()

    load_env_file(Path(__file__).resolve().parent / ".env")
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
