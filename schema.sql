-- ═══════════════════════════════════════════════════════════════════════════
--  Mini Project Team 12 – Complete Database Schema
--  Engine   : PostgreSQL (Neon – Connection Pooling ON)
--  Version  : v0.3 (adds OTP + Google OAuth – auth_provider, otp_request,
--             user_session; updates user table)
--  Tables   : 25 (22 entity + 2 junction + 1 session)  |  Attributes : ~155
--  FK       : 41   |   Invariants : I1–I9
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────
--  Extensions
-- ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid(), crypt()

-- ──────────────────────────────
--  Custom ENUM types
-- ──────────────────────────────
CREATE TYPE severity_level    AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE handler_type      AS ENUM ('Coordinator', 'ZM', 'GM');
CREATE TYPE phase_type        AS ENUM ('Triage', 'Awaiting Resident', 'Assigned', 'Accepted', 'Working', 'Verifying', 'Confirming');
CREATE TYPE resolution_type   AS ENUM ('Fixed', 'Unresolved', 'Duplicate', 'Invalid', 'Withdrawn');
CREATE TYPE sendback_reason   AS ENUM ('Wrong zone', 'Not genuine');
CREATE TYPE role_status_type  AS ENUM ('Unassigned', 'Offered', 'Accepted', 'Started', 'Done');
CREATE TYPE event_type        AS ENUM ('STATUS_CHANGE', 'PHASE_CHANGE', 'HANDLER_CHANGE', 'CONFIRMED', 'CONFIRM_CLEARED', 'ROLE_EVENT', 'FIELD_CHANGE');
CREATE TYPE hold_type         AS ENUM ('AWAITING_RESIDENT', 'CONFIRMATION_WAIT');
CREATE TYPE scope_type        AS ENUM ('OWN_FLAT', 'OWN_ZONE', 'OWN_JOBS', 'ESCALATED_ONLY', 'TOWNSHIP');
CREATE TYPE notification_type AS ENUM ('CLARIFICATION_REQUEST', 'FIX_CONFIRMATION', 'STATUS_UPDATE', 'SLA_ALERT', 'DISPUTE_UPDATE');
CREATE TYPE auth_provider    AS ENUM ('otp', 'google', 'both');  -- how this user authenticates
CREATE TYPE otp_channel      AS ENUM ('sms', 'email');           -- delivery channel for OTP


