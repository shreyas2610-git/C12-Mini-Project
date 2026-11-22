from typing import Any

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.auth.jwt import decode_token
from app.core.exceptions import credentials_exception
from app.data_access.session import get_conn

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    conn=Depends(get_conn),
) -> dict[str, Any]:
    """
    FastAPI dependency that validates the Bearer token and returns the
    authenticated user as a dict with keys:
        user_id, role_id, role_name, full_name, email, is_active,
        flat_id, flat_number, tower_id, tower_name, zone_id, zone_name
    Raises HTTP 401 if the token is invalid or the user is inactive.
    """
    payload = decode_token(token)

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise credentials_exception

    row = await conn.fetchrow(
        """
        SELECT
            u.user_id,
            u.role_id,
            r.name  AS role_name,
            u.full_name,
            u.email,
            u.is_active,
            res.flat_id,
            f.flat_number,
            f.tower_id,
            t.name  AS tower_name,
            COALESCE(z.zone_id, t.zone_id) AS zone_id,
            COALESCE(z.name, tz.name)      AS zone_name
        FROM "user" u
        JOIN role r ON r.role_id = u.role_id
        LEFT JOIN zone z ON z.zm_user_id = u.user_id
        LEFT JOIN resident res ON res.resident_id = u.user_id
        LEFT JOIN flat f ON f.flat_id = res.flat_id
        LEFT JOIN tower t ON t.tower_id = f.tower_id
        LEFT JOIN zone tz ON tz.zone_id = t.zone_id
        WHERE u.user_id = $1
        """,
        user_id,
    )

    if row is None:
        raise credentials_exception

    user = dict(row)

    if not user["is_active"]:
        raise credentials_exception

    return user
