from __future__ import annotations

from sqladmin.filters import AllUniqueStringValuesFilter

from app.admin.permissions import BaseAdminView
from app.models.audit import AuditLog


class AuditLogAdmin(BaseAdminView, model=AuditLog):
    name = "Audit Log"
    name_plural = "Audit Logs"
    icon = "fa-solid fa-clipboard-list"
    category = "Application"

    # The audit trail is evidence — nobody edits it from the panel.
    always_read_only = True
    can_create = False
    can_edit = False
    can_delete = False
    can_export = True

    column_list = [
        AuditLog.id,
        AuditLog.created_at,
        AuditLog.actor_id,
        AuditLog.action,
        AuditLog.entity,
        AuditLog.entity_id,
        AuditLog.ip_address,
        AuditLog.request_id,
    ]
    column_details_list = [
        AuditLog.id,
        AuditLog.created_at,
        AuditLog.actor_id,
        AuditLog.action,
        AuditLog.entity,
        AuditLog.entity_id,
        AuditLog.request_id,
        AuditLog.ip_address,
        AuditLog.diff,
    ]
    column_searchable_list = [AuditLog.action, AuditLog.entity, AuditLog.entity_id]
    column_sortable_list = [AuditLog.id, AuditLog.created_at, AuditLog.action, AuditLog.entity]
    column_default_sort = ("created_at", True)
    column_filters = [
        AllUniqueStringValuesFilter(AuditLog.entity),
        AllUniqueStringValuesFilter(AuditLog.action),
    ]
