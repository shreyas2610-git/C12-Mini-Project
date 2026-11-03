from typing import Any


async def get_all_towers(conn) -> list[dict[str, Any]]:
    """Return all towers ordered by name."""
    rows = await conn.fetch(
        "SELECT tower_id, name FROM tower ORDER BY name"
    )
    return [dict(r) for r in rows]


async def get_flats_by_tower(conn, tower_id: int) -> list[dict[str, Any]]:
    """Return all flats that belong to *tower_id*, ordered by flat_number."""
    rows = await conn.fetch(
        """
        SELECT flat_id, flat_number
        FROM flat
        WHERE tower_id = $1
        ORDER BY flat_number
        """,
        tower_id,
    )
    return [dict(r) for r in rows]
