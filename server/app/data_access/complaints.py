from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import asyncpg
from app.core.exceptions import (
    bad_request_exception,
    conflict_exception,
    not_found_exception,
)


def _compute_queue_score(
    submitted_at: datetime,
    response_sla_h: int | None,
    priority: str | None,
    category_severity: str | None,
) -> float:
    """Compute queue score S based on Rule C11."""
    eff_sev = priority or category_severity or "Medium"
    w_map = {"Low": 1.0, "Medium": 2.0, "High": 3.0, "Critical": 4.0}
    w = w_map.get(eff_sev, 2.0)

    target_h = float(response_sla_h or 24)
    now = datetime.now(timezone.utc)
    if submitted_at.tzinfo is None:
        sub_utc = submitted_at.replace(tzinfo=timezone.utc)
    else:
        sub_utc = submitted_at

    elapsed_h = max(0.0, (now - sub_utc).total_seconds() / 3600.0)
    u = elapsed_h / target_h if target_h > 0 else 1.0

    if u < 1.0:
        return round(w * (1.0 + u), 3)
    else:
        return round(10.0 + 10.0 * (u - 1.0) + w, 3)


async def get_complaint_roles(conn: asyncpg.Connection, complaint_id: int) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT 
            tr.ticket_role_id,
            tr.trade_id,
            t.name AS trade_name,
            tr.vendor_id,
            v.company_name AS vendor_name,
            tr.role_status::text AS role_status,
            tr.done_note
        FROM ticket_role tr
        JOIN trade t ON t.trade_id = tr.trade_id
        LEFT JOIN vendor v ON v.vendor_id = tr.vendor_id
        WHERE tr.complaint_id = $1
        ORDER BY tr.ticket_role_id ASC
        """,
        complaint_id,
    )
    return [dict(r) for r in rows]


async def _map_complaint_row(conn: asyncpg.Connection, r: Any) -> dict[str, Any]:
    row = dict(r)
    loc_type = "Flat" if row.get("flat_id") is not None else "CommonArea"
    score = _compute_queue_score(
        row["submitted_at"],
        row.get("response_sla_h"),
        row.get("priority"),
        row.get("category_severity"),
    )
    roles = await get_complaint_roles(conn, row["complaint_id"])

    return {
        "complaint_id": row["complaint_id"],
        "title": row.get("title") or f"Complaint #{row['complaint_id']}",
        "description": row["description"],
        "status": str(row["status"]),
        "phase": str(row["phase"]) if row.get("phase") is not None else None,
        "handler": str(row["handler"]),
        "priority": str(row["priority"]) if row.get("priority") is not None else None,
        "priority_score": row.get("priority_score"),
        "submitted_at": row["submitted_at"],
        "response_due_at": row.get("response_due_at"),
        "resolution_due_at": row.get("resolution_due_at"),
        "confirm_due_at": row.get("confirm_due_at"),
        "zone_id": row["zone_id"],
        "zone_name": row.get("zone_name"),
        "location_type": loc_type,
        "tower_name": row.get("tower_name"),
        "flat_number": row.get("flat_number"),
        "common_area_name": row.get("common_area_name"),
        "category_id": row["category_id"],
        "category_name": row.get("category_name"),
        "category_severity": str(row.get("category_severity")) if row.get("category_severity") is not None else None,
        "confirmed_by": row.get("confirmed_by"),
        "confirmed_at": row.get("confirmed_at"),
        "send_back_count": row.get("send_back_count", 0),
        "send_back_reason": str(row["send_back_reason"]) if row.get("send_back_reason") is not None else None,
        "reopen_count": row.get("reopen_count", 0),
        "resolution": str(row["resolution"]) if row.get("resolution") is not None else None,
        "resolution_note": row.get("resolution_note"),
        "escalated_flag": bool(row.get("escalated_flag", False)),
        "recurring_flag": bool(row.get("recurring_flag", False)),
        "duplicate_of": row.get("duplicate_of"),
        "version": row.get("version", 1),
        "queue_score": score,
        "roles": roles,
    }


async def get_zone_complaints(
    conn: asyncpg.Connection,
    zone_id: int,
    status: str | None = None,
    phase: str | None = None,
    handler: str | None = None,
    priority: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    conditions = ["c.zone_id = $1"]
    params: list[Any] = [zone_id]

    if status:
        params.append(status)
        conditions.append(f"c.status = ${len(params)}")
    if phase:
        params.append(phase)
        conditions.append(f"c.phase::text = ${len(params)}")
    if handler:
        params.append(handler)
        conditions.append(f"c.handler::text = ${len(params)}")
    if priority:
        params.append(priority)
        conditions.append(f"c.priority::text = ${len(params)}")

    where_clause = " AND ".join(conditions)

    count_sql = f"SELECT COUNT(*) FROM complaint c WHERE {where_clause}"
    total = await conn.fetchval(count_sql, *params)

    offset = (page - 1) * page_size
    params.extend([page_size, offset])

    sql = f"""
        SELECT 
            c.*,
            z.name AS zone_name,
            cc.name AS category_name,
            cc.severity::text AS category_severity,
            cc.response_sla_h,
            tw.name AS tower_name,
            f.flat_number,
            ca.name AS common_area_name
        FROM complaint c
        JOIN zone z ON z.zone_id = c.zone_id
        JOIN complaint_category cc ON cc.category_id = c.category_id
        LEFT JOIN flat f ON f.flat_id = c.flat_id
        LEFT JOIN tower tw ON tw.tower_id = f.tower_id
        LEFT JOIN common_area ca ON ca.common_area_id = c.common_area_id
        WHERE {where_clause}
        ORDER BY c.complaint_id DESC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
    """
    rows = await conn.fetch(sql, *params)
    items = [await _map_complaint_row(conn, r) for r in rows]
    return items, total


async def get_complaint_by_id(
    conn: asyncpg.Connection,
    complaint_id: int,
    allowed_zone_id: int | None = None,
) -> dict[str, Any] | None:
    conditions = ["c.complaint_id = $1"]
    params: list[Any] = [complaint_id]

    if allowed_zone_id is not None:
        params.append(allowed_zone_id)
        conditions.append(f"c.zone_id = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            c.*,
            z.name AS zone_name,
            cc.name AS category_name,
            cc.severity::text AS category_severity,
            cc.response_sla_h,
            tw.name AS tower_name,
            f.flat_number,
            ca.name AS common_area_name
        FROM complaint c
        JOIN zone z ON z.zone_id = c.zone_id
        JOIN complaint_category cc ON cc.category_id = c.category_id
        LEFT JOIN flat f ON f.flat_id = c.flat_id
        LEFT JOIN tower tw ON tw.tower_id = f.tower_id
        LEFT JOIN common_area ca ON ca.common_area_id = c.common_area_id
        WHERE {where_clause}
    """
    row = await conn.fetchrow(sql, *params)
    if not row:
        return None
    return await _map_complaint_row(conn, row)


