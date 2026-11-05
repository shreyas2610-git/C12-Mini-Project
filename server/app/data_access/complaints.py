from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import asyncpg
from app.core.exceptions import bad_request_exception, not_found_exception


# ── Lookups ───────────────────────────────────────────────────────────────────

async def get_all_categories(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
            c.category_id,
            c.name,
            c.severity::text AS severity,
            c.level,
            c.severity_points,
            c.response_sla_h,
            c.resolution_sla_h,
            c.is_sensitive,
            c.default_trade_id,
            t.name AS trade_name
        FROM complaint_category c
        LEFT JOIN trade t ON t.trade_id = c.default_trade_id
        WHERE c.is_active = TRUE
        ORDER BY c.level DESC, c.name ASC
        """
    )
    return [dict(r) for r in rows]


async def get_all_common_areas(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
            ca.common_area_id,
            ca.name,
            ca.zone_id,
            z.name AS zone_name
        FROM common_area ca
        JOIN zone z ON z.zone_id = ca.zone_id
        ORDER BY z.name, ca.name
        """
    )
    return [dict(r) for r in rows]


# ── Complaint Intake ──────────────────────────────────────────────────────────

async def create_complaint(
    conn: asyncpg.Connection,
    user: dict[str, Any],
    payload: Any,
) -> int:
    """Create a new complaint, calculate SLAs, priority score, and default trade."""
    async with conn.transaction():
        # 1. Resolve Location & Zone
        flat_id: Optional[int] = None
        common_area_id: Optional[int] = None
        zone_id: int

        if payload.location_type == "COMMON_AREA":
            if not payload.common_area_id:
                raise bad_request_exception("common_area_id is required when location_type is COMMON_AREA.")
            ca_row = await conn.fetchrow(
                "SELECT zone_id FROM common_area WHERE common_area_id = $1",
                payload.common_area_id,
            )
            if not ca_row:
                raise not_found_exception(f"Common area id={payload.common_area_id} not found.")
            common_area_id = payload.common_area_id
            zone_id = ca_row["zone_id"]
        else:
            # Flat location
            if not user.get("flat_id"):
                raise bad_request_exception("Current user does not have an assigned flat.")
            flat_id = user["flat_id"]
            zone_id = user["zone_id"]

        # 2. Resolve Category & SLA details
        cat = await conn.fetchrow(
            """
            SELECT
                category_id,
                name,
                severity,
                level,
                severity_points,
                response_sla_h,
                resolution_sla_h,
                is_sensitive,
                default_trade_id
            FROM complaint_category
            WHERE category_id = $1 AND is_active = TRUE
            """,
            payload.category_id,
        )
        if not cat:
            raise not_found_exception(f"Category id={payload.category_id} not found or inactive.")

        # 3. Calculate initial Priority Score:
        # Score = (12 * level) + urgent(15)
        severity_points: int = cat["severity_points"]
        urgent_boost = 15 if payload.urgent_flag else 0
        priority_score = severity_points + urgent_boost

        # 4. Routing & Initial State
        now = datetime.now(timezone.utc)
        response_due_at = now + timedelta(hours=cat["response_sla_h"])
        resolution_due_at = now + timedelta(hours=cat["resolution_sla_h"])

        handler = "GM" if cat["is_sensitive"] else "Coordinator"
        phase = "Triage"
        status = "Reported"
        title = (payload.title or "").strip() or cat["name"]

        # 5. Insert Complaint
        complaint_row = await conn.fetchrow(
            """
            INSERT INTO complaint (
                raised_by,
                title,
                description,
                flat_id,
                common_area_id,
                zone_id,
                category_id,
                priority,
                urgent_flag,
                status,
                phase,
                handler,
                response_due_at,
                resolution_due_at,
                priority_score
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            RETURNING complaint_id
            """,
            user["user_id"],
            title,
            payload.description,
            flat_id,
            common_area_id,
            zone_id,
            cat["category_id"],
            cat["severity"],
            payload.urgent_flag,
            status,
            phase,
            handler,
            response_due_at,
            resolution_due_at,
            priority_score,
        )
        complaint_id: int = complaint_row["complaint_id"]

        # 6. Create default Ticket Role if trade assigned
        if cat["default_trade_id"]:
            await conn.execute(
                """
                INSERT INTO ticket_role (complaint_id, trade_id, role_status)
                VALUES ($1, $2, 'Open')
                ON CONFLICT (complaint_id, trade_id) DO NOTHING
                """,
                complaint_id,
                cat["default_trade_id"],
            )

        # 7. Attachment if provided
        if payload.attachment_url:
            await conn.execute(
                """
                INSERT INTO attachment (complaint_id, uploaded_by, file_ref, caption)
                VALUES ($1, $2, $3, $4)
                """,
                complaint_id,
                user["user_id"],
                payload.attachment_url,
                payload.caption,
            )

        # 8. Initial Status History record
        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id,
                event_type,
                from_value,
                to_value,
                actor_role_id,
                actor_user_id,
                reason
            )
            VALUES ($1, 'STATUS_CHANGE', NULL, 'Reported', $2, $3, 'Complaint submitted by resident')
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
        )

        return complaint_id


