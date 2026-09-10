from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import request_id_ctx
from app.models.audit import AuditLog


async def record_audit(
    session: AsyncSession,
    *,
    action: str,
    entity: str,
    entity_id: str | None = None,
    actor_id: int | None = None,
    ip: str | None = None,
    diff: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            request_id=request_id_ctx.get(),
            ip_address=ip,
            diff=diff,
        )
    )
    await session.flush()
