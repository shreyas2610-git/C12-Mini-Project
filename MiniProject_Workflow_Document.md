# 🔄 Workflow Document

> 📌 Working draft v0.3. Related engines: E5 Rule Enforcement (shared) and E1 Triage and Routing. This page tells the story of a complaint and holds the register of every rule and definition we enforce. The formal state table lives in the State and State Transitions Document and the permission rules live in the Roles and Permissions Document. Version 0.3 updates the access model to reflect OTP and Google OAuth authentication: passwords are removed, the login flow is replaced by OTP (email primary, SMS optional) and Google Sign-In.

1. Purpose and scope
2. Who takes part
3. The journey of a complaint
4. Lifecycle diagram
5. Rules and definitions register
   - 5.1 Definitions
   - 5.2 Classification, scoring and clocks
   - 5.3 Workflow rules
6. Parameters
7. Scenarios from start to finish
8. What the resident sees (proposed labels)
9. Who marks what at the end of a ticket
10. Notifications (proposed mapping)
11. Assumptions

## 1. Purpose and scope

This document describes how a complaint travels through our system: who raises it, who decides what, where it can wait, how it is fixed and verified, and how it ends or gets challenged. It covers every complaint a resident raises, for their own flat or for a shared area such as the pool, gym, parks, parking, lifts or clubhouse. Transition numbers (T1 to T44) point to the State and State Transitions Document. The resident sees five states (Reported, In Progress, Under Review, Closed, Disputed). Inside them the system keeps seven phases, a handler and a few flags, because those still drive our decisions.

## 2. Who takes part

| Actor | Part in the workflow |
|---|---|
| Resident | Raises the complaint for their own flat or a shared area, answers a clarification request within 72 hours, confirms or rejects the fix within 48 hours, can withdraw until a vendor accepts, and can dispute a Duplicate, Invalid or Unresolved closure once within 7 days. |
| Helpdesk Coordinator | Township-wide front desk. Works the triage queue: fixes the category, asks the resident to clarify, confirms the complaint is genuine, hands the ticket to the ZM or assigns vendors until the ZM acts, closes duplicates and closes Invalid after the 72 hour window. |
| Zone Manager (ZM) | Owns one zone and has the final say in it. Takes over tickets, confirms or sends back, assigns vendors, verifies completed work, orders rework, decides disputes within 48 hours, escalates with a reason, and receives tickets that the GM delegates. |
| Vendor | Skilled worker or company that serves every zone. Accepts or rejects a role, starts work, adds notes and photos and marks their own role done. |
| General Manager (GM) | Acts on tickets on the GM's desk and on configuration. Marks work fixed, closes as Unresolved, reassigns vendors, delegates a ticket to a ZM for good, and reopens closed tickets within 7 days. Manages accounts, zones, categories, trades, capacity and parameters. |
| System | Automatic actor with no login: intake routing, recurrence check, the SLA and timeout job, capacity enforcement and the last-role-done step. |

## 3. The journey of a complaint