# ── Listing Complaints ────────────────────────────────────────────────────────

async def list_complaints(
    conn: asyncpg.Connection,
    raised_by: Optional[int] = None,
    handler: Optional[str] = None,
    status: Optional[str] = None,
    phase: Optional[str] = None,
    zone_id: Optional[int] = None,
    queue_mode: bool = False,
) -> list[dict[str, Any]]:
    query = """
        SELECT
            c.complaint_id,
            c.title,
            c.description,
            c.category_id,
            cat.name AS category_name,
            cat.severity::text AS severity,
            cat.level,
            c.priority_score,
            c.urgent_flag,
            c.recurring_flag,
            c.escalated_flag,
            c.status,
            c.phase::text AS phase,
            c.handler::text AS handler,
            c.flat_id,
            f.flat_number,
            t.name AS tower_name,
            c.common_area_id,
            ca.name AS common_area_name,
            c.zone_id,
            z.name AS zone_name,
            c.submitted_at,
            c.response_due_at,
            c.resolution_due_at,
            c.clarification_question,
            c.clarification_reply,
            c.clarification_due_at,
            c.reopen_count,
            c.resolution::text AS resolution,
            c.resolution_note
        FROM complaint c
        JOIN complaint_category cat ON cat.category_id = c.category_id
        JOIN zone z ON z.zone_id = c.zone_id
        LEFT JOIN flat f ON f.flat_id = c.flat_id
        LEFT JOIN tower t ON t.tower_id = f.tower_id
        LEFT JOIN common_area ca ON ca.common_area_id = c.common_area_id
        WHERE 1=1
    """
    params: list[Any] = []
    p_idx = 1

    if raised_by is not None:
        query += f" AND c.raised_by = ${p_idx}"
        params.append(raised_by)
        p_idx += 1

    if handler is not None:
        query += f" AND c.handler::text = ${p_idx}"
        params.append(handler)
        p_idx += 1

    if status is not None:
        query += f" AND c.status = ${p_idx}"
        params.append(status)
        p_idx += 1

    if phase is not None:
        query += f" AND c.phase::text = ${p_idx}"
        params.append(phase)
        p_idx += 1

    if zone_id is not None:
        query += f" AND c.zone_id = ${p_idx}"
        params.append(zone_id)
        p_idx += 1

    if queue_mode:
        # Coordinator Triage Queue: Reported tickets for coordinator ordered by priority_score DESC
        query += " ORDER BY c.priority_score DESC, c.response_due_at ASC, c.submitted_at DESC"
    else:
        query += " ORDER BY c.submitted_at DESC"

    rows = await conn.fetch(query, *params)
    complaints = [dict(r) for r in rows]

    if not complaints:
        return []

    # Attach Ticket Roles in bulk
    c_ids = [c["complaint_id"] for c in complaints]
    role_rows = await conn.fetch(
        """
        SELECT
            tr.ticket_role_id,
            tr.complaint_id,
            tr.trade_id,
            t.name AS trade_name,
            tr.vendor_id,
            v.company_name,
            tr.role_status::text AS role_status
        FROM ticket_role tr
        JOIN trade t ON t.trade_id = tr.trade_id
        LEFT JOIN vendor v ON v.vendor_id = tr.vendor_id
        WHERE tr.complaint_id = ANY($1::int[])
        ORDER BY t.name
        """,
        c_ids,
    )
    role_map: dict[int, list[dict[str, Any]]] = {}
    for r in role_rows:
        cid = r["complaint_id"]
        role_map.setdefault(cid, []).append({
            "ticket_role_id": r["ticket_role_id"],
            "trade_id": r["trade_id"],
            "trade_name": r["trade_name"],
            "vendor_id": r["vendor_id"],
            "company_name": r["company_name"],
            "role_status": r["role_status"],
        })

    for c in complaints:
        c["roles"] = role_map.get(c["complaint_id"], [])

    return complaints


