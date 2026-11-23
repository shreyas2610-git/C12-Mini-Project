from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.schemas.complaints import (
    # ZM schemas
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
    # Coordinator / Resident schemas
    AddRoleRequest,
    ChangeCategoryRequest,
    CloseInvalidRequest,
    ComplaintCreate,
    ComplaintDetail,
    ComplaintSummary,
    ConfirmFixRequest,
    DisputeRequest,
    RejectFixRequest,
    ReplyClarificationRequest,
    RequestClarificationRequest,
    RouteRequest,
)
from app.auth.dependencies import get_current_user
from app.auth.scopes import require_role
from app.core.exceptions import bad_request_exception, forbidden_exception, not_found_exception
from app.data_access.complaints import (
    # ZM data access
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
    # Coordinator / Resident data access
    add_ticket_role,
    coordinator_change_category,
    coordinator_close_duplicate,
    coordinator_close_invalid,
    coordinator_confirm_and_route,
    coordinator_hand_off,
    coordinator_request_clarification,
    create_complaint,
    get_complaint_detail,
    list_complaints,
    resident_confirm_fix,
    resident_dispute,
    resident_reject_fix,
    resident_reply,
    resident_withdraw,
)
from app.data_access.session import get_conn

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_effective_zone(current_user: dict[str, Any]) -> int:
    """Return caller's zone_id, defaulting to 1 for unassigned ZMs in development."""
    zone_id = current_user.get("zone_id")
    if zone_id is not None:
        return int(zone_id)
    if current_user.get("role_name") == "ZM":
        return 1
    return 1


# ══════════════════════════════════════════════════════════════════════════════
# ZM — read-only endpoints  (must be declared BEFORE /{complaint_id} catch-all)
# ══════════════════════════════════════════════════════════════════════════════

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


# ── GET /complaints/queue ─────────────────────────────────────────────────────
# ZM queue (priority-scored) — also used by Coordinator triage

@router.get("/queue", response_model=list[ComplaintOut])
async def get_zm_queue_endpoint(
    limit: int = Query(50, ge=1, le=100),
    zone_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
    conn=Depends(get_conn),
) -> list[ComplaintOut]:
    role = current_user.get("role_name")

    # ZM/GM use their zone; Coordinators may optionally filter by zone
    if role in ("ZM", "GM"):
        effective_zone = _get_effective_zone(current_user)
        items = await get_zm_queue(conn, zone_id=effective_zone, limit=limit)
        return [ComplaintOut(**item) for item in items]

    if role == "Coordinator":
        rows = await list_complaints(
            conn,
            handler="Coordinator",
            status="Reported",
            zone_id=zone_id,
            queue_mode=True,
        )
        return [ComplaintOut(**r) for r in rows]

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


# ══════════════════════════════════════════════════════════════════════════════
# Resident / Coordinator — submit & list complaints
# ══════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED,
             summary="Submit a new complaint")
async def submit_complaint(
    payload: ComplaintCreate,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, Any]:
    """Resident submits a new complaint."""
    if user["role_name"] != "Resident":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Residents can submit new complaints.",
        )
    complaint_id = await create_complaint(conn, user, payload)
    return {"complaint_id": complaint_id, "message": "Complaint registered successfully."}


