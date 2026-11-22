from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query

from app.api.schemas.complaints import (
    AssignRequest,
    CloseDuplicateRequest,
    ComplaintListResponse,
    ComplaintOut,
    ConfirmRequest,
    DashboardStatsOut,
    DisputeDecisionRequest,
    EscalateRequest,
    PatchAssignmentRequest,
    ReworkRequest,
    SendBackRequest,
    TakeOverRequest,
    VendorOut,
    VerifyRequest,
)
from app.auth.dependencies import get_current_user
from app.auth.scopes import require_role
from app.core.exceptions import forbidden_exception, not_found_exception
from app.data_access.complaints import (
    get_all_vendors_with_trades,
    get_complaint_by_id,
    get_zone_complaints,
    get_zone_dashboard_metrics,
    get_zm_queue,
    zm_assign_vendors,
    zm_close_duplicate,
    zm_confirm,
    zm_escalate,
    zm_handle_dispute,
    zm_rework,
    zm_send_back,
    zm_take_over,
    zm_verify,
)
from app.data_access.session import get_conn

router = APIRouter()


def _get_effective_zone(current_user: dict[str, Any]) -> int:
    """Return caller's zone_id, defaulting to 1 for unassigned ZMs in development."""
    zone_id = current_user.get("zone_id")
    if zone_id is not None:
        return int(zone_id)
    # If ZM is not yet assigned in the DB, fallback to Zone 1
    if current_user.get("role_name") == "ZM":
        return 1
    return 1


# ── GET /complaints/queue ─────────────────────────────────────────────────────

@router.get("/queue", response_model=list[ComplaintOut])
async def get_queue(
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_role("ZM", "GM", "Coordinator")),
    conn=Depends(get_conn),
) -> list[ComplaintOut]:
    zone_id = _get_effective_zone(current_user)
    items = await get_zm_queue(conn, zone_id=zone_id, limit=limit)
    return [ComplaintOut(**item) for item in items]


# ── GET /complaints/dashboard ─────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStatsOut)
async def get_dashboard(
    current_user: dict = Depends(require_role("ZM", "GM")),
    conn=Depends(get_conn),
) -> DashboardStatsOut:
    zone_id = _get_effective_zone(current_user)
    stats = await get_zone_dashboard_metrics(conn, zone_id=zone_id)
    return DashboardStatsOut(**stats)


# ── GET /complaints/vendors ───────────────────────────────────────────────────

@router.get("/vendors", response_model=list[VendorOut])
async def get_vendors(
    current_user: dict = Depends(require_role("ZM", "GM", "Coordinator")),
    conn=Depends(get_conn),
) -> list[VendorOut]:
    vendors = await get_all_vendors_with_trades(conn)
    return [VendorOut(**v) for v in vendors]


# ── GET /complaints ───────────────────────────────────────────────────────────

@router.get("", response_model=ComplaintListResponse)
async def list_complaints(
    status: str | None = Query(None),
    phase: str | None = Query(None),
    handler: str | None = Query(None),
    priority: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_role("ZM", "GM", "Coordinator", "Resident")),
    conn=Depends(get_conn),
) -> ComplaintListResponse:
    zone_id = _get_effective_zone(current_user)
    items, total = await get_zone_complaints(
        conn,
        zone_id=zone_id,
        status=status,
        phase=phase,
        handler=handler,
        priority=priority,
        page=page,
        page_size=page_size,
    )
    return ComplaintListResponse(
        items=[ComplaintOut(**item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ── GET /complaints/{id} ─────────────────────────────────────────────────────

@router.get("/{complaint_id}", response_model=ComplaintOut)
async def get_single_complaint(
    complaint_id: int,
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    complaint = await get_complaint_by_id(conn, complaint_id, allowed_zone_id=zone_id)
    if not complaint:
        raise not_found_exception("Complaint not found in your zone.")
    return ComplaintOut(**complaint)


# ── POST /complaints/{id}/take-over (T10) ────────────────────────────────────

@router.post("/{complaint_id}/take-over", response_model=ComplaintOut)
async def take_over(
    complaint_id: int,
    payload: TakeOverRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_take_over(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/confirm (T11) ──────────────────────────────────────

@router.post("/{complaint_id}/confirm", response_model=ComplaintOut)
async def confirm(
    complaint_id: int,
    payload: ConfirmRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_confirm(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/send-back (T12 / T13) ──────────────────────────────

@router.post("/{complaint_id}/send-back", response_model=ComplaintOut)
async def send_back(
    complaint_id: int,
    payload: SendBackRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_send_back(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        reason_code=payload.reason_code,
        reason=payload.reason,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/close-duplicate (T7) ───────────────────────────────

@router.post("/{complaint_id}/close-duplicate", response_model=ComplaintOut)
async def close_duplicate(
    complaint_id: int,
    payload: CloseDuplicateRequest,
    current_user: dict = Depends(require_role("ZM", "Coordinator")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_close_duplicate(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        original_id=payload.original_id,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/assign (T15) ───────────────────────────────────────

@router.post("/{complaint_id}/assign", response_model=ComplaintOut)
async def assign(
    complaint_id: int,
    payload: AssignRequest,
    current_user: dict = Depends(require_role("ZM", "Coordinator")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    roles_dicts = [{"trade_id": r.trade_id, "vendor_id": r.vendor_id} for r in payload.roles]
    updated = await zm_assign_vendors(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        priority=payload.priority,
        roles_input=roles_dicts,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/verify (T21) ───────────────────────────────────────

@router.post("/{complaint_id}/verify", response_model=ComplaintOut)
async def verify(
    complaint_id: int,
    payload: VerifyRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_verify(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        user_id=current_user["user_id"],
        zone_id=zone_id,
        note=payload.note,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/rework (T22 / T44) ─────────────────────────────────

@router.post("/{complaint_id}/rework", response_model=ComplaintOut)
async def rework(
    complaint_id: int,
    payload: ReworkRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_rework(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        reason=payload.reason,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/dispute-decision (T37 / T38) ───────────────────────

@router.post("/{complaint_id}/dispute-decision", response_model=ComplaintOut)
async def dispute_decision(
    complaint_id: int,
    payload: DisputeDecisionRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_handle_dispute(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        decision=payload.decision,
        user_id=current_user["user_id"],
        zone_id=zone_id,
        reason=payload.reason,
    )
    return ComplaintOut(**updated)


# ── POST /complaints/{id}/escalate (T24) ─────────────────────────────────────

@router.post("/{complaint_id}/escalate", response_model=ComplaintOut)
async def escalate(
    complaint_id: int,
    payload: EscalateRequest,
    current_user: dict = Depends(require_role("ZM")),
    conn=Depends(get_conn),
) -> ComplaintOut:
    zone_id = _get_effective_zone(current_user)
    updated = await zm_escalate(
        conn,
        complaint_id=complaint_id,
        current_version=payload.version,
        reason=payload.reason,
        user_id=current_user["user_id"],
        zone_id=zone_id,
    )
    return ComplaintOut(**updated)