| Stage | Status and phase | What happens | Who acts | Transitions | Scenario |
|---|---|---|---|---|---|
| Intake | Reported / Triage | The resident picks a flat or shared area, a category and describes the problem. The system looks up the zone, sets the due times from the category, writes the first history row and checks whether the same fault keeps coming back. | Resident, System | T1, T2, T3 | A resident in Tower 7 reports that the lift light is out and the ticket lands on the Coordinator's desk. |
| Triage and clarification | Reported / Triage, Awaiting Resident | The Coordinator confirms the complaint, hands it to the ZM, closes it as duplicate, or asks the resident to clarify. The ZM can take over any ticket in the zone. | Coordinator, ZM, Resident | T4 to T14 | The description says only "not working". The Coordinator asks which lift and the resident answers inside the 72 hour window. |
| Assignment | Reported / Assigned | Priority is set and every trade role gets one named vendor. Vendors accept or reject. The ticket stays Reported until the first vendor accepts. | Coordinator or ZM, Vendor | T15, T17, T20 | The ZM names an electrician and waits for the reply. |
| Execution | In Progress / Accepted, Working | The first acceptance moves the ticket to In Progress. Vendors start work and mark their own roles done. The last role done sends the ticket to Under Review, exactly once. | Vendor, System | T16, T18, T19 | An electrician and a civil worker finish together and only one of them moves the ticket. |
| Verification | Under Review / Verifying | The ZM checks the work. If it is fixed the resident gets the confirmation window. If not, the ZM orders rework, up to the reopen limit. | ZM | T21, T22, T23, T44 | The light still flickers, so the ZM orders rework. |
| Resident decision | Under Review / Confirming | The resident has 48 hours to confirm or reject the fix. Silence counts as acceptance. A rejection returns the ticket to the ZM first. | Resident, System | T32, T41, T42, T43 | The resident confirms the next morning and the ticket closes as Fixed. |
| Escalation and delegation | Any open status, handler GM | A ticket reaches the GM by manual escalation, the 1.5x rule, a recurring Critical or sensitive complaint, a second send-back or the reopen limit. The GM decides, or delegates the ticket to a ZM for good. | ZM, System, GM | T3, T13, T24, T25, T26 to T31, T43, T44 | A basement leak passes 1.5x its target. The GM brings in another plumber, and later delegates the ticket back to the ZM. |
| Closure | Closed | Every ticket ends with one resolution: Fixed, Unresolved, Duplicate, Invalid or Withdrawn. | Resident, Coordinator, ZM, GM, System | T7, T9, T27, T31, T32, T38, T40, T41 | A duplicate pump complaint closes at once, linked to the first report. |
| Dispute and reopen | Disputed | Within 7 days a resident may dispute a Duplicate, Invalid or Unresolved closure once. The ZM decides in 48 hours, or the GM if the ticket was on the GM's desk. The GM can reopen any closed ticket within 7 days. | Resident, ZM, GM, System | T34 to T39 | A resident shows the earlier ticket was a different fault. The ZM upholds the dispute and the ticket returns to triage. |

## 4. Lifecycle diagram

Status-level view of the five states. Moves inside a status (phase and handler changes) are left out, and so are the actors. The lifecycle is cyclic on purpose, because rework, rejected fixes and upheld disputes send tickets back.

> *[Diagram: in the source PDF this is an embedded image. The text labels recoverable from it are listed below. The five nodes are Reported, In Progress, Under Review, Closed and Disputed, with a start marker leading into Reported.]*
>
> - Start → Reported: T1
> - Reported → In Progress: T16 first vendor accepts
> - Reported → Closed: T7, T9, T40, T27, T31
> - In Progress → Under Review: T19, T26, T28
> - In Progress → Closed: T27, T31
> - Under Review → In Progress: T22, T42 rework
> - Under Review → Closed: T32, T41, T27, T31
> - Closed → Disputed: T34
> - Closed → Reported: T39 reopen, no vendor yet
> - Closed → In Progress: T39 reopen
> - Disputed → Reported: T37 upheld
> - Disputed → Reported / In Progress: T29 GM reopens
> - Disputed → Closed: T38, T31

## 5. Rules and definitions register

This register lists every rule and definition we enforce. The Enforced by column points to the transition, invariant or engine that makes the rule true.

### 5.1 Definitions

