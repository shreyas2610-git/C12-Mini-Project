# 🗄 Database Design Document

> 📌 Working draft v0.3. Related engines: E2 Record and Audit (Pruthvi) and E3 Resource Guard (Bhoomi). Table and column names are conceptual. Data types, the database engine (PostgreSQL, Neon) and the migration approach are fixed at G2. Attribute meanings live in the Entity, Attributes, and Relationships Document. Version 0.3 adds OTP and Google OAuth support: the `user` table gains `phone` (required), `auth_provider`, `google_sub` and `avatar_url`; `password_hash` becomes nullable. Two new tables (`otp_request` and `user_session`) and two new ENUM types (`auth_provider`, `otp_channel`) are added.

1. Scope and numbers
2. Design decisions and the alternatives we weighed
3. Table summary
4. Integrity invariants
5. Indexes (proposed)
6. Triggers (proposed)
7. Transactions
8. Concurrency control
9. Deliberate redundancy and how we reconcile it
10. Targets the data layer supports
11. Open items for Gate 2

## 1. Scope and numbers

| Item | Count |
|---|---|
| Tables | 25 (22 entity tables, 2 junction tables, 1 session table) |
| Attributes | ~155 |
| Foreign keys | 41 |
| Integrity invariants | 9 (I1 to I9, defined in the State and State Transitions Document) |
| Triggers (proposed) | 5 |
| Secondary indexes (proposed) | 20, plus the unique constraints |
| New ENUM types (total) | 12 (+`auth_provider`, +`otp_channel`) |
| Normal form | 3NF, with a short list of deliberate redundancy |

## 2. Design decisions and the alternatives we weighed

| # | Decision | Alternatives considered | Why we chose this | Scenario |
|---|---|---|---|---|
| 1 | Optimistic locking with a `version` column on Complaint | Pessimistic row locks | Only 3 to 5 assigners can touch the same ticket, so conflicts are rare and locks would block readers for little gain. | The Coordinator and the ZM both assign the same ticket and the second one gets 409 and retries. |
| 2 | Five statuses plus a `phase` column | Thirteen or ten stored states | The resident reads five states. The phase keeps every decision point, and the pair is checked by one invariant. | The ticket is Under Review / Verifying and the ZM still sees what to do next. |
| 3 | `handler` always filled and able to name the GM | Escalated as a stored state, or a handler that is empty outside Reported | The GM's desk is a person, not a stage of the problem. A filled handler also routes queues and disputes without extra columns. | The GM delegates a ticket and only the handler changes. |
| 4 | `confirmed_by` and `confirmed_at` instead of a Genuine state or a boolean | A Genuine state, or a single true or false flag | Two fields give us who and when, which the audit trail needs. | The ZM stamps the confirmation while assigning and the history shows who judged it real. |
| 5 | One `resolution` column on Complaint | Two boolean flags, or extra states for Resolved and Unresolved | One column holds only one outcome, and a check ties it to Closed. | A ticket can never be both Fixed and Duplicate. |
| 6 | Stored deadlines ( `confirm_due_at` , `dispute_due_at` and the due times) | Recompute from parameters when reading | If the GM changes a window, live tickets would silently move. Stored values keep changes non-retroactive. | The GM cuts the confirmation window from 48 to 24 hours and open tickets keep their deadline. |
| 7 | One general StatusHistory event log | A separate audit table for each event type | One timeline query serves the track screen and the audit. | The resident opens the timeline and sees status, phase, handler and role events in order. |
| 8 | Status and Transition tables, with phases in the Transition table | Transition rules only in application code | The database can check every change of status and phase as a safety net, and the legal rows are data we can test against. | A bug tries Closed to Under Review and the trigger refuses it. |
| 9 | ResidentHold intervals | Timers that pause and resume, or recomputing from history each time | Stored intervals are easy to sum and to audit, and nothing changes a running clock. | The breach report subtracts 40 hours the resident took to answer. |
| 10 | `reopen_count` , `send_back_count` and `escalated_flag` stored on Complaint | Derive them from history on every check | Guards read one value inside the same transaction. Reconciliation checks catch drift. | T22 reads the reopen count and decides between rework and escalation. |
| 11 | Resident and Vendor as subtypes that share the key of User | Separate login tables per role | One identity table and one login path, with role-specific columns only where needed. | A vendor logs in like anyone else and has capacity details in the Vendor table. |
| 12 | RolePermission with a scope column | Scopes hard-coded in application code | The permission relation stays data, so we can change and test the matrix. | The GM changes what the Coordinator can see without a code change. |
| 13 | No RoleInheritance table | A table of parent links between roles | Our five roles have disjoint duties and none inherits from another, so the table would hold no rows. | The GM cannot create a cycle because no inheritance exists. |
| 14 | Conceptual names and no data types yet | Choosing the engine and types now | The stack is fixed at G2. | We can still review the structure before the stack decision. |

