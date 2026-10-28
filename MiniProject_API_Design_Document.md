# 🌐 API Design Document

> 📌 Working draft v0.2. Related engines: E4 Access and Interface (Shreyas) and E5 Rule Enforcement (shared). Endpoint names are proposed. The transition numbers refer to the State and State Transitions Document and the Who column follows the permission matrix in the Roles and Permissions Document. No request or response schemas are fixed yet. Version 0.2 uses the five states with phases, adds the GM delegation endpoint (number 43) and retires number 71, so there are 72 active endpoints.

1. Endpoint count
2. Conventions
3. Status codes
4. Common request fields (proposed)
5. Endpoints
   - 5.1 Access, intake and reading (1 to 12)
   - 5.2 Triage and clarification (13 to 22)
   - 5.3 Assignment and vendor work (23 to 30)
   - 5.4 Verification, resident decision and disputes (31 to 38)
   - 5.5 GM desk handling (39 to 45)
   - 5.6 Notifications (46 to 47)
   - 5.7 Master data and configuration (48 to 73)
6. Transition to endpoint map
7. Design notes

## 1. Endpoint count

| Group | Endpoints | Numbers |
|---|---|---|
| Access, intake and reading | 12 | 1 to 12 |
| Triage and clarification | 10 | 13 to 22 |
| Assignment and vendor work | 8 | 23 to 30 |
| Verification, resident decision and disputes | 8 | 31 to 38 |
| GM desk handling | 7 | 39 to 45 |
| Notifications | 2 | 46 to 47 |
| Master data and configuration | 25 | 48 to 73, with number 71 retired |
| Total | 72 | 45 workflow endpoints, 2 notification endpoints, 25 configuration endpoints. The numbers run to 73 and number 71 is never reused. |

## 2. Conventions

| Item | What we do | Why |
|---|---|---|
| Base path | `/api/v1` | Versioned, so later changes do not break clients. |
| Format | REST with JSON over HTTPS | Matches the standards in the requirements. |
| Authentication | A bearer token (JWT) from the login endpoint, carrying the user id, role and scope | One token per session and no server-side lookup on each call. |
| Authorisation | Five checks in order: token, permission, scope inside the query, guards, version | The order is shown in the Roles and Permissions Document. |
| Naming | Nouns for resources ( `/complaints` ). Action endpoints for workflow moves, such as `POST /complaints/{id}/assign` . `PATCH` for field edits. `PUT` for replacing a configuration set. | Each workflow move is a business action with its own guards and its own permission row. |
| Status and phase in responses | Every ticket response carries `status` , `phase` , `handler` and the resident-facing label. The resident view hides the handler value GM. | The resident reads five states and never sees the GM's desk. |
| Time | Database server time at commit decides every deadline. Timestamps are returned in UTC (proposed). | Boundary tests stay deterministic. |
| Errors | A JSON body with a code and a message. A 409 also carries the current state and version (proposed). | The client can refresh and retry. |
| Paging | `page` and `page_size` on every list (proposed). | Keeps responses small at 5,000 open complaints. |
| Photos | Attachments carry a file reference. The transfer method is fixed at G2. | The stack decides how files are stored. |

## 3. Status codes

| Code | Meaning in our API | When we return it | Scenario |
|---|---|---|---|
| 200 | The read or action worked | Reads and most workflow actions. The body shows the updated state. | The ZM verifies a ticket and sees it as Under Review / Confirming. |
| 201 | A new record was created | Raising a complaint, adding a photo, creating master data | A resident raises a complaint and gets the ticket id. |
| 400 | The request is malformed | A missing field, a bad value, both a flat and a shared area on one complaint | A complaint arrives with no category. |
| 401 | The caller is not authenticated | No token, an expired token, a wrong password or an inactive account | A session expired overnight. |
| 403 | The role may not do this | The role lacks the action in the permission relation | A vendor calls the verify endpoint. |
| 404 | The ticket is not there for this caller | The ticket does not exist or lies outside the caller's scope. We do not reveal which. | A ZM opens a ticket from another zone. |
| 409 | The data changed or capacity is full | A stale `version` , or a vendor at capacity | Two assigners act on one ticket and the second gets 409. |
| 422 | The request is clear but a rule forbids it | A wrong status or phase, a wrong handler, a closed window, a missing reason, the reopen limit, an invalid transition | A resident confirms a fix 49 hours after verification. |