| # | Term | Definition | Scenario |
|---|---|---|---|
| D1 | Ticket | One complaint record, created when a resident submits. | A resident reports a leak and receives a ticket number. |
| D2 | Zone | A named part of the township under one ZM. Every tower and every shared area belongs to exactly one zone. | Tower 7 belongs to Zone A. |
| D3 | Location | The flat or the shared area a complaint is about. Exactly one of the two is filled. | The pool, or Flat 704. |
| D4 | Trade role | One kind of skilled work a ticket needs, such as plumbing. Each trade role has one named vendor. The database calls it TicketRole. | A burst pipe needs a plumber and a mason, so it has two trade roles. |
| D5 | Status | One of the five states the resident sees: Reported, In Progress, Under Review, Closed, Disputed. | The resident sees Under Review. |
| D6 | Phase | The internal sub-state inside a status: Triage, Awaiting Resident, Assigned, Accepted, Working, Verifying, Confirming. | Under Review / Verifying means the ZM has to check the work. |
| D7 | Handler | The desk that owns the next decision: Coordinator, ZM or GM. Always filled. | A freshly submitted ticket has handler Coordinator. |
| D8 | GM desk | The set of tickets whose handler is GM. | A ticket escalated at 1.5x is on the GM's desk. |
| D9 | Delegation | The GM hands a ticket from the GM's desk to the ZM of its zone, who then handles it from that point on. | The GM delegates a ticket back after approving the new vendor plan. |
| D10 | Escalated flag | True once a ticket has gone to the GM's desk. It is history for reports and never clears. | A delegated ticket still counts as escalated in the monthly report. |
| D11 | Confirmed flag | Who confirmed that the complaint is real and in the right zone, and when. | The Coordinator confirmed it at 9:10. |
| D12 | First-pass ticket | A ticket in Reported / Triage with no dispute history. | The ZM may still send it back. |
| D13 | Returned ticket | A ticket back on the ZM's desk after a rejected fix or an upheld dispute. The ZM may only assign or escalate it. | The resident rejected the fix, so the ZM must name vendors again or escalate. |
| D14 | Recurring complaint | The next complaint with the same location and category once the count in the last 90 days reaches the threshold (3 in tests). | The third low-pressure complaint from Flat 502. |
| D15 | Severity | A property of the category: Low, Medium, High or Critical. | Gas smell is Critical, a loose bench is Low. |
| D16 | Priority | A property of the ticket that the Coordinator or ZM sets, with the same four values. | The ZM raises a lift fault to High. |
| D17 | Effective severity | The priority if it is set, otherwise the category severity. | A Low category ticket the ZM sets to High counts as High. |
| D18 | SLA target | The hours we allow, set per category: a response target and a resolution target. | Plumbing: respond in 24 hours, resolve in 72. |
| D19 | Response clock | Runs from submission to the first vendor acceptance. | Stops when the electrician accepts. |
| D20 | Resolution clock | Runs from the first acceptance until the ticket enters Confirming. | Stops when the ZM verifies the work. |
| D21 | Due time | The moment a clock reaches its SLA target. | Submitted at 9:00 with a 24 hour target, due next day at 9:00. |
| D22 | Resident-held time | Time the ticket waited on the resident: Awaiting Resident and the 48 hour confirmation wait. | The resident took 40 hours to answer. |
| D23 | Counted time | Elapsed time minus resident-held time. | 50 hours elapsed with 40 held counts as 10 hours. |
| D24 | Urgency (u) | Counted time divided by the SLA target of the running clock. | 12 counted hours on a 24 hour target gives u = 0.5. |
| D25 | Queue score | The number that orders the queues, built from effective severity and urgency (rule C11). | A breached Low ticket outranks a fresh Critical one. |
| D26 | Capacity and load | Capacity is the most accepted roles a vendor may hold. Load is the accepted roles not yet done. | Capacity 5 and load 5 means the vendor is full. |
| D27 | Offer deadline | The time by which a named vendor must accept or reject: 2 hours for Critical, 12 hours for others. | A plumber offered a Medium job at 9:00 must reply by 21:00. |
| D28 | Reopen count and limit | Failed-fix verdicts so far (ZM rework and resident rejections), and the limit of 2. | Two reworks are used up. |
| D29 | Resolution | The outcome on a closed ticket. Fixed: confirmed or lapsed after verification. Unresolved: the GM stopped, with a reason. Duplicate: linked to an open original. Invalid: no reply or confirmed not valid. Withdrawn: the resident withdrew before any vendor accepted. | A builder-defect ticket closes as Unresolved. |
| D30 | Version | A counter that rises on every update and detects two people changing the same ticket. | The second assigner receives 409. |

### 5.2 Classification, scoring and clocks

