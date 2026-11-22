from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserProfileOut
from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token
from app.auth.passwords import hash_password, verify_password
from app.core.exceptions import (
    bad_request_exception,
    conflict_exception,
    credentials_exception,
    not_found_exception,
)
from app.data_access.session import get_conn
from app.data_access.trades import verify_trade_ids
from app.data_access.users import (
    create_user_basic,
    create_user_resident,
    create_user_vendor,
    get_role_by_id,
    get_user_by_email,
)

router = APIRouter()

# ── Helper ────────────────────────────────────────────────────────────────────

def _build_token_response(
    user_id: int,
    full_name: str,
    role_name: str,
    zone_id: int | None = None,
    zone_name: str | None = None,
) -> TokenResponse:
    token_data = {"sub": str(user_id), "role": role_name}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user_id=user_id,
        full_name=full_name,
        role=role_name,
        zone_id=zone_id,
        zone_name=zone_name,
    )


# ── POST /auth/register ───────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, conn=Depends(get_conn)) -> TokenResponse:
    """
    Register a new user account.

    * Role **Resident** (role_id resolved from DB): ``flat_id`` required and
      must exist in the ``flat`` table.
    * Role **Vendor**: ``company_name``, ``capacity`` (≥ 0), and ``trade_ids``
      (non-empty, all existing) are required.
    * All other roles (Coordinator / ZM / GM / System): no subtype row created.

    Issues a TokenResponse immediately after successful creation.
    """

    # ── 1. Resolve role ───────────────────────────────────────────────────────
    role = await get_role_by_id(conn, body.role_id)
    if role is None:
        raise not_found_exception(f"Role with id={body.role_id} not found.")

    role_name: str = role["name"]

    # ── 2. Role-specific field validation ─────────────────────────────────────
    if role_name == "Resident":
        if body.flat_id is None:
            raise bad_request_exception("flat_id is required for Resident registration.")

        flat_exists = await conn.fetchval(
            "SELECT flat_id FROM flat WHERE flat_id = $1", body.flat_id
        )
        if flat_exists is None:
            raise not_found_exception(f"Flat with id={body.flat_id} does not exist.")

    elif role_name == "Vendor":
        if body.company_name is None:
            raise bad_request_exception("company_name is required for Vendor registration.")
        if body.capacity is None:
            raise bad_request_exception("capacity is required for Vendor registration.")
        if body.capacity < 0:
            raise bad_request_exception("capacity must be >= 0.")
        if not body.trade_ids:
            raise bad_request_exception("trade_ids (non-empty) is required for Vendor registration.")

        all_valid = await verify_trade_ids(conn, body.trade_ids)
        if not all_valid:
            raise bad_request_exception("One or more trade_ids do not exist.")

    # ── 3. Email uniqueness check ─────────────────────────────────────────────
    existing = await get_user_by_email(conn, body.email)
    if existing is not None:
        raise conflict_exception(f"Email '{body.email}' is already registered.")

    # ── 4. Hash password ──────────────────────────────────────────────────────
    password_hash = hash_password(body.password)

    # ── 5. Persist (single transaction per helper) ────────────────────────────
    if role_name == "Resident":
        user_id = await create_user_resident(conn, body, password_hash)
    elif role_name == "Vendor":
        user_id = await create_user_vendor(conn, body, password_hash)
    else:
        user_id = await create_user_basic(conn, body, password_hash)

    # ── 6. Issue tokens ───────────────────────────────────────────────────────
    return _build_token_response(user_id, body.full_name, role_name)


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, conn=Depends(get_conn)) -> TokenResponse:
    """
    Authenticate with email + password.

    Returns HTTP 401 for any of:
    - Email not found
    - Wrong password
    - Account inactive
    """

    user = await get_user_by_email(conn, body.email)

    # Deliberate: same error for "not found" and "wrong password" to prevent
    # user enumeration.
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise credentials_exception

    if not user["is_active"]:
        raise credentials_exception

    return _build_token_response(
        user["user_id"],
        user["full_name"],
        user["role_name"],
        zone_id=user.get("zone_id"),
        zone_name=user.get("zone_name"),
    )


# ── GET /auth/me ─────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserProfileOut)
async def get_my_profile(current_user: dict = Depends(get_current_user)) -> UserProfileOut:
    """Return the profile and role details of the currently authenticated user."""
    return UserProfileOut(
        user_id=current_user["user_id"],
        full_name=current_user["full_name"],
        email=current_user["email"],
        role=current_user["role_name"],
        zone_id=current_user.get("zone_id"),
        zone_name=current_user.get("zone_name"),
    )