## 4. Common request fields (proposed)

| Field | Where | Used by | Meaning |
|---|---|---|---|
| `version` | Body | Every state-changing complaint endpoint | The ticket version the caller last saw. A stale value returns 409. |
| `reason` | Body | Send-back, role reject, rework, escalate, reject-fix, dispute, dispute reject, close-unresolved, assignment change | The text a rule demands, kept in the audit log. |
| `reason_code` | Body | Send-back | Wrong zone or Not genuine. |
| `note` | Body | Mark a role done, delegate | The vendor's completion note, or the GM's optional note to the ZM. |
| `question` | Body | Request clarification | What the Coordinator needs the resident to clarify. |
| `original_id` | Body | Close as Duplicate | The open ticket this one duplicates. |
| `priority` and `roles` | Body | Assign, reassign | The priority and one vendor for each trade role. |
| `due_at` | Body | Reassign | The new due time the GM sets. |
| `reply_type` | Body | Reply | Clarify, or No issue. |
| Filters, `page` , `page_size` | Query | List endpoints | Narrowing and paging. |

## 5. Endpoints

### 5.1 Access, intake and reading (1 to 12)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 1 | `POST /auth/login` | Public | Checks the email and password and returns a signed token that carries the user id, the role and the scope (flat, zone or vendor id). The token goes on every later call. | 401 for a wrong password or an inactive account. | A resident opens the app and signs in. |
| 2 | `GET /auth/me` | All | Returns the caller's profile, role and scope, plus the actions the role may use, so the screen can hide the rest. | 401 without a valid token. | The web app loads and hides actions the role cannot use. |
| 3 | `POST /complaints` | Resident | Raises a complaint for the resident's own flat or a shared area, with category, description and optional photos. The ticket starts as Reported / Triage / Coordinator, the zone is looked up, the due times are set and the recurrence check runs. A recurring complaint goes to the ZM (T2) or to the GM (T3). Returns 201 with the ticket id and status. | 400 if neither or both of flat and shared area are given. 404 for a flat that is not the resident's own. | A resident of Flat 704 reports a leaking pipe in the bathroom. |
| 4 | `GET /complaints` | Resident, Coordinator, ZM, GM | Lists complaints inside the caller's scope, with filters for status, phase, handler, category, zone, recurring and escalated, and with paging. A resident sees the own flat, a ZM the own zone, and the Coordinator and GM the whole township. | Out-of-scope rows are never returned. 403 for Vendors, who use endpoint 26. | The ZM opens the zone list filtered to Under Review. |
| 5 | `GET /complaints/{id}` | Resident, Coordinator, ZM, Vendor, GM | Returns one complaint with its roles, flags, deadlines, status, phase and handler. Vendors see only their own roles. | 404 for a ticket outside the caller's scope. | A vendor opens a job to read the address and the note. |
| 6 | `GET /complaints/{id}/history` | Resident, Coordinator, ZM, GM | Returns the timeline from the audit log in time order: status, phase and handler changes, confirmations and role events. Residents see only resident-facing events. | 404 outside the scope. | A resident checks when the vendor accepted. |
| 7 | `GET /complaints/{id}/attachments` | Same as 5 | Lists the photos and captions attached to the complaint or to its roles. | As endpoint 5. | The ZM looks at the before photo. |
| 8 | `POST /complaints/{id}/attachments` | Resident, Vendor, Coordinator, ZM | Adds a photo with a caption to the ticket. A vendor can add photos only to a role the vendor accepted. | 403 if the vendor has not accepted. 404 outside the scope. Returns 201. | The electrician uploads an after photo. |
| 9 | `GET /queue` | Coordinator, ZM, GM | Returns the top N tickets that need the caller's action, ordered by the queue score (effective severity and urgency) with a heap. The Coordinator sees Reported / Triage tickets with handler Coordinator. The ZM sees tickets with handler ZM in the zone that need a decision: Triage, Assigned with no vendors named, Verifying, and Disputed (proposed). The GM sees tickets with handler GM. | 403 for Residents and Vendors. | The Coordinator starts the day and opens the most urgent ticket. |
| 10 | `GET /dashboard` | ZM, GM | Returns counts by status, category and SLA state for the zone (ZM) or the township (GM). | 403 for other roles. | The ZM checks how many tickets are close to their target. |
| 11 | `GET /reports/sla-breaches` | ZM, GM | Runs the breach query: tickets past their response or resolution due time, with logged resident-held time left out (proposed). | 403 for other roles. | The GM reviews last week's breaches. |
| 12 | `GET /audit` | GM | Returns the read-only audit log across tickets, filterable by ticket, actor, event type and date range. | 403 for other roles. There is no write route. | The GM investigates who changed a priority. |

