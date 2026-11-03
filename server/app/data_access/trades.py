from typing import Any


async def get_all_trades(conn) -> list[dict[str, Any]]:
    """Return all trades ordered by name."""
    rows = await conn.fetch(
        "SELECT trade_id, name FROM trade ORDER BY name"
    )
    return [dict(r) for r in rows]


async def verify_trade_ids(conn, trade_ids: list[int]) -> bool:
    """
    Return True only when every ID in *trade_ids* exists in the trade table.
    Returns False (not raises) so the caller decides the HTTP response.
    """
    if not trade_ids:
        return False

    # Fetch all matching IDs in one query
    rows = await conn.fetch(
        "SELECT trade_id FROM trade WHERE trade_id = ANY($1::int[])",
        trade_ids,
    )
    found = {r["trade_id"] for r in rows}
    return found == set(trade_ids)
