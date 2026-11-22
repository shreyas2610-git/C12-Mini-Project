from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class RoleItem(BaseModel):
    ticket_role_id: int
    trade_id: int
    trade_name: str
    vendor_id: int | None = None
    vendor_name: str | None = None
    role_status: str
    done_note: str | None = None


class ComplaintOut(BaseModel):
    complaint_id: int
    title: str | None = None
    description: str
    status: str
    phase: str | None = None
    handler: str
    priority: str | None = None
    priority_score: int | None = None
    submitted_at: datetime
    response_due_at: datetime | None = None
    resolution_due_at: datetime | None = None
    confirm_due_at: datetime | None = None
    zone_id: int
    zone_name: str | None = None
    location_type: str  # 'Flat' or 'CommonArea'
    tower_name: str | None = None
    flat_number: str | None = None
    common_area_name: str | None = None
    category_id: int
    category_name: str | None = None
    category_severity: str | None = None
    confirmed_by: int | None = None
    confirmed_at: datetime | None = None
    send_back_count: int = 0
    send_back_reason: str | None = None
    reopen_count: int = 0
    resolution: str | None = None
    resolution_note: str | None = None
    escalated_flag: bool = False
    recurring_flag: bool = False
    duplicate_of: int | None = None
    version: int = 1
    queue_score: float | None = None
    roles: list[RoleItem] = []


class ComplaintListResponse(BaseModel):
    items: list[ComplaintOut]
    total: int
    page: int
    page_size: int


class RoleAssignInput(BaseModel):
    trade_id: int
    vendor_id: int


class AssignRequest(BaseModel):
    version: int
    priority: str = Field(..., pattern="^(Low|Medium|High|Critical)$")
    roles: list[RoleAssignInput]


class PatchAssignmentRequest(BaseModel):
    version: int
    reason: str
    priority: str | None = Field(default=None, pattern="^(Low|Medium|High|Critical)$")
    roles: list[RoleAssignInput] | None = None


class TakeOverRequest(BaseModel):
    version: int


class ConfirmRequest(BaseModel):
    version: int


class SendBackRequest(BaseModel):
    version: int
    reason_code: str = Field(..., pattern="^(Wrong zone|Not genuine)$")
    reason: str


class CloseDuplicateRequest(BaseModel):
    version: int
    original_id: int


class VerifyRequest(BaseModel):
    version: int
    note: str | None = None


class ReworkRequest(BaseModel):
    version: int
    reason: str


class DisputeDecisionRequest(BaseModel):
    version: int
    decision: str = Field(..., pattern="^(uphold|reject)$")
    reason: str | None = None


class EscalateRequest(BaseModel):
    version: int
    reason: str


class VendorOut(BaseModel):
    vendor_id: int
    company_name: str
    capacity: int
    current_load: int
    free_slots: int
    trade_ids: list[int]
    trade_names: list[str]


class DashboardStatsOut(BaseModel):
    total_zone_complaints: int
    open_complaints: int
    triage_count: int
    assigned_count: int
    verifying_count: int
    disputed_count: int
    breached_count: int
    zone_id: int
    zone_name: str
