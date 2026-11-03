from fastapi import APIRouter, Depends

from app.api.schemas.auth import TradeOut
from app.data_access.session import get_conn
from app.data_access.trades import get_all_trades

router = APIRouter()


@router.get("", response_model=list[TradeOut], summary="List all trades")
async def list_trades(conn=Depends(get_conn)) -> list[TradeOut]:
    """Return every trade ordered by name. Public endpoint."""
    rows = await get_all_trades(conn)
    return [TradeOut(**r) for r in rows]