| ID | Rule | Value or formula | Scenario |
|---|---|---|---|
| C1 | Every category has a severity, set by the GM. | Low, Medium, High or Critical | The GM marks Gas smell as Critical. |
| C2 | Every category has a response target and a resolution target in hours, set by the GM. Changing a target applies to new tickets only. Illustrative seeds for the synthetic data (proposed): Critical 4 and 24, High 8 and 48, Medium 24 and 72, Low 48 and 168. | `response_sla_h` , `resolution_sla_h` | The GM shortens the Critical lift target and old tickets keep their old due times. |
| C3 | A category can be marked sensitive. A recurring complaint in a sensitive category goes straight to the GM. | `is_sensitive` | A recurring complaint about harassment goes to the GM. |
| C4 | The Coordinator or ZM sets the ticket priority at assignment. It starts as the category severity (proposed) and can change later with a reason. | Low, Medium, High, Critical | The Coordinator raises a Medium leak to High. |
| C5 | Effective severity is the priority if set, otherwise the category severity. | one of four values | The ZM lowers a ticket to Low and the queue treats it as Low. |
| C6 | Severity weight w (proposed). | Low 1, Medium 2, High 3, Critical 4 | A Critical ticket weighs four times a Low one. |
| C7 | The response clock runs from submission to the first acceptance. Its due time is submission plus the response target, and resident-held time moves it later. | `response_due_at` | Submitted at 9:00 with a 24 hour target and 3 held hours, due at 12:00 next day. |
| C8 | The resolution clock runs from the first acceptance until Confirming. Its due time is the first acceptance plus the resolution target. A GM reassignment sets a new due time. ZM rework does not reset it. | `resolution_due_at` | Rework does not give the vendor extra time. |
| C9 | Counted time is elapsed time minus logged resident-held time. It is computed when read. | counted = elapsed − held | A slow resident does not add to the ZM's clock. |
| C10 | Urgency u is counted time divided by the target of the running clock: the response target while Reported, the resolution target while In Progress or Verifying. | u = counted ÷ target | 18 counted hours of a 24 hour target gives u = 0.75. |
| C11 | Queue score S (proposed): while u is below 1, S = w × (1 + u). Once u reaches 1 the ticket is breached and S = 10 + 10 × (u − 1) + w. A higher score goes first and an older submission breaks ties. | S as above | Any breached ticket outranks any unbreached one, and a longer overrun ranks higher. |
| C12 | The ZM is alerted once at u = 1.0. At u = 1.5 the ticket goes to the GM's desk (T25). | 1.0 and 1.5 | A High ticket with an 8 hour target reaches the GM after 12 counted hours. |
| C13 | Scores are recomputed from the clock every time a queue is read, so tickets keep climbing while they wait (FR1.4). | read-time computation | An old Low ticket rises above newer Mediums after its target passes. |
| C14 | Recurrence key: (flat, category) or (shared area, category) over a rolling 90 days, with a threshold of 3 in tests. A recurring complaint skips the helpdesk. | `recurrence_window_days` , `recurrence_threshold` | The third report from Flat 502 goes to the ZM. |
| C15 | The zone comes from the location by a lookup: flat to tower to zone, or shared area to zone. | hash map, O(1) | The resident never types a zone. |
| C16 | The offer deadline depends on effective severity at the time of assignment. | 2 hours Critical, 12 hours others | A Critical role not answered in 2 hours returns to the assigner. |
| C17 | Vendors for a role are ranked by free slots, capacity minus load, highest first (proposed). | free = capacity − load | The ZM sees the electrician with most free slots on top. |

### 5.3 Workflow rules

