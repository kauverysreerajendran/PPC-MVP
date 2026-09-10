"""Import real masterdata from the SAP Integration service — `python -m app.seed`.

This is the controlled, API-only migration path required by BLUEPRINT §12 /
task §6: the Masterdata service NEVER touches another service's database. It
calls the SAP Integration REST API (`/api/v1/sap/records`), then upserts the
*real* distinct vendors, models and inward document lines it finds into the
`masterdata` database.

Idempotent: natural keys (`vendor_code`, `model_no`, `sap_reference_id`) are
used for upsert, so re-running never duplicates. If the SAP feed is empty the
script creates nothing — no fake/sample rows are ever written.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import MasterModel, SapOutward, SapOutwardStatus, Vendor

log = logging.getLogger("masterdata.seed")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")


def _as_dt(value: object) -> datetime | None:
    """SAP JSON carries ISO-8601 strings; the ORM column wants a datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


async def _fetch_sap_records() -> list[dict]:
    base = str(settings.MASTERDATA_SAP_API_BASE_URL).rstrip("/")
    headers = (
        {"Authorization": f"Bearer {settings.MASTERDATA_SEED_TOKEN}"}
        if settings.MASTERDATA_SEED_TOKEN
        else {}
    )
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30) as client:
        page = 1
        while True:
            resp = await client.get(
                f"{base}/records",
                params={"page": page, "page_size": 200, "sort": "transaction_date"},
                headers=headers,
            )
            resp.raise_for_status()
            body = resp.json()
            out.extend(body["items"])
            if page * body["page_size"] >= body["total"]:
                break
            page += 1
    return out


async def run() -> None:
    try:
        records = await _fetch_sap_records()
    except Exception as exc:  # noqa: BLE001
        log.error("could not reach SAP Integration service at %s: %s",
                  settings.MASTERDATA_SAP_API_BASE_URL, exc)
        log.error("start `services/sap-integration` and run a SAP sync first, then retry.")
        raise SystemExit(1) from exc

    log.info("fetched %d SAP inward records", len(records))
    if not records:
        log.info("SAP feed is empty — nothing to import (no sample data is created).")
        return

    async with SessionLocal() as session:
        # --- vendors ---
        # Read-only: the SAP feed never creates a vendor. sap_outwards may only
        # reference vendors that already exist in the master (case-insensitive).
        vendors: dict[str, Vendor] = {
            v.vendor_code.lower(): v
            for v in (await session.scalars(select(Vendor))).all()
        }

        # --- models ---
        models: dict[str, MasterModel] = {
            mm.model_no: mm for mm in (await session.scalars(select(MasterModel))).all()
        }
        for r in records:
            no = r.get("model_no")
            if not no:
                continue
            mm = models.get(no)
            if mm is None:
                mm = MasterModel(
                    model_no=no,
                    model_name=r.get("material_description") or None,
                )
                session.add(mm)
                models[no] = mm

        await session.flush()

        # --- sap inwards (linked to the masters by FK) ---
        existing: dict[str, SapOutward] = {
            si.sap_reference_id: si
            for si in (await session.scalars(select(SapOutward))).all()
        }
        created = updated = 0
        for r in records:
            ref = r["sap_reference_id"]
            vendor = vendors.get((r.get("vendor_code") or "").lower())
            model = models.get(r.get("model_no") or "")
            fields = dict(
                sap_document_no=r.get("dc_no"),
                transaction_date=_as_dt(r["transaction_date"]),
                dc_no=r.get("dc_no"),
                po_no=r.get("po_no"),
                material_no=r.get("material_no"),
                model_no=r.get("model_no"),
                batch_no=r.get("batch_no"),
                lot_no=r.get("lot_no"),
                quantity=r.get("quantity"),
                movement_type=r.get("movement_type"),
                source_system=r.get("source_system") or "SAP-ECC",
                # only keep the vendor code when it maps to a real master vendor
                vendor_code=vendor.vendor_code if vendor else None,
                vendor_id=vendor.id if vendor else None,
                model_id=model.id if model else None,
            )
            si = existing.get(ref)
            if si is None:
                session.add(SapOutward(sap_reference_id=ref, **fields))
                created += 1
            else:
                for k, val in fields.items():
                    setattr(si, k, val)
                updated += 1

        await session.flush()

        # Every outward line carries a status row (NEW = "Yet to Dispatch").
        have_status = {
            r for r in (await session.scalars(select(SapOutwardStatus.sap_outward_id))).all()
        }
        for si in (await session.scalars(select(SapOutward))).all():
            if si.id not in have_status:
                session.add(
                    SapOutwardStatus(sap_outward_id=si.id, status=si.outward_status or "NEW")
                )

        await session.commit()
        log.info(
            "imported: %d vendors, %d models, sap_inwards +%d / ~%d",
            len(vendors), len(models), created, updated,
        )


if __name__ == "__main__":
    asyncio.run(run())
