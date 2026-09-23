"""HTTP routes — mounted at ``/api/v1/status``."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.db import get_session
from app.errors import ConflictError
from app.security import Principal, current_principal

router = APIRouter()

Session = Annotated[AsyncSession, Depends(get_session)]
User = Annotated[Principal, Depends(current_principal)]

_DEF_JOIN = and_(
    m.StatusDefinition.stage == m.LineStatus.stage,
    m.StatusDefinition.code == m.LineStatus.code,
)


def _split_refs(refs: str | None) -> list[str]:
    return [r.strip() for r in (refs or "").split(",") if r.strip()]


def _line_out(line: m.LineStatus, d: m.StatusDefinition | None) -> s.LineStatusOut:
    return s.LineStatusOut(
        sap_reference_id=line.sap_reference_id,
        stage=line.stage,
        code=line.code,
        label=d.label if d else line.code,
        tone=d.tone if d else "neutral",
        note=line.note,
        actor=line.actor,
        source=line.source,
        changed_at=line.changed_at,
    )


async def _definitions(session: AsyncSession) -> dict[tuple[str, str], m.StatusDefinition]:
    rows = (await session.scalars(select(m.StatusDefinition))).all()
    return {(d.stage, d.code): d for d in rows}


async def _apply(
    session: AsyncSession,
    ev: s.EventIn,
    principal: Principal,
    defs: dict[tuple[str, str], m.StatusDefinition],
) -> s.ChangeOut:
    """Move one line to a status: record the event and update the snapshot.

    Reporting the status a line is already in is a no-op, so callers can post
    idempotently (e.g. on every scan) without flooding the history.
    """
    d = defs.get((ev.stage, ev.code))
    if d is None or d.status != "active":
        raise ConflictError(f"'{ev.code}' is not a status of stage '{ev.stage}'")

    line = await session.scalar(
        select(m.LineStatus).where(
            m.LineStatus.sap_reference_id == ev.sap_reference_id,
            m.LineStatus.stage == ev.stage,
        )
    )
    if line is not None and line.code == ev.code:
        return s.ChangeOut(changed=False, line=_line_out(line, d))

    now = datetime.now(UTC)
    actor = ev.actor or principal.subject or None
    source = ev.source or principal.subject or None
    session.add(
        m.StatusEvent(
            sap_reference_id=ev.sap_reference_id,
            stage=ev.stage,
            code=ev.code,
            previous_code=line.code if line else None,
            note=ev.note,
            actor=actor,
            source=source,
            occurred_at=now,
        )
    )
    if line is None:
        line = m.LineStatus(
            sap_reference_id=ev.sap_reference_id,
            stage=ev.stage,
            code=ev.code,
            note=ev.note,
            actor=actor,
            source=source,
            changed_at=now,
        )
        session.add(line)
    else:
        line.code = ev.code
        line.note = ev.note
        line.actor = actor
        line.source = source
        line.changed_at = now
    await session.flush()
    return s.ChangeOut(changed=True, line=_line_out(line, d))


# --- definitions (the status master) ---------------------------------------
@router.get("/definitions", response_model=list[s.DefinitionOut], tags=["definitions"])
async def list_definitions(
    session: Session, _u: User, stage: s.Stage | None = Query(None)
) -> Any:
    stmt = select(m.StatusDefinition).where(m.StatusDefinition.status == "active")
    if stage:
        stmt = stmt.where(m.StatusDefinition.stage == stage)
    stmt = stmt.order_by(m.StatusDefinition.stage, m.StatusDefinition.sort_order)
    return [s.DefinitionOut.model_validate(d) for d in (await session.scalars(stmt)).all()]


# --- report changes ----------------------------------------------------------
@router.post("/events", response_model=s.ChangeOut, tags=["events"])
async def post_event(payload: s.EventIn, session: Session, user: User) -> Any:
    return await _apply(session, payload, user, await _definitions(session))


@router.post("/events/batch", response_model=list[s.ChangeOut], tags=["events"])
async def post_events(payload: s.EventBatchIn, session: Session, user: User) -> Any:
    """Apply several changes in one transaction, in order."""
    defs = await _definitions(session)
    return [await _apply(session, ev, user, defs) for ev in payload.events]


# --- read current status -----------------------------------------------------
@router.get("/lines", response_model=s.Page[s.LineStatusOut], tags=["lines"])
async def list_lines(
    session: Session,
    _u: User,
    stage: s.Stage | None = Query(None),
    code: str | None = Query(None, max_length=32),
    refs: str | None = Query(
        None, max_length=8000, description="comma-separated sap_reference_ids"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
) -> Any:
    """Current statuses, filtered by stage / code / a set of SAP references."""
    stmt = select(m.LineStatus, m.StatusDefinition).outerjoin(m.StatusDefinition, _DEF_JOIN)
    if stage:
        stmt = stmt.where(m.LineStatus.stage == stage)
    if code:
        stmt = stmt.where(m.LineStatus.code == code)
    if ref_list := _split_refs(refs):
        stmt = stmt.where(m.LineStatus.sap_reference_id.in_(ref_list))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(m.LineStatus.changed_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    rows = (await session.execute(stmt)).all()
    return {
        "items": [_line_out(line, d) for line, d in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/lines/by-ref/{sap_reference_id}", response_model=s.LineDetailOut, tags=["lines"]
)
async def get_line(sap_reference_id: str, session: Session, _u: User) -> Any:
    """Every stage's current status for one SAP line, plus its full history."""
    rows = (
        await session.execute(
            select(m.LineStatus, m.StatusDefinition)
            .outerjoin(m.StatusDefinition, _DEF_JOIN)
            .where(m.LineStatus.sap_reference_id == sap_reference_id)
        )
    ).all()
    history = (
        await session.scalars(
            select(m.StatusEvent)
            .where(m.StatusEvent.sap_reference_id == sap_reference_id)
            .order_by(m.StatusEvent.occurred_at.desc())
        )
    ).all()
    return s.LineDetailOut(
        sap_reference_id=sap_reference_id,
        stages={line.stage: _line_out(line, d) for line, d in rows},
        history=[s.EventOut.model_validate(e) for e in history],
    )


@router.get("/refs", response_model=s.RefsOut, tags=["lines"])
async def list_refs(
    session: Session,
    _u: User,
    stage: s.Stage = Query(...),
    code: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="one status code, or several comma-separated (matches any of them)",
    ),
) -> Any:
    """Every SAP reference currently in one status — for other services to
    filter their own lists by (e.g. SAP Outward's Main / Complete tabs).

    ``code`` may name several statuses (``DISPATCHED,RECEIVED``): a line matches
    when its current code at that stage is any of them. A single code behaves
    exactly as before.
    """
    codes = [c.strip() for c in code.split(",") if c.strip()]
    refs = (
        await session.scalars(
            select(m.LineStatus.sap_reference_id).where(
                m.LineStatus.stage == stage, m.LineStatus.code.in_(codes)
            )
        )
    ).all()
    return s.RefsOut(stage=stage, code=code, count=len(refs), refs=list(refs))