# ── Complaint Detail ──────────────────────────────────────────────────────────

async def get_complaint_detail(
    conn: asyncpg.Connection,
    complaint_id: int,
    user_id: Optional[int] = None,
    is_resident: bool = False,
) -> Optional[dict[str, Any]]:
    row = await conn.fetchrow(
        """
        SELECT
            c.complaint_id,
            c.raised_by,
            c.title,
            c.description,
            c.category_id,
            cat.name AS category_name,
            cat.severity::text AS severity,
            cat.level,
            c.priority_score,
            c.urgent_flag,
            c.recurring_flag,
            c.escalated_flag,
            c.status,
            c.phase::text AS phase,
            c.handler::text AS handler,
            c.flat_id,
            f.flat_number,
            t.name AS tower_name,
            c.common_area_id,
            ca.name AS common_area_name,
            c.zone_id,
            z.name AS zone_name,
            c.submitted_at,
            c.response_due_at,
            c.resolution_due_at,
            c.clarification_question,
            c.clarification_reply,
            c.clarification_due_at,
            c.reopen_count,
            c.resolution::text AS resolution,
            c.resolution_note
        FROM complaint c
        JOIN complaint_category cat ON cat.category_id = c.category_id
        JOIN zone z ON z.zone_id = c.zone_id
        LEFT JOIN flat f ON f.flat_id = c.flat_id
        LEFT JOIN tower t ON t.tower_id = f.tower_id
        LEFT JOIN common_area ca ON ca.common_area_id = c.common_area_id
        WHERE c.complaint_id = $1
        """,
        complaint_id,
    )
    if not row:
        return None

    complaint = dict(row)
    if is_resident and user_id and complaint["raised_by"] != user_id:
        return None

    # Roles
    roles = await conn.fetch(
        """
        SELECT
            tr.ticket_role_id,
            tr.trade_id,
            t.name AS trade_name,
            tr.vendor_id,
            v.company_name,
            tr.role_status::text AS role_status
        FROM ticket_role tr
        JOIN trade t ON t.trade_id = tr.trade_id
        LEFT JOIN vendor v ON v.vendor_id = tr.vendor_id
        WHERE tr.complaint_id = $1
        ORDER BY t.name
        """,
        complaint_id,
    )
    complaint["roles"] = [dict(r) for r in roles]

    # Attachments
    attachments = await conn.fetch(
        """
        SELECT attachment_id, file_ref, caption, uploaded_at
        FROM attachment
        WHERE complaint_id = $1
        ORDER BY uploaded_at ASC
        """,
        complaint_id,
    )
    complaint["attachments"] = [dict(a) for a in attachments]

    # Status History
    history = await conn.fetch(
        """
        SELECT
            sh.history_id,
            sh.event_type::text AS event_type,
            sh.from_value,
            sh.to_value,
            r.name AS actor_role_name,
            sh.reason,
            sh.occurred_at
        FROM status_history sh
        JOIN role r ON r.role_id = sh.actor_role_id
        WHERE sh.complaint_id = $1
        ORDER BY sh.occurred_at ASC
        """,
        complaint_id,
    )
    complaint["history"] = [dict(h) for h in history]

    return complaint


