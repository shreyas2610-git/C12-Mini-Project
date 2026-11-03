from typing import Any

from fastapi import Depends

from app.auth.dependencies import get_current_user
from app.core.exceptions import forbidden_exception


def require_role(*roles: str) -> Any:
    """
    Dependency factory that restricts access to users whose ``role_name``
    is one of the provided *roles*.

    Usage::

        @router.get("/admin", dependencies=[require_role("GM", "ZM")])
        async def admin_route(): ...

        # — or — inject the user record at the same time:
        @router.get("/admin")
        async def admin_route(current_user=require_role("GM")):
            return current_user
    """

    async def _checker(
        current_user: dict[str, Any] = Depends(get_current_user),
    ) -> dict[str, Any]:
        if current_user["role_name"] not in roles:
            raise forbidden_exception
        return current_user

    return Depends(_checker)