-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 11 : Role   (referenced early – define first)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "role" (
    role_id       SERIAL       PRIMARY KEY,
    name          VARCHAR(20)  NOT NULL UNIQUE,          -- Resident, Coordinator, ZM, Vendor, GM, System
    has_login     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 12 : User
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "user" (
    user_id        SERIAL        PRIMARY KEY,
    role_id        INT           NOT NULL REFERENCES "role"(role_id),
    full_name      VARCHAR(120)  NOT NULL,
    email          VARCHAR(255)  NOT NULL UNIQUE,
    phone          VARCHAR(20)   NOT NULL,                          -- required for OTP delivery
    password_hash  VARCHAR(255),                                    -- nullable: OTP/Google users have no password
    auth_provider  auth_provider NOT NULL DEFAULT 'otp',           -- how this user authenticates
    google_sub     VARCHAR(255)  UNIQUE,                           -- Google's immutable user ID ("sub" claim)
    avatar_url     TEXT,                                           -- profile picture from Google
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 1 : Zone
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE zone (
    zone_id     SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    zm_user_id  INT          UNIQUE REFERENCES "user"(user_id)   -- 1:1, nullable
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 2 : Tower
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE tower (
    tower_id  SERIAL       PRIMARY KEY,
    zone_id   INT          NOT NULL REFERENCES zone(zone_id),
    name      VARCHAR(100) NOT NULL UNIQUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 3 : Flat
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE flat (
    flat_id      SERIAL       PRIMARY KEY,
    tower_id     INT          NOT NULL REFERENCES tower(tower_id),
    flat_number  VARCHAR(20)  NOT NULL,
    UNIQUE (tower_id, flat_number)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 4 : CommonArea
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE common_area (
    common_area_id  SERIAL       PRIMARY KEY,
    zone_id         INT          NOT NULL REFERENCES zone(zone_id),
    name            VARCHAR(100) NOT NULL UNIQUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 5 : Resident   (subtype of User, shared PK)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE resident (
    resident_id  INT  PRIMARY KEY REFERENCES "user"(user_id),
    flat_id      INT  NOT NULL REFERENCES flat(flat_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 6 : ComplaintCategory
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE complaint_category (
    category_id      SERIAL          PRIMARY KEY,
    name             VARCHAR(100)    NOT NULL UNIQUE,
    severity         severity_level  NOT NULL,
    response_sla_h   INT             NOT NULL CHECK (response_sla_h > 0),
    resolution_sla_h INT             NOT NULL CHECK (resolution_sla_h > 0),
    is_sensitive     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN         NOT NULL DEFAULT TRUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 20 : Status   (reference table, 5 rows)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE status (
    status_code  VARCHAR(20)  PRIMARY KEY,               -- Reported, In Progress, Under Review, Closed, Disputed
    label        VARCHAR(30)  NOT NULL,
    is_open      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 21 : Transition   (legal workflow moves)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE transition (
    transition_id    SERIAL       PRIMARY KEY,
    t_code           VARCHAR(10)  NOT NULL,               -- T1 … T44
    from_status      VARCHAR(20)  REFERENCES status(status_code),
    to_status        VARCHAR(20)  NOT NULL REFERENCES status(status_code),
    from_phase       phase_type,
    to_phase         phase_type,
    actor_role_id    INT          NOT NULL REFERENCES "role"(role_id),
    requires_reason  BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (t_code, from_status, from_phase, to_status, to_phase, actor_role_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 7 : Complaint   (central table – 33 attributes)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE complaint (
    -- ─ Identity ──────────────────────────────────────────
    complaint_id      SERIAL          PRIMARY KEY,
    raised_by         INT             NOT NULL REFERENCES resident(resident_id),
    description       TEXT            NOT NULL,
    submitted_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ─ Location ──────────────────────────────────────────
    flat_id           INT             REFERENCES flat(flat_id),
    common_area_id    INT             REFERENCES common_area(common_area_id),
    zone_id           INT             NOT NULL REFERENCES zone(zone_id),

    -- ─ Classification ────────────────────────────────────
    category_id       INT             NOT NULL REFERENCES complaint_category(category_id),
    priority          severity_level,
    recurring_flag    BOOLEAN         NOT NULL DEFAULT FALSE,
    duplicate_of      INT             REFERENCES complaint(complaint_id),

    -- ─ Workflow state ────────────────────────────────────
    status            VARCHAR(20)     NOT NULL REFERENCES status(status_code) DEFAULT 'Reported',
    phase             phase_type,
    handler           handler_type    NOT NULL DEFAULT 'Coordinator',
    escalated_flag    BOOLEAN         NOT NULL DEFAULT FALSE,
    confirmed_by      INT             REFERENCES "user"(user_id),
    confirmed_at      TIMESTAMPTZ,
    zm_acted_at       TIMESTAMPTZ,
    send_back_count   INT             NOT NULL DEFAULT 0,
    send_back_reason  sendback_reason,
    reopen_count      INT             NOT NULL DEFAULT 0 CHECK (reopen_count BETWEEN 0 AND 2),

    -- ─ Outcome ───────────────────────────────────────────
    resolution        resolution_type,
    resolution_note   TEXT,

    -- ─ Clocks and windows ────────────────────────────────
    response_due_at    TIMESTAMPTZ    NOT NULL,
    resolution_due_at  TIMESTAMPTZ,
    first_accepted_at  TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    closed_at          TIMESTAMPTZ,
    confirm_due_at     TIMESTAMPTZ,
    dispute_due_at     TIMESTAMPTZ,
    disputed_at        TIMESTAMPTZ,
    alerted_at         TIMESTAMPTZ,

    -- ─ Concurrency ──────────────────────────────────────
    version            INT            NOT NULL DEFAULT 1 CHECK (version >= 1),

    -- ═══════ Integrity invariants ═══════════════════════

    -- I1 : resolution filled exactly when status is Closed
    CONSTRAINT i1_resolution_closed CHECK (
        (status = 'Closed'   AND resolution IS NOT NULL) OR
        (status <> 'Closed'  AND resolution IS NULL)
    ),

    -- I2 : handler always filled   →  NOT NULL above

    -- I3 : confirmed_by and confirmed_at are both empty or both filled
    CONSTRAINT i3_confirm_pair CHECK (
        (confirmed_by IS NULL AND confirmed_at IS NULL) OR
        (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    ),

    -- I5 : confirm_due_at filled exactly when phase is Confirming
    CONSTRAINT i5_confirm_window CHECK (
        (phase = 'Confirming' AND confirm_due_at IS NOT NULL) OR
        (phase IS DISTINCT FROM 'Confirming' AND confirm_due_at IS NULL)
    ),

    -- I6 : dispute_due_at only for Duplicate / Invalid / Unresolved
    CONSTRAINT i6_dispute_window CHECK (
        dispute_due_at IS NULL OR resolution IN ('Duplicate', 'Invalid', 'Unresolved')
    ),

    -- I7 (proposed) : exactly one of flat_id / common_area_id filled
    CONSTRAINT i7_location_xor CHECK (
        (flat_id IS NOT NULL AND common_area_id IS NULL) OR
        (flat_id IS NULL     AND common_area_id IS NOT NULL)
    ),

    -- I8 : the (status, phase) pair must be one of the 10 allowed pairs
    CONSTRAINT i8_status_phase CHECK (
        (status = 'Reported'     AND phase IN ('Triage', 'Awaiting Resident', 'Assigned')) OR
        (status = 'In Progress'  AND phase IN ('Assigned', 'Accepted', 'Working'))         OR
        (status = 'Under Review' AND phase IN ('Verifying', 'Confirming'))                  OR
        (status = 'Closed'       AND phase IS NULL)                                         OR
        (status = 'Disputed'     AND phase IS NULL)
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 9 : Vendor   (subtype of User, shared PK)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE vendor (
    vendor_id     INT           PRIMARY KEY REFERENCES "user"(user_id),
    company_name  VARCHAR(150)  NOT NULL,
    capacity      INT           NOT NULL CHECK (capacity >= 0),
    current_load  INT           NOT NULL DEFAULT 0,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT vendor_load_cap CHECK (current_load BETWEEN 0 AND capacity)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 16 : Trade
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE trade (
    trade_id  SERIAL       PRIMARY KEY,
    name      VARCHAR(80)  NOT NULL UNIQUE
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 17 : VendorTrade   (junction – M:N)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE vendor_trade (
    vendor_id  INT  NOT NULL REFERENCES vendor(vendor_id),
    trade_id   INT  NOT NULL REFERENCES trade(trade_id),
    PRIMARY KEY (vendor_id, trade_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 8 : TicketRole
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE ticket_role (
    ticket_role_id  SERIAL           PRIMARY KEY,
    complaint_id    INT              NOT NULL REFERENCES complaint(complaint_id),
    trade_id        INT              NOT NULL REFERENCES trade(trade_id),
    vendor_id       INT              REFERENCES vendor(vendor_id),
    role_status     role_status_type NOT NULL DEFAULT 'Unassigned',
    assigned_by     INT              REFERENCES "user"(user_id),
    offered_at      TIMESTAMPTZ,
    offer_due_at    TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    done_at         TIMESTAMPTZ,
    done_note       TEXT,
    UNIQUE (complaint_id, trade_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 10 : StatusHistory   (append-only event log)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE status_history (
    history_id      SERIAL       PRIMARY KEY,
    complaint_id    INT          NOT NULL REFERENCES complaint(complaint_id),
    ticket_role_id  INT          REFERENCES ticket_role(ticket_role_id),
    event_type      event_type   NOT NULL,
    from_value      TEXT,
    to_value        TEXT         NOT NULL,
    actor_role_id   INT          NOT NULL REFERENCES "role"(role_id),
    actor_user_id   INT          REFERENCES "user"(user_id),
    transition_id   INT          REFERENCES transition(transition_id),
    reason          TEXT,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 13 : Action
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE action (
    action_id    SERIAL       PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL UNIQUE,
    description  TEXT         NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 14 : RolePermission   (junction – M:N with scope)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE role_permission (
    role_id    INT        NOT NULL REFERENCES "role"(role_id),
    action_id  INT        NOT NULL REFERENCES action(action_id),
    scope      scope_type NOT NULL,
    PRIMARY KEY (role_id, action_id)
);

-- TABLE 15 : RoleInheritance – REMOVED (no roles inherit from another)

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 18 : Attachment
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE attachment (
    attachment_id   SERIAL       PRIMARY KEY,
    complaint_id    INT          NOT NULL REFERENCES complaint(complaint_id),
    ticket_role_id  INT          REFERENCES ticket_role(ticket_role_id),
    uploaded_by     INT          NOT NULL REFERENCES "user"(user_id),
    file_ref        VARCHAR(500) NOT NULL,                -- path / URL to stored photo
    caption         TEXT,
    uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 19 : ResidentHold
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE resident_hold (
    hold_id       SERIAL       PRIMARY KEY,
    complaint_id  INT          NOT NULL REFERENCES complaint(complaint_id),
    hold_type     hold_type    NOT NULL,
    started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    CONSTRAINT hold_interval CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 22 : Parameter
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE parameter (
    param_key    VARCHAR(80)  PRIMARY KEY,
    param_value  TEXT         NOT NULL,
    description  TEXT         NOT NULL,
    updated_by   INT          NOT NULL REFERENCES "user"(user_id),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 23 : Notification
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE notification (
    notification_id    SERIAL             PRIMARY KEY,
    user_id            INT                NOT NULL REFERENCES "user"(user_id),
    complaint_id       INT                REFERENCES complaint(complaint_id),
    notification_type  notification_type  NOT NULL,
    message            TEXT               NOT NULL,
    created_at         TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    read_at            TIMESTAMPTZ
);


-- ═══════════════════════════════════════════════════════════════════════════
--  INDEXES (from Database Design Document section 5)
-- ═══════════════════════════════════════════════════════════════════════════

-- Idx 1 : Work queues per desk
CREATE INDEX idx_complaint_queue
    ON complaint (handler, status, phase, zone_id);

-- Idx 2 : Zone + status dashboard
CREATE INDEX idx_complaint_zone_status
    ON complaint (zone_id, status);

-- Idx 3 : Recurrence check – flat
CREATE INDEX idx_complaint_flat_cat_time
    ON complaint (flat_id, category_id, submitted_at);

-- Idx 4 : Recurrence check – common area
CREATE INDEX idx_complaint_area_cat_time
    ON complaint (common_area_id, category_id, submitted_at);

-- Idx 5 : Resident's own list
CREATE INDEX idx_complaint_raised_by
    ON complaint (raised_by, submitted_at);

-- Idx 6 : Confirming sweep (T32)
CREATE INDEX idx_complaint_confirm_sweep
    ON complaint (phase, confirm_due_at);

-- Idx 7 : Response SLA alert (T25)
CREATE INDEX idx_complaint_response_sla
    ON complaint (status, response_due_at);

-- Idx 8 : Resolution SLA alert (T25)
CREATE INDEX idx_complaint_resolution_sla
    ON complaint (status, resolution_due_at);

-- Idx 9 : Dispute escalation sweep (T35)
CREATE INDEX idx_complaint_dispute_sweep
    ON complaint (status, disputed_at);

-- Idx 10 : Ticket timeline
CREATE INDEX idx_history_timeline
    ON status_history (complaint_id, occurred_at);

-- Idx 11 : Roles of one ticket
CREATE INDEX idx_ticketrole_complaint
    ON ticket_role (complaint_id);

-- Idx 12 : Vendor's jobs and load
CREATE INDEX idx_ticketrole_vendor
    ON ticket_role (vendor_id, role_status);

-- Idx 13 : Vendor offer timeout sweep (T17)
CREATE INDEX idx_ticketrole_offer_sweep
    ON ticket_role (role_status, offer_due_at);

-- Idx 14 : Open holds and interval sums
CREATE INDEX idx_residenthold_complaint
    ON resident_hold (complaint_id, ended_at);

-- Idx 15 : Unread notifications
CREATE INDEX idx_notification_unread
    ON notification (user_id, read_at);

-- Idx 16 : Vendors by trade, ranked by load
CREATE INDEX idx_vendortrade_ranked
    ON vendor_trade (trade_id, vendor_id);



-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 24 : OtpRequest   (stores hashed one-time passwords)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE otp_request (
    otp_id      SERIAL        PRIMARY KEY,
    identifier  VARCHAR(255)  NOT NULL,             -- phone number or email address
    channel     otp_channel   NOT NULL,              -- sms or email
    otp_hash    VARCHAR(255)  NOT NULL,              -- SHA-256 hash of the 6-digit code (never plaintext)
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ   NOT NULL,              -- typically NOW() + INTERVAL '5 minutes'
    is_used     BOOLEAN       NOT NULL DEFAULT FALSE,
    attempts    INT           NOT NULL DEFAULT 0,    -- brute-force counter; invalidate after 3–5 wrong guesses
    ip_address  INET,                               -- rate-limit by IP
    user_agent  TEXT                                -- device fingerprint
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE 25 : UserSession   (server-side refresh-token store)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE user_session (
    session_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             INT           NOT NULL REFERENCES "user"(user_id),
    refresh_token_hash  VARCHAR(255)  NOT NULL,    -- SHA-256 of the opaque refresh token
    device_info         TEXT,                       -- e.g. "Chrome on Windows 11"
    ip_address          INET,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ   NOT NULL,     -- e.g. NOW() + INTERVAL '30 days'
    is_revoked          BOOLEAN       NOT NULL DEFAULT FALSE
);

-- ─────────────────────────────────────────────────────────────────────────
--  Auth indexes (OTP + Google OAuth)  – placed here after tables exist
-- ─────────────────────────────────────────────────────────────────────────

-- Idx 17 : Fast OTP lookup during verify
CREATE INDEX idx_otp_identifier_active
    ON otp_request (identifier, is_used, expires_at);

-- Idx 18 : Sweep expired / used OTPs
CREATE INDEX idx_otp_expired
    ON otp_request (expires_at) WHERE is_used = FALSE;

-- Idx 19 : Session lookup by user (logout-all, deactivation)
CREATE INDEX idx_session_user
    ON user_session (user_id, is_revoked);

-- Idx 20 : Google account linking
CREATE INDEX idx_user_google_sub
    ON "user" (google_sub) WHERE google_sub IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
--  SEED DATA – Reference / Lookup tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Roles (6 rows) ───────────────────────────────────────
INSERT INTO "role" (name, has_login) VALUES
    ('Resident',    TRUE),
    ('Coordinator', TRUE),
    ('ZM',          TRUE),
    ('Vendor',      TRUE),
    ('GM',          TRUE),
    ('System',      FALSE);

-- ── Statuses (5 rows) ────────────────────────────────────
INSERT INTO status (status_code, label, is_open) VALUES
    ('Reported',     'Reported',      TRUE),
    ('In Progress',  'In Progress',   TRUE),
    ('Under Review', 'Under Review',  TRUE),
    ('Closed',       'Closed',        FALSE),
    ('Disputed',     'Disputed',      TRUE);


-- ═══════════════════════════════════════════════════════════════════════════
--  TRIGGER 5 : Append-only guard on StatusHistory
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_status_history_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'StatusHistory is append-only. Updates and deletes are not permitted.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_status_history_immutable
    BEFORE UPDATE OR DELETE ON status_history
    FOR EACH ROW
    EXECUTE FUNCTION fn_status_history_immutable();


-- ═══════════════════════════════════════════════════════════════════════════
--  Done.  All timestamps are stored in UTC (TIMESTAMPTZ).
--  Display in IST (UTC+05:30) at the application layer.
-- ═══════════════════════════════════════════════════════════════════════════