## 3. Table summary

| # | Table | Primary key | Foreign keys | Uniqueness and checks | Notes |
|---|---|---|---|---|---|
| 1 | Zone | `zone_id` | `zm_user_id` to User | `name` unique, `zm_user_id` unique | One ZM per zone and one zone per ZM. |
| 2 | Tower | `tower_id` | `zone_id` to Zone | `name` unique | Part of the location to zone map. |
| 3 | Flat | `flat_id` | `tower_id` to Tower | `flat_number` unique within a tower | Part of the location to zone map. |
| 4 | CommonArea | `common_area_id` | `zone_id` to Zone | `name` unique | Part of the location to zone map. |
| 5 | Resident | `resident_id` | `resident_id` to User, `flat_id` to Flat | none beyond keys | Subtype of User. |
| 6 | ComplaintCategory | `category_id` | none | `name` unique, severity in four values, SLA hours above zero | Targets are not retroactive. |
| 7 | Complaint | `complaint_id` | `raised_by` to Resident, `flat_id` to Flat, `common_area_id` to CommonArea, `zone_id` to Zone, `category_id` to ComplaintCategory, `duplicate_of` to Complaint, `status` to Status, `confirmed_by` to User | I1 to I9, domains for phase, handler (three values), priority, resolution and send-back reason, `version` at least 1, `reopen_count` between 0 and the limit | The central table. Holds the redundant columns listed in section 9. |
| 8 | TicketRole | `ticket_role_id` | `complaint_id` to Complaint, `trade_id` to Trade, `vendor_id` to Vendor, `assigned_by` to User | ( `complaint_id` , `trade_id` ) unique, `role_status` in five values | One named vendor per role. |
| 9 | Vendor | `vendor_id` | `vendor_id` to User | `current_load` between 0 and `capacity` , `capacity` at least 0 | `current_load` is the semaphore counter. |
| 10 | StatusHistory | `history_id` | `complaint_id` to Complaint, `ticket_role_id` to TicketRole, `actor_role_id` to Role, `actor_user_id` to User, `transition_id` to Transition | Append-only, `event_type` in seven values | Written by triggers. |
| 11 | Role | `role_id` | none | `name` unique | Six rows, including System. |
| 12 | User | `user_id` | `role_id` to Role | `email` unique, `google_sub` unique | Holds the auth provider, optional Google sub and avatar. `password_hash` is nullable (OTP and Google users have no password). `phone` is required for OTP delivery. |
| 13 | Action | `action_id` | none | `code` unique | Named operations. |
| 14 | RolePermission | ( `role_id` , `action_id` ) | `role_id` to Role, `action_id` to Action | `scope` in five values | The permission relation. |
| 15 | RoleInheritance | removed | removed | removed | Removed from the model. The number is kept so the other numbers do not shift. |
| 16 | Trade | `trade_id` | none | `name` unique | Vendor trades. |
| 17 | VendorTrade | ( `vendor_id` , `trade_id` ) | `vendor_id` to Vendor, `trade_id` to Trade | none beyond keys | Many-to-many link. |
| 18 | Attachment | `attachment_id` | `complaint_id` to Complaint, `ticket_role_id` to TicketRole, `uploaded_by` to User | none beyond keys | Stores a file reference only. |
| 19 | ResidentHold | `hold_id` | `complaint_id` to Complaint | `hold_type` in two values, `ended_at` not before `started_at` , at most one open hold per complaint (proposed) | Intervals of resident-held time. |
| 20 | Status | `status_code` | none | none beyond key | Five rows. |
| 21 | Transition | `transition_id` | `from_status` to Status, `to_status` to Status, `actor_role_id` to Role | The combination of `t_code` , `from_status` , `from_phase` , `to_status` , `to_phase` and `actor_role_id` is unique | The legal rows, with phases. |
| 22 | Parameter | `param_key` | `updated_by` to User | none beyond key | Windows and limits. |
| 23 | Notification | `notification_id` | `user_id` to User, `complaint_id` to Complaint | `notification_type` in five values | In-app notices. |
| 24 | OtpRequest | `otp_id` | none | `identifier` + active query indexed | Stores the SHA-256-hashed 6-digit OTP, its expiry, attempt counter and delivery channel. Rows are purged after expiry. |
| 25 | UserSession | `session_id` (UUID) | `user_id` to User | none beyond key | Server-side refresh-token store. Enables immediate session revocation when an account is deactivated. |

