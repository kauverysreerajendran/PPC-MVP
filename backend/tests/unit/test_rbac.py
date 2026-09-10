import pytest
from app.core.rbac import Permission, Role, role_has

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("role", "perm", "expected"),
    [
        (Role.owner, Permission.USER_DELETE, True),
        (Role.admin, Permission.USER_DELETE, False),
        (Role.member, Permission.PROJECT_WRITE, True),
        (Role.viewer, Permission.PROJECT_WRITE, False),
        ("nonsense", Permission.PROJECT_READ, False),
    ],
)
def test_role_has(role, perm, expected):
    assert role_has(role, perm) is expected


def test_pagination_math():
    from app.schemas.common import Page, PageParams

    page = Page.build(items=[1, 2, 3], total=23, params=PageParams(page=1, size=10))
    assert page.pagination.pages == 3
    assert page.pagination.total == 23
