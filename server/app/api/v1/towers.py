from fastapi import APIRouter, Depends

from app.api.schemas.auth import TowerOut, FlatOut
from app.data_access.session import get_conn
from app.data_access.towers import get_all_towers, get_flats_by_tower

router = APIRouter()


@router.get("", response_model=list[TowerOut], summary="List all towers")
async def list_towers(conn=Depends(get_conn)) -> list[TowerOut]:
    """Return every tower in the database ordered by name. Public endpoint."""
    rows = await get_all_towers(conn)
    return [TowerOut(**r) for r in rows]


@router.get(
    "/{tower_id}/flats",
    response_model=list[FlatOut],
    summary="List flats for a tower",
)
async def list_flats(tower_id: int, conn=Depends(get_conn)) -> list[FlatOut]:
    """Return all flats that belong to the given tower. Public endpoint."""
    rows = await get_flats_by_tower(conn, tower_id)
    return [FlatOut(**r) for r in rows]