## 4. Integrity invariants

The plain-language rules are in the State and State Transitions Document. This table says how the database enforces each one.

| ID | Rule | Enforced by | Fails with | Scenario |
|---|---|---|---|---|
| I1 | `resolution` is filled exactly when status is Closed | Check constraint on Complaint | Write rejected | A reopen clears the resolution in the same update. |
| I2 | `handler` is always filled | Not-null constraint and domain check | Write rejected | Delegating changes the handler from GM to ZM in one step. |
| I3 | `confirmed_by` and `confirmed_at` are both empty or both filled | Check constraint | Write rejected | A confirmation sets both together. |
| I4 | `confirmed_at` is filled once the phase is Assigned, Accepted, Working, Verifying or Confirming | Check constraint | Write rejected | The ZM's assign stamps the confirmation first. |
| I5 | `confirm_due_at` is filled exactly when the phase is Confirming | Check constraint | Write rejected | Closing clears it. |
| I6 | `dispute_due_at` only for Duplicate, Invalid and Unresolved, and `disputed_at` only if `dispute_due_at` is filled | Check constraint | Write rejected | A dispute on a Fixed ticket cannot be stored. |
| I7 (proposed) | Exactly one of `flat_id` and `common_area_id` is filled | Check constraint | Write rejected | A complaint cannot name a flat and the pool together. |
| I8 | The (status, phase) pair is one of the ten allowed pairs, and the phase is empty for Closed and Disputed | Check constraint | Write rejected | Under Review with phase Working is refused. |
| I9 (proposed) | An open ticket in Reported has an empty `first_accepted_at` . A ticket in In Progress or Under Review has it filled | Check constraint | Write rejected | The first acceptance fills it in the same update that changes the status. |

## 5. Indexes (proposed)