| ID | Area | Rule | How it works | Enforced by | Scenario |
|---|---|---|---|---|---|
| W1 | Intake | One entry point | Every complaint is raised in the system by a resident for the own flat or a shared area. | T1, I7 | A resident of Flat 704 picks the flat and describes a leak. |
| W2 | Intake | Automatic zone | The zone comes from the location and is never typed by the resident. | C15 | The resident of Tower 7 never sees zone names. |
| W3 | Triage | Coordinator authority | The Coordinator can fix the category, confirm, hand off, ask the resident, close duplicates, set priority, assign and change vendors. This holds only while the handler is Coordinator and the ZM has not acted. | T4 to T9, T14, T15, T20, `zm_acted_at` | The Coordinator names a plumber, the ZM changes the vendor, and the Coordinator can no longer edit. |
| W4 | Triage | ZM authority | The ZM has the final say in the zone: takes over, confirms, sends back, assigns, verifies, orders rework, decides disputes and escalates. | T10 to T12, T15, T20 to T24, T37, T38 | The ZM overrules a clarification request and takes over the ticket. |
| W5 | Triage | Confirmation | The confirmed flag records who confirmed the ticket and when. A ZM or GM who assigns or moves the ticket on stamps it if it is empty. | I3, I4 | The ZM assigns without confirming first and the system stamps the ZM as confirmer. |
| W6 | Triage | Clarification | The Coordinator may ask the resident when the description is unclear. The resident has 72 hours and the wait is logged. With no reply, or a reply saying there is no issue, the Coordinator may close the ticket as Invalid. | T6, T8, T9 | The resident never answers, so the Coordinator closes it after 72 hours. |
| W7 | Triage | Not genuine path | After a ZM send-back for Not genuine, the Coordinator must ask the resident before confirming. | T4 guard | The Coordinator cannot simply confirm a ticket the ZM doubted. |
| W8 | Triage | Send-back | The ZM may send a first-pass ticket back once, with a reason. A second send-back escalates to the GM. | T12, T13 | The ZM sends a wrong-zone ticket back and the Coordinator fixes the location. |
| W9 | Triage | Duplicates | A duplicate closes at once and is linked to an open original. The resident is told which ticket it duplicates. | T7 | The second report of the same pump failure closes as a duplicate. |
| W10 | Triage | Withdrawal | A resident can withdraw while the status is Reported, that is before any vendor accepts. A withdrawn ticket cannot be disputed. | T40 | The resident fixes the tap personally and withdraws. |
| W11 | Assignment | Assign guard | Assigning needs a priority and one named, active vendor per trade role, and the vendor must hold the trade. The Coordinator also needs the confirmed flag. | T15 | The ZM cannot assign an electrician to a plumbing role. |
| W12 | Assignment | Offers | A named vendor must reply by the offer deadline. A rejection or silence returns the role to the assigner. | T17, C16 | A plumber who stays silent for 12 hours loses the offer. |
| W13 | Assignment | Capacity | An accept takes a slot and an accept beyond capacity is refused with 409. The slot frees when the role is done or the vendor is removed. | T16, capacity counter | A full vendor tries to accept a sixth job and is refused. |
| W14 | Work | Status flip | The ticket stays Reported until the first vendor accepts and then becomes In Progress. The resident is never told work is in progress while no vendor has committed. | T16, I9 | Three vendors reject in a row and the ticket stays Reported. |
| W15 | Work | Completion once | The last role done moves the ticket to Under Review exactly once. | T19 countdown | Two vendors finish in the same second and one move is recorded. |
| W16 | Work | Assignment changes | A vendor, team or priority change needs a reason and recomputes the phase. | T20 | A vendor falls ill and the ZM replaces the vendor. |
| W17 | Verification | Under Review honesty | A vendor's completion is only a claim. The ticket shows Under Review until it is verified. | T19, T21 | The resident sees Work done, being checked, not Fixed. |
| W18 | Verification | Verifier | The ZM verifies. On a GM-desk ticket the GM decides and the ZM only gives a verdict when asked. | T21, T23, T26, T28 | The GM asks the ZM for an on-site check and decides afterwards. |
| W19 | Verification | Resident confirmation | After verification the resident has 48 hours to confirm or reject. Silence counts as acceptance. The confirm button can read Mark as resolved. | T32, T41 | The resident is travelling and the ticket closes as Fixed after 48 hours. |
| W20 | Verification | Reopen limit | ZM rework and resident rejections share one count. Two rounds are allowed and the next failure goes to the GM. | T22, T42, T43, T44 | After two failed repairs a third failure escalates. |
| W21 | Verification | Returned tickets | After a rejected fix or an upheld dispute the ZM may only assign or escalate. Closing, sending back and marking duplicate are blocked. | T15, T24 | The resident rejects the fix and the ZM names different vendors. |
| W22 | Verification | Resident-held time | Resident waits are logged. Breach reports and the 1.5x test use counted time. | C9, C12 | The resident takes 40 hours to reject a fix and the ZM is not charged for them. |
| W23 | GM desk | Ways onto the desk | A ticket reaches the GM's desk through T3, T13, T24, T25, T35, T39, T43 or T44. | handler GM | A recurring Critical complaint goes there at intake. |
| W24 | GM desk | GM decides | Only the GM acts on a GM-desk ticket. The ZM can only submit a verdict when the GM asks. | handler guards | The ZM cannot verify a ticket the GM holds. |
| W25 | GM desk | Delegation | The GM may hand any open GM-desk ticket to the ZM of its zone. The handler becomes the ZM, status and phase stay as they are, and the ZM regains full authority. The escalated flag stays for history. The ZM can escalate again. | T30 | The GM sees the ZM can handle a delayed ticket from now on and delegates it. |
| W26 | GM desk | Unresolved | Only the GM closes a ticket as Unresolved, with a reason. The resident may dispute once. | T27 | A builder-defect repair closes as Unresolved with a note. |
| W27 | GM desk | Reopen | The GM may reopen a closed ticket within 7 days. | T39 | The RWA president complains after a Fixed closure. |
| W28 | Closure | One resolution | Each closed ticket has exactly one resolution. | I1 | A ticket cannot be both Fixed and Duplicate. |
| W29 | Disputes | Dispute rules | Only Duplicate, Invalid and Unresolved closures can be disputed, once, within 7 days, with a reason. | T34, I6 | A Fixed ticket cannot be disputed. |
| W30 | Disputes | Dispute routing | A ticket the GM held goes straight to the GM. Otherwise the ZM decides within 48 hours and silence escalates to the GM. | T34, T35, T37, T38 | A disputed Invalid closure goes to the ZM. |
| W31 | Access | Scope | Residents see only their own flat's complaints, vendors only their own roles and ZMs only their zone. The Coordinator and GM read the whole township. | scope in queries | A resident of Tower 3 cannot open a complaint from Tower 7. |
| W32 | Access | Permission relation | An action is allowed only if the role holds that action in the permission relation. | Roles and Permissions Document | A vendor cannot call the verify action. |
| W33 | Access | Accounts | Authentication is passwordless. Users sign in with a 6-digit OTP (delivered by email as the primary channel, or SMS optionally) or with Google Sign-In. The first OTP verification or Google sign-in auto-creates an account. Inactive accounts cannot receive OTPs or complete a Google sign-in. Each user has one role. Session tokens are stored server-side and are revoked immediately when an account is deactivated. | User table, `otp_request` table, `user_session` table | A deactivated vendor cannot receive an OTP and cannot sign in. |
| W34 | Integrity | Audit | Every status, phase, handler, confirmation, role event and field edit is written to an append-only history by triggers. | triggers 1, 2, 4, 5 | The GM sees who changed a priority and when. |
| W35 | Integrity | One time source | Database time at commit decides every window and deadline. | transactions | A reply at 72 hours and one minute is refused. |
| W36 | Integrity | Version check | Every state-changing write carries the ticket version. A stale version returns 409. | `version` | The second of two assigners sees 409. |
| W37 | Integrity | Valid pairs | The (status, phase) pair must be one of the ten allowed pairs, and every change must match a transition row. | I8, trigger 3 | A write of Under Review with phase Working is refused. |
| W38 | Configuration | Parameters | GM-managed windows and limits apply to new tickets. Stored deadlines do not move. | Parameter table | The GM cuts the confirmation window and open tickets keep their deadline. |
| W39 | Configuration | Category changes | Changing the category of a Reported ticket recomputes its due times. A retired category is hidden from new complaints. | T-free field change, `is_active` | The Coordinator moves a ticket from Electrical to Plumbing. |
| W40 | Photos | Attachments | Residents, the Coordinator and the ZM can add photos. A vendor can add photos only on a role the vendor accepted. | Attachment rules | The electrician uploads an after photo. |
| W41 | Notices | Notifications | Users receive in-app notices for clarification requests, fix confirmation, SLA alerts, disputes and status news. | Notification table | The resident sees Please confirm the fix. |