async def get_zm_queue(
    conn: asyncpg.Connection,
    zone_id: int,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Returns tickets in the ZM's zone that require ZM action:
    - handler = 'ZM' and status != 'Closed'
    - or in phase 'Verifying' (all roles done)
    - or in status 'Disputed'
    Ordered by Rule C11 queue_score DESC, submitted_at ASC, complaint_id ASC.
    """
    sql = """
        SELECT 
            c.*,
            z.name AS zone_name,
            cc.name AS category_name,
            cc.severity::text AS category_severity,
            cc.response_sla_h,
            tw.name AS tower_name,
            f.flat_number,
            ca.name AS common_area_name
        FROM complaint c
        JOIN zone z ON z.zone_id = c.zone_id
        JOIN complaint_category cc ON cc.category_id = c.category_id
        LEFT JOIN flat f ON f.flat_id = c.flat_id
        LEFT JOIN tower tw ON tw.tower_id = f.tower_id
        LEFT JOIN common_area ca ON ca.common_area_id = c.common_area_id
        WHERE c.zone_id = $1 
          AND c.status NOT IN ('Closed', 'Withdrawn')
          AND (c.handler = 'ZM' OR c.phase = 'Verifying' OR c.status = 'Disputed')
    """
    rows = await conn.fetch(sql, zone_id)
    items = [await _map_complaint_row(conn, r) for r in rows]

    # Deterministic Rule C11 Sort:
    # 1. queue_score DESC
    # 2. submitted_at ASC
    # 3. complaint_id ASC
    items.sort(
        key=lambda x: (
            -(x["queue_score"] or 0.0),
            x["submitted_at"],
            x["complaint_id"],
        )
    )
    return items[:limit]


# ── ZM Workflow Transitions ───────────────────────────────────────────────────

async def log_status_history(
    conn: asyncpg.Connection,
    complaint_id: int,
    event_type: str,
    from_value: str | None,
    to_value: str | None,
    actor_user_id: int,
    actor_role_id: int = 3,  # 3 = ZM
    reason: str | None = None,
    ticket_role_id: int | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO status_history (
            complaint_id, ticket_role_id, event_type, from_value, to_value,
            actor_role_id, actor_user_id, reason, occurred_at
        ) VALUES ($1, $2, $3::event_type, $4, $5, $6, $7, $8, NOW())
        """,
        complaint_id,
        ticket_role_id,
        event_type,
        from_value,
        to_value,
        actor_role_id,
        actor_user_id,
        reason,
    )


