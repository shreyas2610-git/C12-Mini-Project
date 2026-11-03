from __future__ import annotations

from typing import Any

from app.api.schemas.auth import RegisterRequest


# ── Role ──────────────────────────────────────────────────────────────────────

async def get_role_by_id(conn, role_id: int) -> dict[str, Any] | None:
    """Return the role row for *role_id*, or None if it does not exist."""
    row = await conn.fetchrow(
        "SELECT role_id, name FROM role WHERE role_id = $1",
        role_id,
    )
    return dict(row) if row else None


# ── User lookup ───────────────────────────────────────────────────────────────

async def get_user_by_email(conn, email: str) -> dict[str, Any] | None:
    """
    Return the user row (joined with role name) for *email*,
    or None if no such user exists.
    """
    row = await conn.fetchrow(
        """
        SELECT
            u.user_id,
            u.role_id,
            r.name      AS role_name,
            u.full_name,
            u.email,
            u.phone,
            u.password_hash,
            u.auth_provider,
            u.is_active,
            u.created_at
        FROM "user" u
        JOIN role r ON r.role_id = u.role_id
        WHERE u.email = $1
        """,
        email,
    )
    return dict(row) if row else None


# ── User creation helpers ─────────────────────────────────────────────────────

async def create_user_resident(
    conn,
    data: RegisterRequest,
    password_hash: str,
) -> int:
    """
    Insert a new Resident user inside a single transaction.

    Steps:
    1. INSERT into "user"
    2. INSERT into resident (resident_id, flat_id)

    Returns the new user_id.
    """
    async with conn.transaction():
        user_id: int = await conn.fetchval(
            """
            INSERT INTO "user"
                (role_id, full_name, email, phone, password_hash, auth_provider)
            VALUES ($1, $2, $3, $4, $5, 'password')
            RETURNING user_id
            """,
            data.role_id,
            data.full_name,
            data.email,
            data.phone,
            password_hash,
        )

        await conn.execute(
            "INSERT INTO resident (resident_id, flat_id) VALUES ($1, $2)",
            user_id,
            data.flat_id,
        )

    return user_id


async def create_user_vendor(
    conn,
    data: RegisterRequest,
    password_hash: str,
) -> int:
    """
    Insert a new Vendor user inside a single transaction.

    Steps:
    1. INSERT into "user"
    2. INSERT into vendor (vendor_id, company_name, capacity)
    3. INSERT into vendor_trade for every trade_id in data.trade_ids

    Returns the new user_id.
    """
    async with conn.transaction():
        user_id: int = await conn.fetchval(
            """
            INSERT INTO "user"
                (role_id, full_name, email, phone, password_hash, auth_provider)
            VALUES ($1, $2, $3, $4, $5, 'password')
            RETURNING user_id
            """,
            data.role_id,
            data.full_name,
            data.email,
            data.phone,
            password_hash,
        )

        await conn.execute(
            """
            INSERT INTO vendor (vendor_id, company_name, capacity, current_load)
            VALUES ($1, $2, $3, 0)
            """,
            user_id,
            data.company_name,
            data.capacity,
        )

        # Bulk-insert vendor_trade rows
        await conn.executemany(
            "INSERT INTO vendor_trade (vendor_id, trade_id) VALUES ($1, $2)",
            [(user_id, tid) for tid in (data.trade_ids or [])],
        )

    return user_id


async def create_user_basic(
    conn,
    data: RegisterRequest,
    password_hash: str,
) -> int:
    """
    Insert a user with no subtype row (Coordinator / ZM / GM / System).

    Returns the new user_id.
    """
    async with conn.transaction():
        user_id: int = await conn.fetchval(
            """
            INSERT INTO "user"
                (role_id, full_name, email, phone, password_hash, auth_provider)
            VALUES ($1, $2, $3, $4, $5, 'password')
            RETURNING user_id
            """,
            data.role_id,
            data.full_name,
            data.email,
            data.phone,
            password_hash,
        )

    return user_id