## 6. Parameters

The GM manages these values. The first four were decided by the team. The names of the others are proposed.

| Parameter key | Value | What it controls | Scenario |
|---|---|---|---|
| `confirm_window_h` | 48 | Hours the resident has to confirm or reject a fix during Confirming. Silence counts as acceptance. | Verified at 6 pm on Monday, the ticket closes at 6 pm on Wednesday if the resident does nothing. |
| `reopen_limit` | 2 | Rework rounds allowed, counting ZM rework and resident rejections together, before the next failure goes to the GM. | Two reworks are done and the third failure escalates. |
| `dispute_window_days` | 7 | Days after closing in which the resident may dispute once and the GM may reopen. | A ticket closed on the 3rd can be disputed until the 10th. |
| `dispute_decision_h` | 48 | Hours the ZM has to decide a dispute before it goes to the GM. | A dispute filed on Friday evening reaches the GM on Sunday evening if the ZM stays silent. |
| `clarify_window_h` (proposed) | 72 | Hours the resident has to reply to a clarification request. | The resident gets three days to say which lift is meant. |
| `vendor_reply_critical_h` (proposed) | 2 | Hours a vendor has to accept or reject a Critical role. | A gas-leak role not answered in two hours returns to the assigner. |
| `vendor_reply_other_h` (proposed) | 12 | Hours a vendor has to accept or reject a role of any other severity. | A routine tap repair not answered in 12 hours returns to the assigner. |
| `recurrence_window_days` (proposed) | 90 | Length of the rolling window used for the recurrence key. | Complaints older than 90 days stop counting. |
| `recurrence_threshold` (proposed) | 3 (also 3 in tests) | Number of complaints inside the window that makes the next one recurring. | The third report from the same flat and category is flagged. |
| `sla_alert_multiple` (proposed) | 1.0 | Share of the SLA target at which the ZM is alerted. | A ticket with a 24 hour target alerts at 24 counted hours. |
| `sla_escalate_multiple` (proposed) | 1.5 | Share of the SLA target at which the ticket goes to the GM. | The same ticket escalates at 36 counted hours. |
| `sla_job_interval_min` (proposed) | 10 | Minutes between runs of the job that handles SLA checks and timeouts. | An overdue offer is picked up within ten minutes. |

