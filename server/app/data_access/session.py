from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from app.core.config import settings

# Module-level connection pool — initialised by init_db()
_pool: asyncpg.Pool | None = None


async def init_db() -> None:
    """Create the asyncpg connection pool. Called once at application startup."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=1,
        max_size=10,
        timeout=30,
        command_timeout=60,
    )


async def close_db() -> None:
    """Close the asyncpg connection pool. Called once at application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_conn() -> AsyncIterator[asyncpg.Connection]:
    """
    FastAPI dependency that yields a connection from the pool.

    Usage as FastAPI dependency:
        async def my_route(conn: asyncpg.Connection = Depends(get_conn)):
            ...
    """
    if _pool is None:
        raise RuntimeError("Database pool has not been initialised. Call init_db() first.")
    async with _pool.acquire() as connection:
        yield connection