### 5.2 Triage and clarification (13 to 22)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 13 | `PATCH /complaints/{id}/category` | Coordinator, ZM | Corrects the category while the ticket is Reported. Due times are recomputed from the new category and the change is logged as a field change. | Needs `version` . 422 unless the ticket is Reported. The Coordinator only while the handler is Coordinator and the ZM has not acted. | The resident chose Electrical for a leaking pipe and the Coordinator moves it to Plumbing. |
| 14 | `POST /complaints/{id}/confirm` | Coordinator, ZM | Records that the complaint is real, clear and in the right zone by setting `confirmed_by` and `confirmed_at` (T4 or T11). | Needs `version` . 422 unless the ticket is Reported / Triage or if it is already confirmed. The Coordinator is blocked after an unanswered Not genuine send-back. | The Coordinator reads the complaint and confirms it. |
| 15 | `POST /complaints/{id}/hand-off` | Coordinator | Moves the ticket to the ZM's desk by changing the handler, when the Coordinator is unsure (T5) or cannot set priority or team (T14). | Needs `version` . 422 unless the handler is Coordinator. | The Coordinator confirms an electrical fault and passes it on. |
| 16 | `POST /complaints/{id}/take-over` | ZM | Takes the ticket to the ZM's desk from the Coordinator, or from Awaiting Resident when the ZM overrules a clarification request (T10). | Needs `version` . 404 outside the zone. 422 unless the ticket is Reported / Triage or Reported / Awaiting Resident. | The ZM takes over a pump complaint. |
| 17 | `POST /complaints/{id}/send-back` | ZM | Returns a first-pass ticket to the Coordinator with a reason code, Wrong zone or Not genuine (T12). A second send-back on the same ticket sends it to the GM's desk instead (T13). | Needs `version` , `reason_code` and `reason` . 422 if the ticket is not first pass. | The ZM sees the complaint belongs to another zone. |
| 18 | `POST /complaints/{id}/request-clarification` | Coordinator | Asks the resident to clarify. The ticket moves to Reported / Awaiting Resident, the response clock is held, the 72 hour window starts and the resident is notified (T6). | Needs `version` and `question` . 422 unless the ticket is Reported / Triage with handler Coordinator. | The Coordinator asks which lift is meant. |
| 19 | `POST /complaints/{id}/reply` | Resident | The resident answers a clarification or corrects the complaint (T8), which returns the ticket to Triage with the zone recomputed. The reply type No issue states that there is no valid complaint, so the Coordinator can close it as Invalid (T9). | 422 after the 72 hour window or when the phase is not Awaiting Resident. 404 outside the own flat. | The resident answers Lift B in Tower 7. |
| 20 | `POST /complaints/{id}/close-duplicate` | Coordinator, ZM | Closes the ticket as Duplicate and links it to the open original. The resident is notified and the dispute window opens (T7). | Needs `version` and `original_id` . 422 if the original is not open. The ZM only on first-pass tickets. | The second report of the same pump failure is closed. |
| 21 | `POST /complaints/{id}/close-invalid` | Coordinator | Closes the ticket as Invalid after the 72 hour window passed with no reply, or after a confirming reply (T9). The dispute window opens. | Needs `version` . 422 before the window ends unless a confirming reply exists. | The resident never answered, so the Coordinator closes the ticket. |
| 22 | `POST /complaints/{id}/withdraw` | Resident | The resident withdraws the complaint and it closes as Withdrawn (T40). | 422 once the status is no longer Reported, that is after a vendor accepted. 404 outside the own flat. | The resident fixed the tap personally. |

