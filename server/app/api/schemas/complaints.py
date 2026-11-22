from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Lookups ───────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    category_id: int
    name: str
    severity: str
    level: int
    severity_points: int
    response_sla_h: int
    resolution_sla_h: int
    is_sensitive: bool
    default_trade_id: Optional[int] = None
    trade_name: Optional[str] = None


class CommonAreaOut(BaseModel):
    common_area_id: int
    name: str
    zone_id: int
    zone_name: str


# ── Role & History & Attachment Schemas ────────────────────────────────────────

class TicketRoleOut(BaseModel):
    ticket_role_id: int
    trade_id: int
    trade_name: str
    vendor_id: Optional[int] = None
    company_name: Optional[str] = None
    role_status: str


class RoleItem(BaseModel):
    ticket_role_id: int
    trade_id: int
    trade_name: str
    vendor_id: int | None = None
    vendor_name: str | None = None
    role_status: str
    done_note: str | None = None


class StatusHistoryOut(BaseModel):
    history_id: int
    event_type: str
    from_value: Optional[str] = None
    to_value: str
    actor_role_name: str
    reason: Optional[str] = None
    occurred_at: datetime


class AttachmentOut(BaseModel):
    attachment_id: int
    file_ref: str
    caption: Optional[str] = None
    uploaded_at: datetime


# ── Complaint Models ──────────────────────────────────────────────────────────

class ComplaintCreate(BaseModel):
    category_id: int
    title: Optional[str] = None
    description: str = Field(..., min_length=5)
    location_type: str = "FLAT"  # "FLAT" or "COMMON_AREA"
    common_area_id: Optional[int] = None
    urgent_flag: bool = False
    attachment_url: Optional[str] = None
    caption: Optional[str] = None


class ComplaintSummary(BaseModel):
    complaint_id: int
    title: Optional[str] = None
    description: str
    category_id: int
    category_name: str
    severity: str
    level: int
    priority_score: int
    urgent_flag: bool
    recurring_flag: bool
    escalated_flag: bool
    status: str
    phase: Optional[str] = None
    handler: str
    flat_id: Optional[int] = None
    flat_number: Optional[str] = None
    tower_name: Optional[str] = None
    common_area_id: Optional[int] = None
    common_area_name: Optional[str] = None
    zone_id: int
    zone_name: str
    submitted_at: datetime
    response_due_at: datetime
    resolution_due_at: Optional[datetime] = None
    clarification_question: Optional[str] = None
    clarification_reply: Optional[str] = None
    clarification_due_at: Optional[datetime] = None
    reopen_count: int
    resolution: Optional[str] = None
    resolution_note: Optional[str] = None
    roles: list[TicketRoleOut] = []


class ComplaintDetail(ComplaintSummary):
    history: list[StatusHistoryOut] = []
    attachments: list[AttachmentOut] = []


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


# ── Workflow Request Payloads ─────────────────────────────────────────────────

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
    version: Optional[int] = 1
    original_id: Optional[int] = None
    duplicate_of: Optional[int] = None
    reason: Optional[str] = None


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


class ReplyClarificationRequest(BaseModel):
    reply_text: str = Field(..., min_length=2)


class ConfirmFixRequest(BaseModel):
    note: Optional[str] = None


class RejectFixRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class DisputeRequest(BaseModel):
    reason: str = Field(..., min_length=5)


class RequestClarificationRequest(BaseModel):
    question: str = Field(..., min_length=5)


class CloseInvalidRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class RouteRequest(BaseModel):
    zone_id: Optional[int] = None
    note: Optional[str] = None


class ChangeCategoryRequest(BaseModel):
    category_id: int


class AddRoleRequest(BaseModel):
    trade_id: int
