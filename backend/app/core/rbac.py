"""Role-based access control matrix. Single source of truth for permissions."""

from __future__ import annotations

import enum


class Role(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"
    viewer = "viewer"


class Permission(str, enum.Enum):
    USER_READ = "user:read"
    USER_WRITE = "user:write"
    USER_DELETE = "user:delete"
    PROJECT_READ = "project:read"
    PROJECT_WRITE = "project:write"
    PROJECT_DELETE = "project:delete"
    ADMIN_ACCESS = "admin:access"


_MATRIX: dict[Role, set[Permission]] = {
    Role.owner: set(Permission),
    Role.admin: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.PROJECT_READ,
        Permission.PROJECT_WRITE,
        Permission.PROJECT_DELETE,
        Permission.ADMIN_ACCESS,
    },
    Role.member: {
        Permission.USER_READ,
        Permission.PROJECT_READ,
        Permission.PROJECT_WRITE,
    },
    Role.viewer: {Permission.USER_READ, Permission.PROJECT_READ},
}


def role_has(role: Role | str, permission: Permission) -> bool:
    try:
        role = Role(role)
    except ValueError:
        return False
    return permission in _MATRIX.get(role, set())