### 5.3 Assignment and vendor work (23 to 30)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 23 | `POST /complaints/{id}/assign` | Coordinator, ZM | Sets the priority and names one vendor for each trade role. A Triage ticket moves to Reported / Assigned in one transaction (T15). Each vendor is notified with a reply deadline of 2 hours for Critical and 12 hours for others. The ZM's assignment stamps the confirmation if it is empty. On a returned ticket (In Progress / Assigned with no vendors) it names vendors again and changes no status or phase. | Needs `version` , `priority` and a vendor for every role. 409 if the version is stale. 422 if the Coordinator has no confirmation yet. 403 if the Coordinator tries after the ZM acted. | The ZM names an electrician and a mason for the lift fault. |
| 24 | `PATCH /complaints/{id}/assignment` | Coordinator (until the ZM acts), ZM | Changes a vendor, the team or the priority with a reason. The phase is recomputed from the roles and the capacity of removed vendors is freed (T20). | Needs `version` and `reason` . 422 unless the phase is Assigned, Accepted or Working. | A vendor falls ill and the ZM names a replacement. |
| 25 | `GET /vendors` | Coordinator, ZM, GM | Lists vendors by trade with current load against capacity, ranked by free slots, so the assigner picks someone who is free. | Optional trade filter. 403 for other roles. | The ZM sees electricians ranked by free slots. |
| 26 | `GET /vendors/me/jobs` | Vendor | Lists the calling vendor's own offers and accepted jobs with their deadlines. | 403 for other roles. | The electrician opens the app and sees a new offer. |
| 27 | `POST /ticket-roles/{id}/accept` | Vendor | Accepts the offered role and takes a capacity slot. The first acceptance on the ticket moves it to In Progress / Accepted and starts the resolution clock (T16). | 409 if the vendor is at capacity or the version is stale. 403 if the caller is not the named vendor. 422 if the offer expired. | The electrician has three free slots and accepts. |
| 28 | `POST /ticket-roles/{id}/reject` | Vendor | Rejects the offered role with a reason. The role returns to the assigner (T17). | Needs `reason` . 403 if the caller is not the named vendor. | The plumber is on leave and rejects the job. |
| 29 | `POST /ticket-roles/{id}/start` | Vendor | Starts work on an accepted role. The first start on the ticket moves it to In Progress / Working (T18). | 422 unless the role is accepted. | The electrician arrives and starts. |
| 30 | `POST /ticket-roles/{id}/done` | Vendor | Marks the own role done with a note and frees the capacity slot. The last open role moves the ticket to Under Review / Verifying, exactly once (T19). | Needs `note` . 422 unless the role was started. | The last vendor finishes and the ticket moves to Under Review. |

