from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    """Payload accepted by POST /auth/register."""

    full_name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=20)
    password: str = Field(..., min_length=8)
    role_id: int

    # Resident-only fields
    flat_id: int | None = None

    # Vendor-only fields
    company_name: str | None = None
    capacity: int | None = None       # must be >= 0 when provided
    trade_ids: list[int] | None = None  # must be non-empty when provided

    @model_validator(mode="after")
    def check_role_fields(self) -> "RegisterRequest":
        """
        High-level cross-field validation.
        Detailed role-name-based validation is deferred to the route handler
        (where we can look up role names from the database).
        """
        if self.capacity is not None and self.capacity < 0:
            raise ValueError("capacity must be >= 0")
        if self.trade_ids is not None and len(self.trade_ids) == 0:
            raise ValueError("trade_ids must be a non-empty list")
        return self


class LoginRequest(BaseModel):
    """Payload accepted by POST /auth/login."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Returned by both /register and /login."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    full_name: str
    role: str
    zone_id: int | None = None
    zone_name: str | None = None


class UserProfileOut(BaseModel):
    user_id: int
    full_name: str
    email: EmailStr
    role: str
    zone_id: int | None = None
    zone_name: str | None = None


class TowerOut(BaseModel):
    tower_id: int
    name: str


class FlatOut(BaseModel):
    flat_id: int
    flat_number: str


class TradeOut(BaseModel):
    trade_id: int
    name: str