Response and resolution targets per category are set by the GM on each category (rule C2). The severity weights and the queue score formula (rules C6 and C11) are design constants for now.

## 7. Scenarios from start to finish

The flats and towers are illustrative.

| # | Scenario | What happens | Path | What the resident sees |
|---|---|---|---|---|
| 1 | Straightforward fix | The Tower 7 lift light is reported. The Coordinator confirms and assigns an electrician who accepts, starts and finishes. The ZM verifies and the resident confirms. | T1, T4, T15, T16, T18, T19, T21, T41 | Received, work in progress, work done and being checked, fixed and please confirm, closed as Fixed. |
| 2 | Clarification, then fix | The complaint says "not working". The Coordinator asks which lift, the resident answers, the Coordinator confirms and hands the ticket to the ZM, who assigns. | T1, T6, T8, T4, T14, T15 | Received, with a badge asking for more information, then received again. |
| 3 | Silence, then dispute | The resident never answers a clarification request, so the Coordinator closes the ticket as Invalid after 72 hours. The resident disputes within 7 days and the ZM upholds. | T1, T6, T9, T34, T37, T15 | Closed (Invalid), then dispute under review, then received. |
| 4 | Duplicate | Three residents report the same pool pump failure. The second and third close as duplicates of the first. | T1 three times, T7 twice | Closed (Duplicate of the first ticket), with a note that a dispute is possible. |
| 5 | Recurring fault | Flat 502 reports low water pressure for the third time in 90 days. The ticket skips the helpdesk and lands with the ZM. A recurring gas-smell complaint would go to the GM. | T1, T2 (or T3) | Received. |
| 6 | Vendor does not answer | A plumber named for a role stays silent for 12 hours. The role returns to the ZM, who names another plumber. | T15, T17, T20, T16 | Received, arranging a vendor, then work in progress. |
| 7 | ZM rework | The ZM checks the repair and the light still flickers. The ZM orders rework (round 1) and the vendor repeats the job. | T22, T16, T18, T19, T21, T41 | Work done and being checked, then work in progress again, then fixed. |
| 8 | Resident rejects the fix | The ZM verifies but the tap still drips. The resident rejects within 48 hours and the ticket returns to the ZM, who assigns again. A third failure goes to the GM. | T21, T42, T15, T16, T18, T19, T21, T41 (third failure: T43) | Fixed and please confirm, then work in progress, tagged Reopened. |
| 9 | Silent resident | The ZM verifies and the resident does not respond for 48 hours. | T21, T32 | Fixed and please confirm, then closed as Fixed. |
| 10 | SLA breach | A High lift complaint sits in Reported / Assigned past 1.5x its target. The ZM was alerted at 1.0x. The GM reassigns vendors with a new due time. | T25, T29 | Received, then work in progress once a vendor accepts. |
| 11 | Delegation | After the GM took over the delayed lift ticket and set a new plan, the GM sees the ZM can handle it from now on and delegates it. The ZM verifies and closes it. | T25, T29, T16, T18, T19, T30, T21, T41 | No visible change, since the GM's desk is not shown. |
| 12 | Wrong zone | The ZM sees the complaint belongs to another zone and sends it back. The Coordinator asks the resident to confirm the location, the zone is recomputed, and the ticket goes to the right ZM. A second send-back goes to the GM. | T12, T6, T8, T4, T14 (second send-back: T13) | Received, with a badge asking for more information, then received. |
| 13 | Withdrawal | The resident solves the problem and withdraws before any vendor accepts. | T40 | Closed (Withdrawn). |
| 14 | Dispute on an Unresolved closure | The GM closes a builder-defect ticket as Unresolved. The resident disputes within 7 days. The GM held the ticket, so the dispute goes straight to the GM, who reassigns or confirms the closure. | T27, T34, then T29 or T31 | Closed (Unresolved), then dispute under review. |