### 5.4 Verification, resident decision and disputes (31 to 38)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 31 | `POST /complaints/{id}/verify` | ZM | The ZM confirms the work is fixed. The ticket moves from Under Review / Verifying to Under Review / Confirming, the 48 hour window starts and the resident is notified (T21). On a GM-desk ticket it records a Fixed verdict for the GM instead and changes nothing else (T23). | Needs `version` . 422 unless the phase is Verifying. 404 outside the zone. | The ZM checks that the lift light works. |
| 32 | `POST /complaints/{id}/rework` | ZM | The ZM says the work is not fixed. The ticket returns to In Progress / Assigned and the reopen count rises by one (T22). At the reopen limit it goes to the GM's desk (T44). On a GM-desk ticket it records a Not fixed verdict for the GM (T23). | Needs `version` and `reason` . 422 unless the phase is Verifying. | The light still flickers and the ZM sends the vendor back. |
| 33 | `POST /complaints/{id}/escalate` | ZM | Sends the ticket to the GM's desk with a reason (T24). It also escalates a dispute (T35). | Needs `version` and `reason` . 422 on closed tickets and on tickets already on the GM's desk. | The ZM escalates a flood the vendors cannot handle. |
| 34 | `POST /complaints/{id}/confirm-fix` | Resident | The resident confirms the fix within 48 hours and the ticket closes as Fixed (T41). The screen button can read Mark as resolved. | 422 after the window or when the phase is not Confirming. 404 outside the own flat. | The resident confirms the next morning. |
| 35 | `POST /complaints/{id}/reject-fix` | Resident | The resident rejects the fix within 48 hours with a reason. The ticket goes to the ZM first, back to In Progress / Assigned with the reopen count raised (T42). At the reopen limit, or on a GM-desk ticket, it goes to the GM's desk (T43). | Needs `reason` . 422 after the window or when the phase is not Confirming. | The tap still drips after the repair. |
| 36 | `POST /complaints/{id}/dispute` | Resident | The resident disputes a Duplicate, Invalid or Unresolved closure within 7 days, once (T34). The dispute lands with the ZM, or with the GM when the GM held the ticket. | Needs `reason` . 422 for Fixed or Withdrawn closures, after the window, or on a second dispute. | The resident disagrees that the complaint was a duplicate. |
| 37 | `POST /complaints/{id}/dispute/uphold` | ZM | The ZM upholds a dispute on a Duplicate or Invalid closure. The resolution is cleared, the confirmation is stamped and the ticket returns to Reported / Triage on the ZM's desk to be assigned or escalated (T37). | Needs `version` . 422 unless the ticket is Disputed with handler ZM. | The resident proves it was a different fault. |
| 38 | `POST /complaints/{id}/dispute/reject` | ZM | The ZM rejects the dispute and the ticket closes again with its original resolution. No second dispute is possible (T38). | Needs `version` and `reason` . 422 unless the ticket is Disputed with handler ZM. | The ZM confirms the duplicate. |

### 5.5 GM desk handling (39 to 45)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 39 | `POST /complaints/{id}/resolve` | GM | The GM marks the work fixed on a ticket on the GM's desk. It moves to Under Review / Confirming and the 48 hour window starts (T26). | Needs `version` . 422 unless the handler is GM and a vendor has accepted. | After reviewing the photos the GM confirms the repair. |
| 40 | `POST /complaints/{id}/close-unresolved` | GM | Closes a GM-desk ticket as Unresolved with a reason. The resident is notified and may dispute once (T27). | Needs `version` and `reason` . 422 unless the handler is GM. | A builder-defect repair is beyond the RWA's remit. |
| 41 | `POST /complaints/{id}/send-to-verify` | GM | Asks the ZM to check the work. The ticket moves to Under Review / Verifying and stays on the GM's desk, and the ZM answers through the verify and rework endpoints (T28). | Needs `version` . 422 unless the handler is GM and a vendor has accepted. | The GM wants an on-site check before deciding. |
| 42 | `POST /complaints/{id}/reassign` | GM | Names vendors and sets a new due time (T29). The ticket moves to Assigned in Reported or In Progress according to whether a vendor ever accepted. From Disputed it upholds the dispute and reopens the ticket. | Needs `version` , `roles` and `due_at` . 422 unless the handler is GM. | The GM brings in a second plumber. |
| 43 | `POST /complaints/{id}/delegate` | GM | Hands a GM-desk ticket to the ZM of its zone from now on (T30). Only the handler changes. The ZM regains full authority and may escalate again. The escalated flag stays for history. | Needs `version` . A `note` is optional. 422 unless the handler is GM and the ticket is open. | The GM sees the ZM can handle the delayed lift ticket and delegates it. |
| 44 | `POST /complaints/{id}/close` | GM | Closes a GM-desk ticket as Duplicate or Invalid, or rejects a dispute on the GM's desk and keeps the original resolution (T31). | Needs `version` , and a reason when rejecting a dispute. | The GM decides that the Invalid closure stands. |
| 45 | `POST /complaints/{id}/reopen` | GM | Reopens a closed ticket within 7 days of closing. The resolution is cleared and the ticket returns to Reported / Triage or In Progress / Assigned with handler GM (T39). | Needs `version` . 422 after the window. | The RWA president complains about a closed ticket. |