# ── Resident Actions ──────────────────────────────────────────────────────────

async def resident_reply(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    reply_text: str,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, phase::text as phase FROM complaint WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["raised_by"] != user["user_id"]:
            raise bad_request_exception("You can only reply to your own complaints.")
        if c["phase"] != "Awaiting Resident":
            raise bad_request_exception("Complaint is not currently awaiting resident clarification.")

        # Update complaint: set reply, clear question, transition back to Triage
        await conn.execute(
            """
            UPDATE complaint
            SET
                clarification_reply = $1,
                phase = 'Triage',
                clarification_due_at = NULL
            WHERE complaint_id = $2
            """,
            reply_text,
            complaint_id,
        )

        # End resident hold
        await conn.execute(
            """
            UPDATE resident_hold
            SET ended_at = NOW()
            WHERE complaint_id = $1 AND ended_at IS NULL
            """,
            complaint_id,
        )

        # Log History
        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'PHASE_CHANGE', 'Awaiting Resident', 'Triage', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            f"Resident provided clarification: {reply_text}",
        )


async def resident_withdraw(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, status FROM complaint WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["raised_by"] != user["user_id"]:
            raise bad_request_exception("You can only withdraw your own complaints.")
        if c["status"] != "Reported":
            raise bad_request_exception("Complaints can only be withdrawn while in Reported status.")

        await conn.execute(
            """
            UPDATE complaint
            SET
                status = 'Closed',
                resolution = 'Withdrawn',
                phase = NULL,
                closed_at = NOW()
            WHERE complaint_id = $1
            """,
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'STATUS_CHANGE', 'Reported', 'Closed', $2, $3, 'Withdrawn by resident')
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
        )