| # | Table and columns | Supports | Scenario |
|---|---|---|---|
| 1 | Complaint ( `handler` , `status` , `phase` , `zone_id` ) | Work queues for each desk, including the GM's | The Coordinator's top-N query stays fast at 5,000 open complaints. |
| 2 | Complaint ( `zone_id` , `status` ) | Zone lists and the dashboard | The ZM filters the zone list by Under Review. |
| 3 | Complaint ( `flat_id` , `category_id` , `submitted_at` ) | Recurrence check for flats | The third report from Flat 502 is found at once. |
| 4 | Complaint ( `common_area_id` , `category_id` , `submitted_at` ) | Recurrence check for shared areas | The third lift complaint in 90 days is found at once. |
| 5 | Complaint ( `raised_by` , `submitted_at` ) | The resident's own list | A resident opens their recent complaints. |
| 6 | Complaint ( `phase` , `confirm_due_at` ) | The sweep that closes tickets after the 48 hour window (T32) | The job picks only overdue Confirming tickets. |
| 7 | Complaint ( `status` , `response_due_at` ) | Response SLA alert and escalation for Reported tickets (T25) | The job finds tickets near their response target. |
| 8 | Complaint ( `status` , `resolution_due_at` ) | Resolution SLA alert and escalation for In Progress and Under Review tickets (T25) | The job finds tickets near their resolution target. |
| 9 | Complaint ( `status` , `disputed_at` ) | The sweep that escalates undecided disputes (T35) | A dispute left for 48 hours is found by the job. |
| 10 | StatusHistory ( `complaint_id` , `occurred_at` ) | The ticket timeline | History opens quickly even with 10,000 records. |
| 11 | TicketRole ( `complaint_id` ) | The roles of one ticket | Assign and done read the roles of a ticket. |
| 12 | TicketRole ( `vendor_id` , `role_status` ) | The vendor's jobs and current load | The vendor opens their job list. |
| 13 | TicketRole ( `role_status` , `offer_due_at` ) | The sweep that times out vendor offers (T17) | An unanswered offer is found within one job cycle. |
| 14 | ResidentHold ( `complaint_id` , `ended_at` ) | Finding the open hold and summing intervals | The breach report sums the resident's wait. |
| 15 | Notification ( `user_id` , `read_at` ) | The unread list | The bell icon counts unread notices. |
| 16 | VendorTrade ( `trade_id` , `vendor_id` ) | Vendors by trade, ranked by load | The ZM sees electricians ranked by free slots. |
| 17 | OtpRequest ( `identifier` , `is_used` , `expires_at` ) | Fast OTP lookup during the verify step | The backend finds the latest active OTP for a phone or email in one seek. |
| 18 | OtpRequest ( `expires_at` ) WHERE `is_used` = FALSE | Sweep expired OTPs | A cleanup job removes unused rows without a full table scan. |
| 19 | UserSession ( `user_id` , `is_revoked` ) | Session lookup for logout-all and account deactivation | The GM deactivates a user and all active sessions are revoked in one update. |
| 20 | User ( `google_sub` ) WHERE `google_sub` IS NOT NULL | Google account linking | The OAuth callback finds or creates a user by the immutable Google sub in O(1). |

## 6. Triggers (proposed)

| # | Fires on | What it does | Why | Scenario |
|---|---|---|---|---|
| 1 | After insert on Complaint | Writes the first StatusHistory row, an empty to Reported event by the resident | The history starts at T1 without the application having to remember | A resident submits and the timeline already has its first entry. |
| 2 | After update on Complaint | Compares old and new values of `status` , `phase` , `handler` , `confirmed_at` and `resolution` and writes one history row per change. Actor and reason come from session variables set by the transaction, because a trigger cannot see the application user. | Every change is recorded exactly once, whichever code path made it | The ZM verifies a ticket and the history shows who, when and from which phase. |
| 3 | Before update on Complaint | When the status or phase changes, checks that the old and new (status, phase) pair and the acting role exist in the Transition table, and rejects the write otherwise. Handler and flag events inside a phase are checked by the application guards. | A safety net behind the application check, so no invalid transition is ever stored | A bug tries Closed to Under Review and the write is refused. |
| 4 | After update on TicketRole | Writes ROLE_EVENT rows for accept, reject, start, done and timeout | Role-level events appear on the same timeline | The history shows when each vendor accepted. |
| 5 | Before update or delete on StatusHistory | Rejects the change | The history is append-only | Not even the GM can edit a past event. |

## 7. Transactions

Each row is one all-or-nothing unit. The isolation level is chosen at G2. The guards rely on conditional updates and the `version` column rather than on long locks.

