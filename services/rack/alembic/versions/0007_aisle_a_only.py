"""CBFC keeps Aisle A only — aisle R is retired

0003 seeded the CBFC warehouse with two aisles: R (the photographed aisle, 14
racks) and A (6 racks of a different shape) — 20 racks and 5,031 trays. The MVP
stores into Aisle A alone, so aisle R's 14 racks and 4,071 trays go.

This revision, not 0003, is the single point of truth for "A only": 0003 is
already applied everywhere and is left exactly as it was, so a fresh database
still builds both aisles and then arrives here to have R removed. That keeps
one history for existing and new databases alike.

**Placements are relocated, never destroyed.** Aisle R contains a rack whose
``rack_code`` is literally ``A`` — its trays read ``A-S2-R1-T01`` while Aisle
A's read ``A1-S2-R1-T01``, one hyphen apart — and that rack holds live stock,
including half of ``SAP-260920-019`` (the other half is already in Aisle A).
Deleting by ``aisle_code`` alone would silently halve that line's placed
quantity. So every occupied tray in a doomed aisle is first moved into a free
Aisle A tray, contents intact (model, qty, pieces, lot, SAP reference and
placement source), and only then are the rows deleted. A tray's capacity is
the same everywhere (``app/capacity.py``), so a 1:1 move can never overfill.

If the relocation cannot be completed — not enough free trays in Aisle A, or
anything still occupied afterwards — the migration raises and nothing is
deleted. Counts are printed either way so the run is auditable.

Revision ID: 0007_aisle_a_only
Revises: 0006_rack_slot_pieces
Create Date: 2026-09-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_aisle_a_only"
down_revision: str | None = "0006_rack_slot_pieces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WAREHOUSE = "CBFC"
#: the one aisle the MVP stores into — everything else in CBFC is removed
KEEP_AISLE = "A"

#: what makes a tray worth relocating rather than deleting outright
OCCUPIED = "(occupied OR sap_reference_id IS NOT NULL OR slot_state <> 'empty')"

#: the occupancy a relocated tray carries with it. Slot identity (warehouse /
#: aisle / rack / shelf / row / tray / location_name) stays with the target.
_CARRIED = (
    "slot_state",
    "occupied",
    "occupied_by_model",
    "date_of_occupied",
    "qty",
    "pieces",
    "lot_no",
    "sap_reference_id",
    "placement_source",
    "notes",
)


def upgrade() -> None:
    conn = op.get_bind()

    before_racks, before_trays = _counts(conn)
    print(f"[0007] before: {before_racks} racks, {before_trays} trays in {WAREHOUSE}")

    doomed = conn.execute(
        sa.text(
            f"SELECT id, aisle_code, rack_code, location_name, occupied_by_model,"
            f" qty, sap_reference_id FROM rack"
            f" WHERE warehouse_code = :w AND aisle_code <> :a AND {OCCUPIED}"
            f" ORDER BY rack_code, shelf_no, row_no, tray_no"
        ),
        {"w": WAREHOUSE, "a": KEEP_AISLE},
    ).fetchall()

    if doomed:
        free = conn.execute(
            sa.text(
                f"SELECT id FROM rack"
                f" WHERE warehouse_code = :w AND aisle_code = :a"
                f" AND status = 'active' AND NOT {OCCUPIED}"
                f" ORDER BY rack_code, shelf_no, row_no, tray_no"
                f" LIMIT :n"
            ),
            {"w": WAREHOUSE, "a": KEEP_AISLE, "n": len(doomed)},
        ).fetchall()

        if len(free) < len(doomed):
            codes = ", ".join(r.location_name or str(r.id) for r in doomed)
            raise RuntimeError(
                f"Aisle {KEEP_AISLE} has {len(free)} free tray(s) but {len(doomed)} "
                f"occupied tray(s) must be relocated out of the retired aisles, so "
                f"nothing was deleted. Free up space or release these placements "
                f"first: {codes}"
            )

        assignments = ", ".join(f"{c} = src.{c}" for c in _CARRIED)
        for source, target in zip(doomed, free, strict=True):
            conn.execute(
                sa.text(
                    f"UPDATE rack AS dst SET {assignments}, updated_at = now()"
                    f" FROM rack AS src WHERE src.id = :src AND dst.id = :dst"
                ),
                {"src": source.id, "dst": target.id},
            )
            # Clear the source so the pair never both claim the same stock, even
            # if the delete below is rolled back.
            conn.execute(
                sa.text(
                    "UPDATE rack SET slot_state = 'empty', occupied = false,"
                    " occupied_by_model = NULL, date_of_occupied = NULL, qty = NULL,"
                    " pieces = NULL, lot_no = NULL, sap_reference_id = NULL,"
                    " placement_source = NULL, updated_at = now()"
                    " WHERE id = :src"
                ),
                {"src": source.id},
            )
            print(
                f"[0007] relocated {source.location_name}"
                f" (aisle {source.aisle_code}, model {source.occupied_by_model},"
                f" qty {source.qty}, ref {source.sap_reference_id}) into Aisle"
                f" {KEEP_AISLE}"
            )

    # Belt and braces: if anything is still occupied out there, stop rather than
    # destroy it. The relocation above should have left nothing behind.
    left = conn.execute(
        sa.text(
            f"SELECT location_name FROM rack"
            f" WHERE warehouse_code = :w AND aisle_code <> :a AND {OCCUPIED}"
        ),
        {"w": WAREHOUSE, "a": KEEP_AISLE},
    ).fetchall()
    if left:
        codes = ", ".join(r.location_name or "?" for r in left)
        raise RuntimeError(
            f"{len(left)} tray(s) in the retired aisles are still occupied after "
            f"relocation, so nothing was deleted: {codes}"
        )

    # Trays first, then the masters they were derived from.
    trays = conn.execute(
        sa.text("DELETE FROM rack WHERE warehouse_code = :w AND aisle_code <> :a"),
        {"w": WAREHOUSE, "a": KEEP_AISLE},
    ).rowcount
    racks = conn.execute(
        sa.text(
            "DELETE FROM rack_master WHERE warehouse_code = :w AND aisle_code <> :a"
        ),
        {"w": WAREHOUSE, "a": KEEP_AISLE},
    ).rowcount
    print(f"[0007] deleted {racks} rack master(s) and {trays} tray(s)")

    after_racks, after_trays = _counts(conn)
    print(
        f"[0007] after: {after_racks} racks, {after_trays} trays in {WAREHOUSE}"
        f" (relocated {len(doomed)} placement(s))"
    )


def _counts(conn) -> tuple[int, int]:
    """Racks and trays currently in the warehouse."""
    racks = conn.execute(
        sa.text("SELECT count(*) FROM rack_master WHERE warehouse_code = :w"),
        {"w": WAREHOUSE},
    ).scalar_one()
    trays = conn.execute(
        sa.text("SELECT count(*) FROM rack WHERE warehouse_code = :w"),
        {"w": WAREHOUSE},
    ).scalar_one()
    return racks, trays


def downgrade() -> None:
    """No-op, deliberately.

    Re-seeding the masters would be easy, but the 4,071 tray rows that hung off
    them carried their own ids and whatever was placed in them; re-creating
    empty trays with new ids would look like a restore without being one, and
    the placements relocated into Aisle A on the way up are not tracked back to
    the tray they came from. Better to leave the topology as it is than to
    fabricate one.
    """
