import asyncio
import logging
from typing import AsyncIterator

import asyncpg

from app.core.config import settings

logger = logging.getLogger("uvicorn")

# Module-level connection pool — initialised by init_db()
_pool: asyncpg.Pool | None = None


async def init_db() -> None:
    """Create the asyncpg connection pool with automatic retry for transient network/DNS blips."""
    global _pool
    max_retries = 6
    for attempt in range(1, max_retries + 1):
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=0,
                max_size=10,
                timeout=30,
                command_timeout=60,
            )
            # Verify connectivity with a quick query
            async with _pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            logger.info("Successfully connected to Neon PostgreSQL pool.")
            return
        except Exception as err:
            if _pool is not None:
                await _pool.close()
                _pool = None
            if attempt == max_retries:
                logger.error("Failed to connect to Neon PostgreSQL after %d attempts: %s", max_retries, err)
                raise err
            logger.warning("Database connection attempt %d failed (%s). Retrying in 2 seconds...", attempt, err)
            await asyncio.sleep(2)


async def close_db() -> None:
    """Close the asyncpg connection pool. Called once at application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_conn() -> AsyncIterator[asyncpg.Connection]:
    """FastAPI dependency that yields a connection from the pool."""
    if _pool is None:
        raise RuntimeError("Database pool has not been initialised. Call init_db() first.")
    async with _pool.acquire() as connection:
        yield connection
