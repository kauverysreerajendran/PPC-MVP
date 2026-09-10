"""Data-access layer for `sap_db`. Pure queries — no HTTP, no business rules."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SapInwardRecord, SapSyncRun

_SEARCHABLE = (
    SapInwardRecord.sap_reference_id,
    SapInwardRecord.dc_no,
    SapInwardRecord.po_no,
    SapInwardRecord.material_no,
    SapInwardRecord.model_no,
    SapInwardRecord.vendor_name,
    SapInwardRecord.batch_no,
    SapInwardRecord.lot_no,
)
_SORTABLE = {
    "transaction_date": SapInwardRecord.transaction_date,
    "dc_no": SapInwardRecord.dc_no,
    "po_no": SapInwardRecord.po_no,
    "material_no": SapInwardRecord.material_no,
    "vendor_name": SapInwardRecord.vendor_name,
    "quantity": SapInwardRecord.quantity,
    "created_at": SapInwardRecord.created_at,
}


class SapRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    # --- records ---------------------------------------------------------
    async def list_records(
        self,
        *,
        page: int,
        page_size: int,
        search: str | None,
        sort: str,
        direction: str,
    ) -> tuple[list[SapInwardRecord], int]:
        stmt = select(SapInwardRecord)
        if search:
            like = f"%{search.strip()}%"
            stmt = stmt.where(or_(*(col.ilike(like) for col in _SEARCHABLE)))

        total = await self.s.scalar(select(func.count()).select_from(stmt.subquery())) or 0

        col = _SORTABLE.get(sort, SapInwardRecord.transaction_date)
        # Always break ties on sap_reference_id (SAP-YYMMDD-NNN, ascending with
        # recency) so the row order is STABLE across refetches — without this,
        # tied transaction_date rows come back in Postgres heap order, which
        # shuffles after any row update.
        stmt = stmt.order_by(
            col.desc() if direction == "desc" else col.asc(),
            SapInwardRecord.sap_reference_id.desc(),
        )
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)
        rows = list((await self.s.scalars(stmt)).all())
        return rows, total

    async def get_record(self, record_id: uuid.UUID) -> SapInwardRecord | None:
        return await self.s.get(SapInwardRecord, record_id)

    async def upsert_records(self, dtos: list, *, source_system: str, sync_id: uuid.UUID) -> int:
        """Insert new rows / refresh SAP-sourced columns on existing ones.
        Application-owned columns (remark) are never touched."""
        existing = {
            r.sap_reference_id: r
            for r in (
                await self.s.scalars(
                    select(SapInwardRecord).where(
                        SapInwardRecord.sap_reference_id.in_([d.sap_reference_id for d in dtos])
                    )
                )
            ).all()
        }
        touched = 0
        for d in dtos:
            row = existing.get(d.sap_reference_id)
            fields = dict(
                transaction_date=d.transaction_date,
                dc_no=d.dc_no,
                po_no=d.po_no,
                material_no=d.material_no,
                model_no=d.model_no,
                material_description=d.material_description,
                vendor_code=d.vendor_code,
                vendor_name=d.vendor_name,
                batch_no=d.batch_no,
                lot_no=d.lot_no,
                quantity=d.quantity,
                movement_type=d.movement_type,
                source_system=source_system,
                sync_id=sync_id,
            )
            if row is None:
                self.s.add(
                    SapInwardRecord(sap_reference_id=d.sap_reference_id, **fields)
                )
            else:
                for k, v in fields.items():
                    setattr(row, k, v)
            touched += 1
        await self.s.flush()
        return touched

    # --- sync runs ------------------------------------------------------
    async def add_sync_run(self, run: SapSyncRun) -> SapSyncRun:
        self.s.add(run)
        await self.s.flush()
        return run

    async def list_sync_runs(self, *, limit: int) -> list[SapSyncRun]:
        return list(
            (
                await self.s.scalars(
                    select(SapSyncRun).order_by(SapSyncRun.started_at.desc()).limit(limit)
                )
            ).all()
        )

    # --- reference data ----------------------------------------------
    async def distinct_movement_types(self) -> list[str]:
        rows = (
            await self.s.scalars(
                select(SapInwardRecord.movement_type)
                .where(SapInwardRecord.movement_type.is_not(None))
                .distinct()
                .order_by(SapInwardRecord.movement_type)
            )
        ).all()
        return [r for r in rows if r]