async def resident_confirm_fix(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    note: Optional[str] = None,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, status, phase::text as phase FROM complaint WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["raised_by"] != user["user_id"]:
            raise bad_request_exception("You can only confirm fixes for your own complaints.")
        if c["phase"] != "Confirming" and c["status"] not in ("Under Review", "Completed"):
            raise bad_request_exception("Complaint is not currently awaiting confirmation.")

        await conn.execute(
            """
            UPDATE complaint
            SET
                status = 'Closed',
                resolution = 'Fixed',
                phase = NULL,
                confirmed_by = $1,
                confirmed_at = NOW(),
                closed_at = NOW(),
                resolution_note = $2
            WHERE complaint_id = $3
            """,
            user["user_id"],
            note or "Resident confirmed fix.",
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'CONFIRMED', 'Under Review', 'Closed', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            note or "Resident confirmed fix.",
        )


async def resident_reject_fix(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    reason: str,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, phase::text as phase, reopen_count, level FROM complaint c JOIN complaint_category cat ON cat.category_id = c.category_id WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["raised_by"] != user["user_id"]:
            raise bad_request_exception("You can only reject fixes on your own complaints.")
        if c["phase"] != "Confirming":
            raise bad_request_exception("Complaint is not currently awaiting confirmation.")

        reopen_count = c["reopen_count"] + 1

        if reopen_count > 2:
            # Reopen limit exceeded: escalate directly to GM
            await conn.execute(
                """
                UPDATE complaint
                SET
                    status = 'Escalated',
                    handler = 'GM',
                    escalated_flag = TRUE,
                    reopen_count = $1,
                    phase = 'Working'
                WHERE complaint_id = $2
                """,
                reopen_count,
                complaint_id,
            )
            to_val = "Escalated to GM (rework limit reached)"
        else:
            # Return to In Progress / Assigned for vendor rework
            await conn.execute(
                """
                UPDATE complaint
                SET
                    status = 'In Progress',
                    phase = 'Assigned',
                    reopen_count = $1,
                    priority_score = priority_score + 5
                WHERE complaint_id = $2
                """,
                reopen_count,
                complaint_id,
            )
            to_val = "In Progress (Rework)"

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'STATUS_CHANGE', 'Under Review', $2, $3, $4, $5)
            """,
            complaint_id,
            to_val,
            user["role_id"],
            user["user_id"],
            f"Resident rejected fix: {reason}",
        )


async def resident_dispute(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    reason: str,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            """
            SELECT raised_by, status, resolution::text as resolution, closed_at, handler::text as handler
            FROM complaint
            WHERE complaint_id = $1
            """,
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["raised_by"] != user["user_id"]:
            raise bad_request_exception("You can only dispute closures on your own complaints.")
        if c["status"] != "Closed" or c["resolution"] not in ("Duplicate", "Invalid", "Unresolved"):
            raise bad_request_exception("Only Duplicate, Invalid, or Unresolved closures can be disputed.")
        if c["closed_at"] and (datetime.now(timezone.utc) - c["closed_at"]).days > 7:
            raise bad_request_exception("Dispute window (7 days) has expired.")

        target_handler = "GM" if c["handler"] == "GM" else "ZM"

        await conn.execute(
            """
            UPDATE complaint
            SET
                status = 'Disputed',
                handler = $1,
                phase = NULL,
                disputed_at = NOW()
            WHERE complaint_id = $2
            """,
            target_handler,
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'STATUS_CHANGE', 'Closed', 'Disputed', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            f"Resident disputed closure: {reason}",
        )


# ── Coordinator Actions ───────────────────────────────────────────────────────

async def coordinator_request_clarification(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    question: str,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, status, phase::text as phase, handler::text as handler FROM complaint WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")
        if c["status"] != "Reported":
            raise bad_request_exception("Clarification can only be requested on Reported tickets.")

        now = datetime.now(timezone.utc)
        due_at = now + timedelta(hours=72)

        # 1. Update Complaint
        await conn.execute(
            """
            UPDATE complaint
            SET
                phase = 'Awaiting Resident',
                clarification_question = $1,
                clarification_due_at = $2
            WHERE complaint_id = $3
            """,
            question,
            due_at,
            complaint_id,
        )

        # 2. Resident Hold
        await conn.execute(
            """
            INSERT INTO resident_hold (complaint_id, hold_type, started_at)
            VALUES ($1, 'AWAITING_RESIDENT', NOW())
            """,
            complaint_id,
        )

        # 3. Notification to Resident
        await conn.execute(
            """
            INSERT INTO notification (user_id, complaint_id, notification_type, title, message)
            VALUES ($1, $2, 'CLARIFICATION_REQUEST', 'Clarification Requested', $3)
            """,
            c["raised_by"],
            complaint_id,
            question,
        )

        # 4. Status History
        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'PHASE_CHANGE', 'Triage', 'Awaiting Resident', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            question,
        )


async def coordinator_close_invalid(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    reason: str,
) -> None:
    async with conn.transaction():
        await conn.execute(
            """
            UPDATE complaint
            SET
                status = 'Closed',
                resolution = 'Invalid',
                resolution_note = $1,
                phase = NULL,
                closed_at = NOW(),
                dispute_due_at = NOW() + INTERVAL '7 days'
            WHERE complaint_id = $2
            """,
            reason,
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'STATUS_CHANGE', 'Reported', 'Closed', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            f"Marked Invalid by Coordinator: {reason}",
        )


async def coordinator_close_duplicate(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    duplicate_of: int,
    reason: Optional[str] = None,
) -> None:
    async with conn.transaction():
        await conn.execute(
            """
            UPDATE complaint
            SET
                status = 'Closed',
                resolution = 'Duplicate',
                duplicate_of = $1,
                resolution_note = $2,
                phase = NULL,
                closed_at = NOW(),
                dispute_due_at = NOW() + INTERVAL '7 days'
            WHERE complaint_id = $3
            """,
            duplicate_of,
            reason or f"Duplicate of ticket #{duplicate_of}",
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'STATUS_CHANGE', 'Reported', 'Closed', $2, $3, $4)
            """,
            complaint_id,
            user["role_id"],
            user["user_id"],
            reason or f"Marked as duplicate of ticket #{duplicate_of}",
        )