### 5.6 Notifications (46 to 47)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 46 | `GET /notifications` | All | Lists the caller's in-app notifications, newest first, with their read state. | Only the caller's own notices. | The resident sees a request to confirm the fix. |
| 47 | `PATCH /notifications/{id}/read` | All | Marks one notification as read. | 404 if it is not the caller's. | The resident opens the notice and the badge count drops. |

### 5.7 Master data and configuration (48 to 73)

| # | Method and path | Who | What it does | Rules and errors | Scenario |
|---|---|---|---|---|---|
| 48 | `GET /zones` | All | Lists zones with their ZM. | none | The GM checks which zone has no ZM. |
| 49 | `POST /zones` | GM | Creates a zone. | 400 on a duplicate name. | A new phase of the township opens as a new zone. |
| 50 | `PATCH /zones/{id}` | GM | Renames a zone or names its ZM. | 422 if that person already manages another zone. | A ZM retires and the GM names a replacement. |
| 51 | `GET /towers` | All | Lists towers with their zone. | none | The resident picks the tower while raising a complaint. |
| 52 | `POST /towers` | GM | Creates a tower inside a zone. | 400 on a duplicate name. | A new tower is handed over. |
| 53 | `PATCH /towers/{id}` | GM | Renames a tower or moves it to another zone. The new mapping applies to new complaints (proposed). | none | The township redraws the zone boundaries. |
| 54 | `GET /flats` | Coordinator, ZM, GM | Lists flats per tower. | 403 for Residents and Vendors. | The Coordinator checks a flat while triaging. |
| 55 | `POST /flats` | GM | Creates a flat inside a tower. | 400 on a duplicate flat number in that tower. | The GM loads the flats of a new tower. |
| 56 | `GET /common-areas` | All | Lists shared areas with their zone. | none | The resident picks the pool as the location. |
| 57 | `POST /common-areas` | GM | Creates a shared area inside a zone. | 400 on a duplicate name. | A new gym opens. |
| 58 | `PATCH /common-areas/{id}` | GM | Renames a shared area or moves it to another zone. | none | The clubhouse moves to a different zone. |
| 59 | `GET /categories` | All | Lists complaint categories with severity, targets and the sensitive flag. | none | The resident picks Plumbing. |
| 60 | `POST /categories` | GM | Creates a category with its severity, response and resolution targets and the sensitive flag. | 400 on a duplicate name or a target of zero. | The GM adds a Pest Control category. |
| 61 | `PATCH /categories/{id}` | GM | Changes severity, targets, the sensitive flag or the active status. Changes apply to new tickets only. | none | The GM shortens the target for Critical lift faults. |
| 62 | `GET /trades` | Coordinator, ZM, GM | Lists vendor trades. | 403 for Residents and Vendors. | The ZM picks the trades a ticket needs. |
| 63 | `POST /trades` | GM | Creates a trade. | 400 on a duplicate name. | The GM adds Carpentry. |
| 64 | `POST /vendors` | GM | Creates a vendor profile and its login account, with capacity and trades. | 400 on a duplicate email. | A new electrician company joins. |
| 65 | `PATCH /vendors/{id}` | GM | Changes capacity, trades or active status. Lowering capacity below the current load is refused (proposed). | 422 when the new capacity is below the current load. | The GM deactivates a vendor who left. |
| 66 | `GET /users` | GM | Lists accounts with role and status. | 403 for other roles. | The GM audits who has access. |
| 67 | `POST /users` | GM | Creates an account with a role. A resident account is linked to a flat. | 400 on a duplicate email. | The GM adds a new resident. |
| 68 | `PATCH /users/{id}` | GM | Changes the role, activates or deactivates the account, or changes the resident's flat link. | none | A resident moves to another flat. |
| 69 | `GET /roles` | GM | Returns the roles with their permissions. | 403 for other roles. | The GM reviews the permission matrix. |
| 70 | `PUT /roles/{id}/permissions` | GM | Replaces the role's set of action and scope pairs. | 400 on an unknown action or scope. | The GM changes what a role may do. |
| 71 | Retired | none | Role inheritance was removed from the model, so there is nothing to configure. | none | none |
| 72 | `GET /parameters` | GM | Lists the windows and limits with their descriptions. | 403 for other roles. | The GM checks the current confirmation window. |
| 73 | `PUT /parameters/{key}` | GM | Changes one value. New tickets use it from now on and open tickets keep their stored deadlines. | 400 on an unknown key or a bad value. | The GM changes the confirmation window from 48 to 24 hours. |