| # | Transaction | What happens inside | Locking and failure | Scenario |
|---|---|---|---|---|
| 1 | Raise a complaint (T1 with T2 or T3) | Insert the Complaint with its zone and due times, read the recurrence count, then set the handler or send it to the GM. The first history row comes from the trigger. | One transaction that rolls back as a whole | A submission lands on the right desk or in the GM queue and is never half-created. |
| 2 | Assign (T15) | Update phase, priority, confirmation stamp and ZM-acted time on Complaint. Create or update every TicketRole with its vendor and offer times. Write the history. | The update needs a matching `version` . Nothing is kept unless everything succeeds. | The ZM assigns an electrician and a mason and either both roles are offered or neither. |
| 3 | Accept a role (T16) | Raise `current_load` only while it is below `capacity` . Update the TicketRole. On the first acceptance also set `first_accepted_at` and move the Complaint to In Progress. | A conditional update. If the vendor is full the transaction rolls back with 409. | The sixth accept for a vendor with capacity 5 is refused. |
| 4 | Mark a role done (T19) | Lower `current_load` , update the TicketRole, count the open roles and, if none remain, move the Complaint to Under Review / Verifying. | Exactly one transaction wins the last-role step | Two vendors finish together and one move is stored. |
| 5 | Verify (T21) | Move the phase to Confirming with `resolved_at` and `confirm_due_at` , open a CONFIRMATION_WAIT hold and notify the resident. | Needs a matching `version` | The ZM verifies and the 48 hour clock starts. |
| 6 | Resident confirms or rejects (T41, T42, T43) | Close the hold. T41 closes the ticket as Fixed. T42 raises `reopen_count` , clears `resolved_at` and `confirm_due_at` , and returns the ticket to In Progress / Assigned with handler ZM. T43 moves it to the GM's desk. | Needs a matching `version` . The deadline is checked against database time at commit. | A rejection at 47 hours 59 minutes succeeds and one at 48 hours 01 minute gets 422. |
| 7 | Sweep (T32, T25, T17, T35) | Each overdue ticket is handled in its own transaction as the System actor. | A conflict skips the ticket. A single-instance lock prevents overlapping runs. After downtime the job works in due-time order. | After an outage the job closes tickets in the order they became due. |
| 8 | Close as Duplicate (T7) | Update the Complaint to Closed with the resolution, `duplicate_of` , `closed_at` and `dispute_due_at` . | Needs a matching `version` . The original must be open. | The Coordinator links a duplicate to the open original. |
| 9 | Close as Unresolved (T27) | Update the Complaint to Closed with resolution Unresolved, the note, `closed_at` and `dispute_due_at` . | Needs a matching `version` | The GM closes a builder-defect ticket with a reason. |
| 10 | Dispute (T34, T35, T37, T38) | Filing sets `disputed_at` and the handler. The decision updates the status and clears or keeps the resolution. | Needs a matching `version` . `disputed_at` allows one dispute per ticket. | A second dispute attempt gets 422. |
| 11 | Delegate (T30) | Change the handler from GM to ZM and write the optional note to the history. | Needs a matching `version` . The ticket must be an open GM-desk ticket. | The GM hands the delayed lift ticket to the ZM. |

## 8. Concurrency control

| Hazard | Mechanism | What the caller sees | Scenario |
|---|---|---|---|
| Lost update on a ticket | `version` column, update only when it matches | 409 with the current state | The Coordinator and the ZM both assign. |
| Vendor over capacity | Conditional increase of `current_load` | 409 | A full vendor tries to accept. |
| Double entry into Under Review | Atomic countdown of open roles | Exactly one move | Two vendors finish together. |
| Race at the end of the confirmation window | Conditional update on phase and version | One of confirm, reject, delegate or the lapse job wins. Humans who lose get 409 and the job skips. | The resident confirms at the same moment the job closes the ticket. |
| Two job instances | Single-instance lock | One run at a time | Two workers start together after a restart. |
| Tampering with history | Append-only trigger | The change is refused | Someone tries to delete an old event. |

