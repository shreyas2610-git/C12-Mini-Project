from typing import Any
from fastapi import APIRouter, Depends

from app.api.schemas.complaints import CategoryOut, CommonAreaOut
from app.auth.dependencies import get_current_user
from app.data_access.complaints import get_all_categories, get_all_common_areas
from app.data_access.session import get_conn

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut], summary="List all active categories")
async def list_categories(conn=Depends(get_conn)) -> list[CategoryOut]:
    """Return all active complaint categories with SLA, severity points, and default trade."""
    rows = await get_all_categories(conn)
    return [CategoryOut(**r) for r in rows]


@router.get("/common-areas", response_model=list[CommonAreaOut], summary="List all common areas")
async def list_common_areas(conn=Depends(get_conn)) -> list[CommonAreaOut]:
    """Return all common areas with zone mapping."""
    rows = await get_all_common_areas(conn)
    return [CommonAreaOut(**r) for r in rows]


@router.get("/users/me", summary="Get current logged in user profile")
async def get_me(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Return profile details for the authenticated user."""
    return user

