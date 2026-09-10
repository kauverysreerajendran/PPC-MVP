"""Business logic for the SAP Integration Service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import SapSyncRun
from app.providers import get_provider
from app.repository import SapRepository
from app.schemas import (
    ColumnDef,
    EnumsOut,
    Page,
    SapInwardRecordOut,
    SapInwardRecordUpdate,
    SyncRunOut,
)

# The table's shape lives here, not in the frontend (keeps the UI dynamic).
COLUMNS: list[ColumnDef] = [
    ColumnDef(key="transaction_date", header="Date / Timestamp", type="date"),
    ColumnDef(key="dc_no", header="DC No"),
    ColumnDef(key="po_no", header="PO No"),
    ColumnDef(key="material_no", header="Material No"),
    ColumnDef(key="model_no", header="Model"),
    ColumnDef(key="material_description", header="Description"),
    ColumnDef(key="vendor_name", header="Vendor"),
    ColumnDef(key="batch_no", header="Batch No"),
    ColumnDef(key="lot_no", header="Lot No"),
    ColumnDef(key="quantity", header="Quantity", type="number"),
    ColumnDef(key="movement_type", header="SAP Movement"),
    ColumnDef(key="remark", header="Remark", editable=True),
]


class SapService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = SapRepository(session)

    async def list_records(
        self,
        *,
        page: int,
        page_size: int,
        search: str | None,
        sort: str,
        direction: str,
    ) -> Page[SapInwardRecordOut]:
        rows, total = await self.repo.list_records(
            page=page,
            page_size=page_size,
            search=search,
            sort=sort,
            direction=direction,
        )
        return Page[SapInwardRecordOut](
            items=[SapInwardRecordOut.model_validate(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def update_record(
        self, record_id: uuid.UUID, payload: SapInwardRecordUpdate
    ) -> SapInwardRecordOut:
        row = await self.repo.get_record(record_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "record not found")

        if payload.remark is not None:
            row.remark = payload.remark or None

        await self.repo.s.flush()
        return SapInwardRecordOut.model_validate(row)

    async def enums(self) -> EnumsOut:
        return EnumsOut(
            movement_types=await self.repo.distinct_movement_types(),
            columns=COLUMNS,
        )

    async def list_sync_runs(self, *, limit: int = 20) -> list[SyncRunOut]:
        return [SyncRunOut.model_validate(r) for r in await self.repo.list_sync_runs(limit=limit)]

    async def run_sync(self, *, count: int | None, triggered_by: str | None) -> SyncRunOut:
        provider = get_provider()
        run = await self.repo.add_sync_run(
            SapSyncRun(
                source_system=settings.SAP_SOURCE_SYSTEM,
                provider=provider.name,
                status="RUNNING",
                triggered_by=triggered_by,
            )
        )
        try:
            dtos = await provider.fetch_inward_records(count=count)
            ingested = await self.repo.upsert_records(
                dtos, source_system=settings.SAP_SOURCE_SYSTEM, sync_id=run.id
            )
            run.records_ingested = ingested
            run.status = "SUCCESS"
        except Exception as exc:  # noqa: BLE001 - recorded on the run row
            run.status = "FAILED"
            run.error = str(exc)[:2000]
        finally:
            run.finished_at = datetime.now(UTC)
            await self.repo.s.flush()

        if run.status == "FAILED":
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"SAP sync failed: {run.error}")
        return SyncRunOut.model_validate(run)