## 9. Deliberate redundancy and how we reconcile it

Everything not listed here is in 3NF. Each item below gets a reconciliation check in the test plan.

| Item | Source of truth | Why we store it | Reconciliation check |
|---|---|---|---|
| `Complaint.zone_id` | Flat, Tower and Zone, or CommonArea and Zone | Fast scope filters | Recompute from the location and compare. |
| `escalated_flag` | History rows that show a move to handler GM | Reports and the monthly count read one value | The flag is true exactly when such a history row exists. |
| `reopen_count` | History rows for rework and rejection | The limit guard reads one value | Count the events and compare. |
| `send_back_count` | History rows for ZM send-backs | The guard for T12 and T13 | Count the events and compare. |
| `first_accepted_at` | The earliest `accepted_at` among the ticket's roles | SLA clocks and the status rule I9 | Compare with the earliest role acceptance. |
| `resolved_at` , `closed_at` , `disputed_at` | The matching history rows | Clock and window arithmetic | Compare with the latest matching event. |
| `Vendor.current_load` | Roles of the vendor in Accepted or Started | The capacity semaphore | Recount from TicketRole. |
| ResidentHold rows | History events for T6, T8, T9, T10, T21, T26, T32, T41, T42 and T43 | Simple sums of resident-held time | Rebuild the intervals from history and compare. |

## 10. Targets the data layer supports

| NFR | Target | How the design supports it |
|---|---|---|
| NFR1.1 | Top-N under 50 ms at 5,000 open complaints | Index 1 on handler, status, phase and zone, plus the in-memory heap |
| NFR1.2 | Zone lookup under 10 ms | Zone, Tower, Flat and CommonArea rows feed an in-memory map |
| NFR2.1 | 100% of changes get a history row | Triggers 1, 2 and 4 |
| NFR2.2 | 0 partial commits | The transactions in section 7 |
| NFR2.3 | History under 200 ms at 10,000 records | Index 10 |
| NFR2.4 | 100% correct due times and breaches | Stored due times and the breach query that excludes resident-held time |
| NFR3.1 | 0% lost updates over 50 simultaneous actions | The `version` column |
| NFR3.4 | 100% of over-capacity accepts rejected | Conditional increase of `current_load` |
| NFR3.5 | Exactly one entry into Under Review in 50 runs (the baseline says one Completed) | Atomic countdown in transaction 4 |
| NFR3.6 | 100% escalated within 10 minutes and 0 duplicates | The 10 minute job, single-instance lock and conditional updates |
| NFR5.1 | 0 invalid transitions stored | Trigger 3 and the application guards |
| NFR5.4 | 100% of guard and time-window violations rejected at the boundaries | Stored deadlines compared against database time at commit |

## 11. Open items for Gate 2

- Choose the engine and the data types. ✅ PostgreSQL on Neon (decided in v0.3).
- Store timestamps in UTC and show them in Indian Standard Time.
- Decide where the photo files live. The table keeps only a reference.
- `password_hash` is nullable in v0.3. Keep it nullable to allow a future password-fallback flow; drop the column entirely only if the team commits to fully passwordless.
- OTP channel: **email primary** (zero cost for a college project) with optional SMS via a gateway such as MSG91 or AWS SNS. Decided in v0.3.
- Google OAuth provider: **Google only** for now. Microsoft or GitHub can be added later by extending `auth_provider` ENUM.
- JWT library: `python-jose` with FastAPI (decided in v0.3).
- Session storage: database-only (`user_session` table). Redis cache can be added later for higher scale.
- Decide how retired records are kept. Accounts, vendors and categories use an active flag instead of deletion.
- Plan how personal data (phone numbers, email, avatar URLs) is protected and retained under the DPDP Act 2023.
- Decide the migration and seed-data approach (synthetic data only).
- Add a scheduled job to sweep expired `otp_request` rows (can piggyback on the existing SLA job).