@router.get("", response_model=list[ComplaintSummary], summary="List complaints")
async def get_complaints(
    status_filter: Optional[str] = Query(None, alias="status"),
    phase_filter: Optional[str] = Query(None, alias="phase"),
    zone_id: Optional[int] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> list[ComplaintSummary]:
    """
    List complaints within caller's scope:
    - Resident: only complaints raised by caller.
    - Coordinator / Staff: all township complaints.
    """
    raised_by = user["user_id"] if user["role_name"] == "Resident" else None
    handler = "Coordinator" if user["role_name"] == "Coordinator" and status_filter == "Reported" else None

    rows = await list_complaints(
        conn,
        raised_by=raised_by,
        handler=handler,
        status=status_filter,
        phase=phase_filter,
        zone_id=zone_id,
        queue_mode=False,
    )
    return [ComplaintSummary(**r) for r in rows]


# ── GET /complaints/{id} ──────────────────────────────────────────────────────
# Unified detail view — ZM gets full ZM view, others get standard detail

@router.get("/{complaint_id}", response_model=ComplaintDetail, summary="Get complaint details")
async def get_complaint(
    complaint_id: int,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> ComplaintDetail:
    """Returns single complaint details with roles, attachments, and timeline."""
    is_resident = user["role_name"] == "Resident"
    data = await get_complaint_detail(conn, complaint_id, user_id=user["user_id"], is_resident=is_resident)
    if not data:
        raise not_found_exception(f"Complaint {complaint_id} not found or access denied.")
    return ComplaintDetail(**data)


# ══════════════════════════════════════════════════════════════════════════════
# Resident Actions
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/{complaint_id}/reply", summary="Resident replies to clarification")
async def reply_clarification(
    complaint_id: int,
    body: ReplyClarificationRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only residents can reply to clarification.")
    await resident_reply(conn, complaint_id, user, body.reply_text)
    return {"message": "Clarification submitted successfully."}


@router.post("/{complaint_id}/withdraw", summary="Resident withdraws complaint")
async def withdraw_complaint(
    complaint_id: int,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only residents can withdraw their complaints.")
    await resident_withdraw(conn, complaint_id, user)
    return {"message": "Complaint withdrawn."}


@router.post("/{complaint_id}/confirm-fix", summary="Resident confirms fix")
async def confirm_fix(
    complaint_id: int,
    body: ConfirmFixRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only residents can confirm fix.")
    await resident_confirm_fix(conn, complaint_id, user, body.note)
    return {"message": "Fix confirmed and complaint closed."}


@router.post("/{complaint_id}/reject-fix", summary="Resident rejects fix / requests rework")
async def reject_fix(
    complaint_id: int,
    body: RejectFixRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only residents can reject fix.")
    await resident_reject_fix(conn, complaint_id, user, body.reason)
    return {"message": "Fix rejected. Complaint routed for rework or escalation."}


@router.post("/{complaint_id}/dispute", summary="Resident disputes closure")
async def dispute_closure(
    complaint_id: int,
    body: DisputeRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only residents can dispute closures.")
    await resident_dispute(conn, complaint_id, user, body.reason)
    return {"message": "Dispute lodged successfully."}


# ══════════════════════════════════════════════════════════════════════════════
# Coordinator Actions
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/{complaint_id}/request-clarification", summary="Coordinator requests clarification")
async def request_clarification(
    complaint_id: int,
    body: RequestClarificationRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_request_clarification(conn, complaint_id, user, body.question)
    return {"message": "Clarification requested from resident."}


@router.post("/{complaint_id}/close-invalid", summary="Coordinator closes ticket as invalid")
async def close_invalid(
    complaint_id: int,
    body: CloseInvalidRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_close_invalid(conn, complaint_id, user, body.reason)
    return {"message": "Complaint closed as Invalid."}


@router.post("/{complaint_id}/confirm", summary="Coordinator confirms genuine and routes ticket")
async def confirm_and_route(
    complaint_id: int,
    body: RouteRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_confirm_and_route(conn, complaint_id, user, body.zone_id, body.note)
    return {"message": "Complaint confirmed and routed to Zone Manager / GM."}


@router.post("/{complaint_id}/handoff", summary="Coordinator hands off ticket to ZM/GM without confirming")
async def hand_off(
    complaint_id: int,
    body: RouteRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_hand_off(conn, complaint_id, user, body.zone_id, body.note)
    return {"message": "Complaint handed off to Zone Manager / GM."}


@router.patch("/{complaint_id}/category", summary="Coordinator changes category")
async def change_category(
    complaint_id: int,
    body: ChangeCategoryRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_change_category(conn, complaint_id, user, body.category_id)
    return {"message": "Category updated and SLAs recomputed."}


@router.post("/{complaint_id}/roles", summary="Add trade role to ticket")
async def add_role(
    complaint_id: int,
    body: AddRoleRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "ZM", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await add_ticket_role(conn, complaint_id, user, body.trade_id)
    return {"message": "Trade role added to complaint."}


# ── Coordinator: close-duplicate ──────────────────────────────────────────────
# Note: ZM uses /close-duplicate via zm_close_duplicate; Coordinator has own handler below

@router.post("/{complaint_id}/close-duplicate", summary="Close ticket as duplicate")
async def close_duplicate(
    complaint_id: int,
    body: CloseDuplicateRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, Any]:
    role = user["role_name"]

    if role in ("ZM", "GM"):
        # ZM workflow (T7)
        zone_id = _get_effective_zone(user)
        updated = await zm_close_duplicate(
            conn,
            complaint_id=complaint_id,
            current_version=body.version,
            original_id=body.original_id,
            user_id=user["user_id"],
            zone_id=zone_id,
        )
        from app.api.schemas.complaints import ComplaintOut
        return ComplaintOut(**updated).model_dump()

    if role in ("Coordinator",):
        await coordinator_close_duplicate(conn, complaint_id, user, body.duplicate_of, body.reason)
        return {"message": f"Complaint closed as Duplicate of #{body.duplicate_of}."}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


# ══════════════════════════════════════════════════════════════════════════════
# ZM Write Actions  (T10–T13, T15, T21, T22, T24, T37, T38)
# ══════════════════════════════════════════════════════════════════════════════

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


# ── POST /complaints/{id}/zm-confirm (T11) ───────────────────────────────────

@router.post("/{complaint_id}/zm-confirm", response_model=ComplaintOut)
async def zm_confirm_endpoint(
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
