from __future__ import annotations

from app.models.project import Project
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project
    sortable = {"created_at": "created_at", "name": "name", "updated_at": "updated_at"}