async def coordinator_confirm_and_route(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    zone_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            """
            SELECT c.category_id, cat.is_sensitive, c.zone_id
            FROM complaint c
            JOIN complaint_category cat ON cat.category_id = c.category_id
            WHERE c.complaint_id = $1
            """,
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")

        target_handler = "GM" if c["is_sensitive"] else "ZM"
        target_zone = zone_id or c["zone_id"]

        await conn.execute(
            """
            UPDATE complaint
            SET
                confirmed_by = $1,
                confirmed_at = NOW(),
                handler = $2,
                zone_id = $3,
                phase = 'Assigned'
            WHERE complaint_id = $4
            """,
            user["user_id"],
            target_handler,
            target_zone,
            complaint_id,
        )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'HANDLER_CHANGE', 'Coordinator', $2, $3, $4, $5)
            """,
            complaint_id,
            target_handler,
            user["role_id"],
            user["user_id"],
            note or f"Confirmed genuine and routed to {target_handler}",
        )


async def coordinator_change_category(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    new_category_id: int,
) -> None:
    async with conn.transaction():
        cat = await conn.fetchrow(
            "SELECT category_id, name, level, severity_points, response_sla_h, resolution_sla_h, default_trade_id FROM complaint_category WHERE category_id = $1",
            new_category_id,
        )
        if not cat:
            raise not_found_exception("New category not found.")

        c = await conn.fetchrow(
            "SELECT urgent_flag, submitted_at FROM complaint WHERE complaint_id = $1",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found.")

        urgent_boost = 15 if c["urgent_flag"] else 0
        new_score = cat["severity_points"] + urgent_boost
        new_response_due = c["submitted_at"] + timedelta(hours=cat["response_sla_h"])
        new_resolution_due = c["submitted_at"] + timedelta(hours=cat["resolution_sla_h"])

        await conn.execute(
            """
            UPDATE complaint
            SET
                category_id = $1,
                priority_score = $2,
                response_due_at = $3,
                resolution_due_at = $4
            WHERE complaint_id = $5
            """,
            new_category_id,
            new_score,
            new_response_due,
            new_resolution_due,
            complaint_id,
        )

        # Update or insert default trade if not present
        if cat["default_trade_id"]:
            await conn.execute(
                """
                INSERT INTO ticket_role (complaint_id, trade_id, role_status)
                VALUES ($1, $2, 'Open')
                ON CONFLICT (complaint_id, trade_id) DO NOTHING
                """,
                complaint_id,
                cat["default_trade_id"],
            )

        await conn.execute(
            """
            INSERT INTO status_history (
                complaint_id, event_type, from_value, to_value, actor_role_id, actor_user_id, reason
            )
            VALUES ($1, 'FIELD_CHANGE', 'category', $2, $3, $4, 'Category updated by Coordinator')
            """,
            complaint_id,
            cat["name"],
            user["role_id"],
            user["user_id"],
        )


async def add_ticket_role(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    trade_id: int,
) -> None:
    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO ticket_role (complaint_id, trade_id, role_status, assigned_by)
            VALUES ($1, $2, 'Open', $3)
            ON CONFLICT (complaint_id, trade_id) DO NOTHING
            """,
            complaint_id,
            trade_id,
            user["user_id"],
        )

