from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Lookup Schemas ────────────────────────────────────────────────────────────

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


# ── Complaint Intake & Listing ────────────────────────────────────────────────

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


# ── Workflow Requests ─────────────────────────────────────────────────────────

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


class CloseDuplicateRequest(BaseModel):
    duplicate_of: int
    reason: Optional[str] = None


class RouteRequest(BaseModel):
    zone_id: Optional[int] = None
    note: Optional[str] = None


class ChangeCategoryRequest(BaseModel):
    category_id: int


class AddRoleRequest(BaseModel):
    trade_id: int

