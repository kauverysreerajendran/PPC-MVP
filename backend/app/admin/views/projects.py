from __future__ import annotations

from sqladmin.filters import ForeignKeyFilter, StaticValuesFilter

from app.admin.permissions import BaseAdminView
from app.models.project import Project


class ProjectAdmin(BaseAdminView, model=Project):
    name = "Project"
    name_plural = "Projects"
    icon = "fa-solid fa-folder"
    category = "Application"

    column_list = [
        Project.id,
        Project.name,
        Project.owner,  # FK relationship — rendered as a link to the User
        Project.status,
        Project.created_at,
        Project.updated_at,
    ]
    column_details_list = [
        Project.id,
        Project.owner,
        Project.name,
        Project.description,
        Project.status,
        Project.created_at,
        Project.updated_at,
        Project.deleted_at,
    ]

    column_searchable_list = [Project.name, Project.description]
    column_sortable_list = [Project.id, Project.name, Project.status, Project.created_at]
    column_default_sort = ("created_at", True)
    column_filters = [
        StaticValuesFilter(Project.status, [("active", "Active"), ("archived", "Archived")]),
        ForeignKeyFilter(Project.owner_id, "email", title="Owner email"),
    ]
    column_labels = {"owner": "Owner"}

    # Navigate/select the FK from the form with a searchable ajax dropdown
    # instead of loading every user into a <select>.
    form_ajax_refs = {"owner": {"fields": ("email", "full_name"), "order_by": "email", "limit": 20}}
    form_excluded_columns = ["created_at", "updated_at", "deleted_at"]
