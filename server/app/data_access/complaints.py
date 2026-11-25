from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import asyncpg
from app.core.exceptions import bad_request_exception, conflict_exception, not_found_exception


# -- Lookups -------------------------------------------------------------------

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


# -- Complaint Intake ----------------------------------------------------------

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


# -- Listing Complaints --------------------------------------------------------

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
        c["location_type"] = "Flat" if c.get("flat_id") is not None else "CommonArea"
        c["roles"] = role_map.get(c["complaint_id"], [])

    return complaints


# -- Complaint Detail ----------------------------------------------------------

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


# -- Resident Actions ----------------------------------------------------------

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


# -- Coordinator Actions -------------------------------------------------------

async def coordinator_request_clarification(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    question: str,
) -> None:
    async with conn.transaction():
        c = await conn.fetchrow(
            "SELECT raised_by, status, phase::text as phase, handler::text as handler FROM complaint WHERE complaint_id = $1 AND handler = 'Coordinator'",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found or not on Coordinator's desk.")
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
              AND handler = 'Coordinator'
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
              AND handler = 'Coordinator'
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
              AND c.handler = 'Coordinator'
            """,
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found or not on Coordinator's desk.")

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
                phase = 'Triage'
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


async def coordinator_hand_off(
    conn: asyncpg.Connection,
    complaint_id: int,
    user: dict[str, Any],
    zone_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    """T5: Hand off a ticket to the ZM/GM without confirming it.
    Only changes the handler; confirmed_by/confirmed_at stay empty so the ZM can confirm later."""
    async with conn.transaction():
        c = await conn.fetchrow(
            """
            SELECT c.category_id, cat.is_sensitive, c.zone_id
            FROM complaint c
            JOIN complaint_category cat ON cat.category_id = c.category_id
            WHERE c.complaint_id = $1
              AND c.handler = 'Coordinator'
            """,
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found or not on Coordinator's desk.")

        target_handler = "GM" if c["is_sensitive"] else "ZM"
        target_zone = zone_id or c["zone_id"]

        await conn.execute(
            """
            UPDATE complaint
            SET
                handler = $1,
                zone_id = $2
            WHERE complaint_id = $3
            """,
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
            note or f"Handed off to {target_handler}",
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
            "SELECT urgent_flag, submitted_at FROM complaint WHERE complaint_id = $1 AND handler = 'Coordinator'",
            complaint_id,
        )
        if not c:
            raise not_found_exception("Complaint not found or not on Coordinator's desk.")

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



# ── Zone Manager Specialized Data Access ──────────────────────────────────────

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

    items.sort(
        key=lambda x: (
            -(x["queue_score"] or 0.0),
            x["submitted_at"],
            x["complaint_id"],
        )
    )
    return items[:limit]


async def log_status_history(
    conn: asyncpg.Connection,
    complaint_id: int,
    event_type: str,
    from_value: str | None,
    to_value: str | None,
    actor_user_id: int,
    actor_role_id: int = 3,
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, handler, status, phase, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, confirmed_by, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, send_back_count, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        count = row["send_back_count"]
        if count == 0:
            await conn.execute(
                """
                UPDATE complaint 
                SET send_back_count = 1,
                    send_back_reason = $2::sendback_reason,
                    handler = 'Coordinator',
                    confirmed_by = NULL,
                    confirmed_at = NULL,
                    version = version + 1
                WHERE complaint_id = $1
                """,
                complaint_id,
                reason_code,
            )
            await log_status_history(conn, complaint_id, "HANDLER_CHANGE", "ZM", "Coordinator", user_id, reason=f"Send back: {reason_code} - {reason}")
        else:
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, phase, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        for r_in in roles_input:
            v_id = r_in["vendor_id"]
            v_row = await conn.fetchrow("SELECT capacity, current_load, is_active FROM vendor WHERE vendor_id = $1", v_id)
            if not v_row or not v_row["is_active"]:
                raise bad_request_exception(f"Vendor {v_id} is inactive or invalid.")
            if v_row["current_load"] >= v_row["capacity"]:
                raise conflict_exception(f"Vendor {v_id} is already at full capacity.")

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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, phase, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, reopen_count, phase, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        reopens = row["reopen_count"] + 1
        if reopens <= 2:
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
            await conn.execute("UPDATE ticket_role SET role_status = 'Offered' WHERE complaint_id = $1", complaint_id)
            await log_status_history(conn, complaint_id, "PHASE_CHANGE", str(row["phase"]), "Assigned", user_id, reason=f"Rework ordered: {reason}")
        else:
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
    decision: str,
    user_id: int,
    zone_id: int,
    reason: str | None = None,
) -> dict[str, Any]:
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, status, resolution, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
            complaint_id,
        )
        if not row or row["zone_id"] != zone_id:
            raise not_found_exception("Complaint not found in your zone.")
        if row["version"] != current_version:
            raise conflict_exception("Complaint was modified concurrently. Please refresh.")

        if decision == "uphold":
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, handler, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
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
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT version, zone_id FROM complaint WHERE complaint_id = $1 AND handler = 'ZM' FOR UPDATE",
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
