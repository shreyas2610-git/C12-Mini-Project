from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.schemas.complaints import (
    AddRoleRequest,
    ChangeCategoryRequest,
    CloseDuplicateRequest,
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
from app.core.exceptions import bad_request_exception, not_found_exception
from app.data_access.complaints import (
    add_ticket_role,
    coordinator_change_category,
    coordinator_close_duplicate,
    coordinator_close_invalid,
    coordinator_confirm_and_route,
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


# ── Complaint Intake & Listing ────────────────────────────────────────────────

@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED, summary="Submit a new complaint")
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


@router.get("/queue", response_model=list[ComplaintSummary], summary="Coordinator Triage Queue")
async def get_triage_queue(
    zone_id: Optional[int] = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> list[ComplaintSummary]:
    """Returns reported triage complaints ordered by priority score and response SLA."""
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Coordinators and GM.",
        )

    rows = await list_complaints(
        conn,
        handler="Coordinator",
        status="Reported",
        zone_id=zone_id,
        queue_mode=True,
    )
    return [ComplaintSummary(**r) for r in rows]


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


# ── Resident Actions ──────────────────────────────────────────────────────────

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


# ── Coordinator Actions ───────────────────────────────────────────────────────

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


@router.post("/{complaint_id}/close-duplicate", summary="Coordinator closes ticket as duplicate")
async def close_duplicate(
    complaint_id: int,
    body: CloseDuplicateRequest,
    user: dict[str, Any] = Depends(get_current_user),
    conn=Depends(get_conn),
) -> dict[str, str]:
    if user["role_name"] not in ("Coordinator", "GM"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    await coordinator_close_duplicate(conn, complaint_id, user, body.duplicate_of, body.reason)
    return {"message": f"Complaint closed as Duplicate of #{body.duplicate_of}."}


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

