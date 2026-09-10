from __future__ import annotations

from sqladmin.filters import ForeignKeyFilter

from app.admin.permissions import BaseAdminView
from app.models.refresh_token import RefreshToken

# The token itself is never stored in clear text; only its SHA-256 hash. We still
# keep `token_hash` out of every list / detail / form / export below so it cannot
# be copied or correlated from the panel.


class RefreshTokenAdmin(BaseAdminView, model=RefreshToken):
    name = "Session"
    name_plural = "Sessions (Refresh Tokens)"
    icon = "fa-solid fa-key"
    category = "Accounts"

    # Sessions are issued by the auth flow, not created by hand. Admins may
    # revoke (delete) them to force re-login.
    can_create = False
    can_edit = False

    column_list = [
        RefreshToken.id,
        RefreshToken.user_id,
        RefreshToken.family_id,
        RefreshToken.created_at,
        RefreshToken.expires_at,
        RefreshToken.used_at,
        RefreshToken.revoked_at,
        RefreshToken.ip_address,
    ]
    column_details_list = [  # note: token_hash deliberately omitted
        RefreshToken.id,
        RefreshToken.user_id,
        RefreshToken.family_id,
        RefreshToken.created_at,
        RefreshToken.expires_at,
        RefreshToken.used_at,
        RefreshToken.revoked_at,
        RefreshToken.ip_address,
        RefreshToken.user_agent,
    ]
    column_export_exclude_list = ["token_hash"]
    form_excluded_columns = ["token_hash", "created_at", "updated_at"]
    column_searchable_list = [RefreshToken.family_id, RefreshToken.ip_address]
    column_sortable_list = [
        RefreshToken.id,
        RefreshToken.user_id,
        RefreshToken.created_at,
        RefreshToken.expires_at,
    ]
    column_default_sort = ("created_at", True)
    column_filters = [
        ForeignKeyFilter(RefreshToken.user_id, "email", title="User email"),
    ]
