from fastapi import HTTPException, status


# ── 401 ──────────────────────────────────────────────────────────────────────
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

# ── 403 ──────────────────────────────────────────────────────────────────────
forbidden_exception = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Not enough permissions",
)


# ── 404 ──────────────────────────────────────────────────────────────────────
def not_found_exception(detail: str) -> HTTPException:
    """Return a 404 HTTPException with the given detail message."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=detail,
    )


# ── 409 ──────────────────────────────────────────────────────────────────────
def conflict_exception(detail: str) -> HTTPException:
    """Return a 409 HTTPException with the given detail message."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=detail,
    )


# ── 400 ──────────────────────────────────────────────────────────────────────
def bad_request_exception(detail: str) -> HTTPException:
    """Return a 400 HTTPException with the given detail message."""
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=detail,
    )
