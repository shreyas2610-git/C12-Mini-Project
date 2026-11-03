from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import credentials_exception


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT access token.

    The ``data`` dict MUST contain at least ``sub`` (str user_id) and
    ``role`` (role name).  An ``exp`` claim is added automatically.
    """
    payload = data.copy()
    expire = _utc_now() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT refresh token valid for REFRESH_TOKEN_EXPIRE_DAYS days.
    """
    payload = data.copy()
    expire = _utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload.update({"exp": expire, "type": "refresh"})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT.

    Raises ``credentials_exception`` (HTTP 401) if the token is invalid,
    expired, or missing required claims.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        sub: str | None = payload.get("sub")
        if sub is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception
