"""Automatic SAP pull.

The MVP's "real-time" path: the SAP Integration service pulls on its own
schedule and upserts into ``sap.sap_inward_record``, so the SAP Outward screen
reflects SAP without anyone pressing a button. The frontend does not subscribe
to anything — it polls the records API on the shared transactional cadence
(``frontend/src/lib/polling.ts``), so a row this loop writes shows up on the
next tick.

It is the same code path as the manual button and the seed: provider → DTOs →
``SapRepository.upsert_records``, keyed on ``sap_reference_id``. Nothing here
knows which provider is configured, so replacing the mock with a real SAP client
changes nothing in this file.

Safety properties that matter in a multi-worker deployment:

  * every tick takes a Postgres transaction-level advisory lock, so if several
    uvicorn workers (or several replicas) wake at the same moment exactly one
    pulls and the rest skip — the lock is released when the transaction ends,
    including on crash;
  * a failed pull is logged and recorded as a FAILED ``sap_sync_run`` row; it
    never propagates, so a SAP outage cannot stop the loop or the service;
  * shutdown is prompt: the wait between ticks is interruptible.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import HTTPException
from sqlalchemy import func, select

from app.config import settings
from app.db import SessionLocal
from app.service import SapService

log = logging.getLogger("sap.auto-sync")

#: Advisory-lock key. Arbitrary but fixed, and namespaced by the first int so it
#: cannot collide with a lock another service takes in the shared database.
LOCK_CLASS_ID = 0x5A70  # "SAP"
LOCK_OBJECT_ID = 1


async def run_once() -> None:
    """One pull attempt. Never raises for a SAP-side failure."""
    async with SessionLocal() as session:
        acquired = await session.scalar(
            select(func.pg_try_advisory_xact_lock(LOCK_CLASS_ID, LOCK_OBJECT_ID))
        )
        if not acquired:
            log.debug("skipped: another worker is already pulling")
            return
        try:
            run = await SapService(session).run_sync(
                count=settings.SAP_AUTO_SYNC_COUNT, triggered_by="auto-sync"
            )
        except HTTPException as exc:
            # run_sync already wrote the FAILED row; commit so the failure is
            # visible in the sync history instead of being rolled back.
            await session.commit()
            log.warning("pull failed: %s", exc.detail)
            return
        await session.commit()
        log.info("pull ok: run=%s ingested=%s", run.id, run.records_ingested)


async def sync_loop(stop: asyncio.Event) -> None:
    """Pull every SAP_AUTO_SYNC_SECONDS until `stop` is set."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=settings.SAP_AUTO_SYNC_START_DELAY_SECONDS)
        return  # asked to stop before the first tick
    except TimeoutError:
        pass

    while not stop.is_set():
        try:
            await run_once()
        except Exception:  # noqa: BLE001 - the loop must outlive any one tick
            log.exception("pull tick raised")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.SAP_AUTO_SYNC_SECONDS)
        except TimeoutError:
            continue