## 8. What the resident sees (proposed labels)

The label comes from the status and phase. The GM's desk is not shown, because it tells the resident nothing about the problem. A badge appears only when the resident has something to do.

| Status and phase | Label shown to the resident | Badge |
|---|---|---|
| Reported / Triage | Received | none |
| Reported / Awaiting Resident | Received | We need more information from you |
| Reported / Assigned | Received, arranging a vendor | none |
| In Progress / Assigned | Work in progress, arranging a vendor | none |
| In Progress / Accepted | Work in progress, vendor accepted | none |
| In Progress / Working | Work in progress, work has started | none |
| Under Review / Verifying | Work done, being checked | none |
| Under Review / Confirming | Fixed, please confirm within 48 hours | Your action is needed |
| Closed | Closed, with the resolution shown (Fixed, Unresolved, Duplicate, Invalid or Withdrawn) | none |
| Disputed | Your dispute is under review | none |

Any ticket with a reopen count above 0 also carries a Reopened tag.

## 9. Who marks what at the end of a ticket

No one marks a ticket Resolved as a state. The old Resolved state is now the Confirming phase of Under Review. The people involved mark different things:

| Step | Who marks it | What they press | Result | Scenario |
|---|---|---|---|---|
| Work finished | Vendor | Mark role done | When the last role is done the ticket becomes Under Review / Verifying | The electrician finishes the wiring. |
| Work verified | ZM, or the GM on a GM-desk ticket | Verify, or Mark fixed | Under Review / Confirming, and the resident has 48 hours | The ZM tests the lift light. |
| Work not fixed | ZM | Rework | In Progress / Assigned | The light still flickers. |
| Fix confirmed | Resident | Confirm fix (the button can read Mark as resolved) | Closed (Fixed) | The resident confirms the next morning. |
| Fix rejected | Resident | Reject fix | In Progress / Assigned, with the ZM deciding first | The tap still drips. |
| No answer | System | none, after 48 hours | Closed (Fixed) | The resident never replies. |

## 10. Notifications (proposed mapping)

Notifications are in-app. The five types are the values of the notification type list.

| Event | Who is told | Type | Scenario |
|---|---|---|---|
| Coordinator asks for clarification (T6) | Resident | CLARIFICATION_REQUEST | "Which lift is affected?" with a 72 hour reply window. |
| ZM verifies or GM marks fixed (T21, T26) | Resident | FIX_CONFIRMATION | The resident has 48 hours to confirm or reject. |
| Status or phase changes the resident can see | Resident | STATUS_UPDATE | A vendor accepted and work has started. |
| Vendor named or changed (T15, T20, T29) | Vendor | STATUS_UPDATE | The electrician sees a new offer with its reply deadline. |
| SLA target reached (1.0x) | ZM | SLA_ALERT | Ticket 1204 reached its target time. |
| Ticket goes to the GM's desk | GM, and the ZM when the ZM owned it | SLA_ALERT | A basement leak passed 1.5x its target. |
| GM delegates a ticket (T30) | ZM | STATUS_UPDATE | The GM handed you the lift ticket to handle from now on. |
| Dispute filed, upheld or rejected (T34, T37, T38) | ZM when filed, resident on the decision | DISPUTE_UPDATE | The ZM upheld the dispute and the ticket is back in triage. |
| Closure (T7, T9, T27, T31, T32, T41) | Resident | STATUS_UPDATE | Closed as Duplicate, with the 7 day dispute window. |

## 11. Assumptions

- The data is synthetic. The system runs in a browser, on a phone or a laptop, and notifications are in-app.
- Scale: 20 to 25 towers, about 2,500 to 3,000 flats, 5,000 open complaints and 50 concurrent users.
- Vendors serve every zone. There is no zone filter on vendors.
- The technology stack is fixed at Gate 2: FastAPI (backend), React (frontend), PostgreSQL on Neon.
- Authentication is passwordless. Email OTP is the primary channel (zero cost). SMS OTP via a gateway such as MSG91 or AWS SNS is optional. Google Sign-In is available for all roles as a convenience.
- Account creation for staff roles (Coordinator, ZM, GM, Vendor) is done by the GM through `POST /users`. Resident accounts are auto-created on first OTP verification if the email or phone is not yet registered.