## 6. Transition to endpoint map

| Transition | Endpoint or trigger | Note |
|---|---|---|
| T1 | 3 | Creates the ticket. |
| T2, T3 | Inside 3 | Run by the intake logic, no endpoint of their own. |
| T4, T11 | 14 | Confirm. |
| T5, T14 | 15 | Hand off. |
| T6 | 18 | Request clarification. |
| T7 | 20 | Close as Duplicate. |
| T8 | 19 | Reply type Clarify. |
| T9 | 21, after a No issue reply through 19 or after 72 hours | Close as Invalid. |
| T10 | 16 | Take over. |
| T12 | 17 | First send-back. |
| T13 | 17 | Second send-back, escalated by the system. |
| T15 | 23 | Assign. |
| T16 | 27 | Accept. The first acceptance moves the status to In Progress. |
| T17 | 28, and the job on timeout | Reject or time out. |
| T18 | 29 | Start. |
| T19 | 30 | The last role done moves the ticket to Under Review. |
| T20 | 24 | Change the assignment. |
| T21 | 31 | Verify. |
| T22 | 32 | Rework. |
| T23 | 31 or 32 on a GM-desk ticket | The ZM records a verdict for the GM. |
| T24 | 33 | Manual escalation. |
| T25 | The job | 1.0x alert and 1.5x move to the GM's desk. |
| T26 | 39 | GM marks fixed. |
| T27 | 40 | GM closes as Unresolved. |
| T28 | 41 | Ask the ZM to verify. |
| T29 | 42 | Reassign. |
| T30 | 43 | GM delegates the ticket to the ZM. |
| T31 | 44 | GM close. |
| T32 | The job | Confirmation window lapses. |
| T33 | Retired | Merged into T27. |
| T34 | 36 | Dispute. |
| T35 | 33 when the ZM escalates, and the job after 48 hours | Dispute escalation. |
| T36 | Retired | Replaced by T37 and T15. |
| T37 | 37 | Uphold. |
| T38 | 38 | Reject the dispute. |
| T39 | 45 | GM reopens. |
| T40 | 22 | Withdraw. |
| T41 | 34 | Confirm the fix. |
| T42 | 35 | Reject the fix, to the ZM. |
| T43 | 35 | System branch when the limit is reached or the GM holds the ticket. |
| T44 | 32 | System branch when the limit is reached. |

## 7. Design notes

- We use named action endpoints. A single generic transition endpoint would cut the workflow endpoints from 45 to about 16 but would push permission logic into the request body, and each endpoint maps one to one to a row in the permission matrix and in the requirements traceability matrix.
- System transitions have no endpoints. The intake logic and the 10 minute job run them.
- A repeated request after success returns 422 or 409 because the state has already moved. We add no idempotency key for now (proposed).
- Every state-changing complaint endpoint carries the ticket version. A stale version returns 409 with the current state.
- Endpoint 71 is retired. We keep the numbers of the other endpoints so earlier references still resolve.