async def zm_take_over(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T10: ZM takes over ticket."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, handler, status, phase, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        from_handler = str(row["handler"])
        await conn.execute(
            """
            UPDATE complaint 
            SET handler = 'ZM',
                zm_acted_at = COALESCE(zm_acted_at, NOW()),
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
        )
        await log_status_history(conn, complaint_id, "HANDLER_CHANGE", from_handler, "ZM", user_id, reason="ZM Take Over")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_confirm(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T11: ZM confirms complaint."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, confirmed_by, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        await conn.execute(
            """
            UPDATE complaint 
            SET confirmed_by = $2,
                confirmed_at = NOW(),
                zm_acted_at = COALESCE(zm_acted_at, NOW()),
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
            user_id,
        )
        await log_status_history(conn, complaint_id, "CONFIRMED", None, str(user_id), user_id, reason="ZM Confirmed")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_send_back(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    reason_code: str,
    reason: str,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T12 / T13: ZM sends back a ticket."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, send_back_count, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        count = row["send_back_count"]
        if count == 0:
            # T12: Send back to Coordinator
            await conn.execute(
                """
                UPDATE complaint 
                SET send_back_count = 1,
                    send_back_reason = $2::sendback_reason,
                    handler = 'Coordinator',
                    confirmed_by = NULL,
                    confirmed_at = NULL,
                    zm_acted_at = NULL,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
                reason_code,
            )
            await log_status_history(conn, complaint_id, "HANDLER_CHANGE", "ZM", "Coordinator", user_id, reason=f"Send back: {reason_code} - {reason}")
        else:
            # T13: Second send-back escalates to GM
            await conn.execute(
                """
                UPDATE complaint 
                SET send_back_count = send_back_count + 1,
                    handler = 'GM',
                    escalated_flag = TRUE,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
            )
            await log_status_history(conn, complaint_id, "HANDLER_CHANGE", "ZM", "GM", user_id, reason=f"Escalated (second send-back): {reason}")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_assign_vendors(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    priority: str,
    roles_input: list[dict[str, int]],
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T15: ZM assigns vendors and priority."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, phase, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        # Check vendor capacities
        for r_in in roles_input:
            v_id = r_in["vendor_id"]
            v_row = await conn.fetchrow("SELECT capacity, current_load, is_active FROM vendor WHERE vendor_id = $1", v_id)
            if not v_row or not v_row["is_active"]:
                raise bad_request_exception(f"Vendor {v_id} is inactive or invalid.")
            if v_row["current_load"] >= v_row["capacity"]:
                raise conflict_exception(f"Vendor {v_id} is already at full capacity.")

        # Update complaint priority, phase = Assigned, confirm stamp if needed
        await conn.execute(
            """
            UPDATE complaint 
            SET priority = $2::severity_level,
                phase = 'Assigned',
                handler = 'ZM',
                zm_acted_at = COALESCE(zm_acted_at, NOW()),
                confirmed_by = COALESCE(confirmed_by, $3),
                confirmed_at = COALESCE(confirmed_at, NOW()),
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
            priority,
            user_id,
        )

        # Clear previous roles and insert new roles
        await conn.execute("DELETE FROM ticket_role WHERE complaint_id = $1", complaint_id)

        offer_interval = "2 hours" if priority == "Critical" else "12 hours"
        for r_in in roles_input:
            await conn.execute(
                f"""
                INSERT INTO ticket_role (
                    complaint_id, trade_id, vendor_id, role_status, assigned_by,
                    offered_at, offer_due_at
                ) VALUES ($1, $2, $3, 'Offered', $4, NOW(), NOW() + INTERVAL '{offer_interval}')
                """,
                complaint_id,
                r_in["trade_id"],
                r_in["vendor_id"],
                user_id,
            )

        await log_status_history(conn, complaint_id, "PHASE_CHANGE", str(row["phase"]), "Assigned", user_id, reason=f"Assigned with priority {priority}")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_verify(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    user_id: int,
    zone_id: int,
    note: str | None = None,
) -> dict[str, Any]:
    """T21: ZM confirms the work is fixed -> Under Review / Confirming."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, phase, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        await conn.execute(
            """
            UPDATE complaint 
            SET status = 'Under Review',
                phase = 'Confirming',
                resolved_at = NOW(),
                confirm_due_at = NOW() + INTERVAL '48 hours',
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
        )
        await log_status_history(conn, complaint_id, "PHASE_CHANGE", str(row["phase"]), "Confirming", user_id, reason=note or "Work verified by ZM")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_rework(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    reason: str,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T22 / T44: ZM rejects work -> Rework (or GM escalation if reopen limit 2 is exceeded)."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, reopen_count, phase, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        reopens = row["reopen_count"] + 1
        if reopens <= 2:
            # T22: Back to In Progress / Assigned
            await conn.execute(
                """
                UPDATE complaint 
                SET status = 'In Progress',
                    phase = 'Assigned',
                    reopen_count = $2,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
                reopens,
            )
            # Reset role statuses for rework
            await conn.execute("UPDATE ticket_role SET role_status = 'Offered' WHERE complaint_id = $1", complaint_id)
            await log_status_history(conn, complaint_id, "PHASE_CHANGE", str(row["phase"]), "Assigned", user_id, reason=f"Rework ordered: {reason}")
        else:
            # T44: Exceeded 2 reopens -> Escalate to GM
            await conn.execute(
                """
                UPDATE complaint 
                SET reopen_count = 2,
                    handler = 'GM',
                    escalated_flag = TRUE,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
            )
            await log_status_history(conn, complaint_id, "HANDLER_CHANGE", "ZM", "GM", user_id, reason=f"Escalated (Reopen limit reached): {reason}")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_handle_dispute(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    decision: str,  # 'uphold' | 'reject'
    user_id: int,
    zone_id: int,
    reason: str | None = None,
) -> dict[str, Any]:
    """T37 / T38: ZM decides resident dispute."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, resolution, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        if decision == "uphold":
            # T37: Uphold dispute -> back to Reported / Triage on ZM desk
            await conn.execute(
                """
                UPDATE complaint 
                SET status = 'Reported',
                    phase = 'Triage',
                    handler = 'ZM',
                    resolution = NULL,
                    resolution_note = NULL,
                    confirmed_by = $2,
                    confirmed_at = NOW(),
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
                user_id,
            )
            await log_status_history(conn, complaint_id, "STATUS_CHANGE", "Disputed", "Reported", user_id, reason=reason or "Dispute upheld by ZM")
        else:
            # T38: Reject dispute -> remains Closed
            await conn.execute(
                """
                UPDATE complaint 
                SET status = 'Closed',
                    resolution_note = $2,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
                reason or "Dispute rejected by ZM",
            )
            await log_status_history(conn, complaint_id, "STATUS_CHANGE", "Disputed", "Closed", user_id, reason=reason or "Dispute rejected by ZM")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_escalate(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    reason: str,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T24: Manual escalation to GM."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, handler, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        from_handler = str(row["handler"])
        await conn.execute(
            """
            UPDATE complaint 
            SET handler = 'GM',
                escalated_flag = TRUE,
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
        )
        await log_status_history(conn, complaint_id, "HANDLER_CHANGE", from_handler, "GM", user_id, reason=f"Escalated to GM: {reason}")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def zm_close_duplicate(
    conn: asyncpg.Connection,
    complaint_id: int,
    current_version: int,
    original_id: int,
    user_id: int,
    zone_id: int,
) -> dict[str, Any]:
    """T7: Close complaint as duplicate of an open original."""
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, zone_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        orig = await conn.fetchrow(
            "SELECT complaint_id, status FROM complaint WHERE complaint_id = $1",
            original_id,
        )
        if not orig:
            raise bad_request_exception(f"Original ticket #{original_id} does not exist.")

        await conn.execute(
            """
            UPDATE complaint 
            SET status = 'Closed',
                phase = NULL,
                resolution = 'Duplicate',
                duplicate_of = $2,
                closed_at = NOW(),
                dispute_due_at = NOW() + INTERVAL '7 days',
                version = version + 1
            WHERE complaint_id = $1
            """,
            complaint_id,
            original_id,
        )
        await log_status_history(conn, complaint_id, "STATUS_CHANGE", "Reported", "Closed", user_id, reason=f"Marked duplicate of #{original_id}")

    return await get_complaint_by_id(conn, complaint_id, zone_id)  # type: ignore


async def get_zone_dashboard_metrics(
    conn: asyncpg.Connection,
    zone_id: int,
) -> dict[str, Any]:
    z_name = await conn.fetchval("SELECT name FROM zone WHERE zone_id = $1", zone_id) or f"Zone {zone_id}"
    
    total = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1", zone_id)
    open_c = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1 AND status NOT IN ('Closed', 'Withdrawn')", zone_id)
    triage = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1 AND phase = 'Triage' AND status = 'Reported'", zone_id)
    assigned = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1 AND phase = 'Assigned'", zone_id)
    verifying = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1 AND phase = 'Verifying'", zone_id)
    disputed = await conn.fetchval("SELECT COUNT(*) FROM complaint WHERE zone_id = $1 AND status = 'Disputed'", zone_id)

    # Breached count: response_due_at passed and no vendor accepted, or resolution_due_at passed
    breached = await conn.fetchval(
        """
        SELECT COUNT(*) FROM complaint 
        WHERE zone_id = $1 
          AND status NOT IN ('Closed', 'Withdrawn')
          AND (
            (first_accepted_at IS NULL AND response_due_at < NOW()) OR
            (first_accepted_at IS NOT NULL AND resolution_due_at IS NOT NULL AND resolution_due_at < NOW())
          )
        """,
        zone_id,
    )

    return {
        "total_zone_complaints": total,
        "open_complaints": open_c,
        "triage_count": triage,
        "assigned_count": assigned,
        "verifying_count": verifying,
        "disputed_count": disputed,
        "breached_count": breached,
        "zone_id": zone_id,
        "zone_name": z_name,
    }


async def get_all_vendors_with_trades(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT 
            v.vendor_id,
            v.company_name,
            v.capacity,
            v.current_load,
            (v.capacity - v.current_load) AS free_slots,
            ARRAY_AGG(t.trade_id) AS trade_ids,
            ARRAY_AGG(t.name) AS trade_names
        FROM vendor v
        JOIN vendor_trade vt ON vt.vendor_id = v.vendor_id
        JOIN trade t ON t.trade_id = vt.trade_id
        WHERE v.is_active = TRUE
        GROUP BY v.vendor_id, v.company_name, v.capacity, v.current_load
        ORDER BY free_slots DESC, v.company_name ASC
        """
    )
    return [dict(r) for r in rows]
