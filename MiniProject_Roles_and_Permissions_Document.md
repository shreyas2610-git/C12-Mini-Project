# 🔐 Roles and Permissions Document

> 📌 Working draft v0.2. Related engines: E4 Access and Interface (Shreyas) and E5 Rule Enforcement (shared). The permission matrix below is derived from the endpoints and the transition table. It was not written out in the baseline, so every cell is proposed until the team confirms it.

1. Roles at a glance
2. Scopes
3. Permission matrix
   - 3.1 Access, intake and reading
   - 3.2 Triage and clarification
   - 3.3 Assignment and vendor work
   - 3.4 Verification, resident decision and disputes
   - 3.5 GM desk handling
   - 3.6 Master data and configuration
   - 3.7 Automatic actions by the System
4. Role views
5. Separation of duties
6. Role inheritance
7. How a request is authorised
8. Open points

Question related to Separation of Duties

## 1. Roles at a glance

| Role | Scope | Can | Cannot | Scenario |
|---|---|---|---|---|
| Resident | Own flat: complaints raised by residents of the same flat | Raise a complaint for the own flat or a shared area. Track status and history. Answer a clarification request within 72 hours. Withdraw until a vendor accepts. Confirm or reject the fix within 48 hours. Dispute a Duplicate, Invalid or Unresolved closure once within 7 days. Read own notifications. | See other flats' complaints. Set priority, zone or vendors. Verify or close a ticket, apart from confirming a fix or withdrawing. | The resident of Flat 704 raises a leak, answers the Coordinator's question and rejects the fix when the tap still drips. |
| Helpdesk Coordinator | Township-wide read, and acts on Reported tickets | Work the triage queue: Reported tickets in phase Triage with handler Coordinator. Fix the category. Ask the resident to clarify. Confirm the complaint. Hand off to the ZM. Set priority and team. Assign and change vendors until the ZM acts. Close Duplicate. Close Invalid after the 72 hour window or a confirming reply. Read vendor load. | Handle recurring tickets routed to the ZM or GM. Edit after the ZM has acted. Close Invalid before the window ends. Verify work. Escalate. Act on returned tickets. | The Coordinator confirms a leak, names a plumber and loses edit rights the moment the ZM changes the vendor. |
| Zone Manager (ZM) | Own zone | Take over tickets. Confirm. Send back a first-pass ticket (a second send-back goes to the GM). Set or override priority, team and vendors. Verify work and order rework. Close duplicates on first-pass tickets. Receive tickets that the GM delegates and then handle them fully. Decide disputes within 48 hours. Escalate with a reason. Read the zone dashboard and breach report. | Act outside the zone. Close Invalid. Verify or close a ticket on the GM's desk (the ZM only gives a verdict when the GM asks). Contact residents directly. On a returned ticket, do anything except assign or escalate. | The GM asks the ZM to check a lift repair and the ZM sends back a verdict, because the ticket is still on the GM's desk. |
| Vendor | Own jobs: roles where the vendor is the named vendor | View own offers and jobs. Accept or reject a role, with a reason on rejection. Start work. Add notes and photos on accepted roles. Mark the own role done with a note. | Accept beyond capacity. See other vendors' jobs. Verify the own work. Drop out after accepting without asking the ZM. | An electrician with five of five slots in use is refused on a sixth accept. |
| General Manager (GM) | Reads the whole township, acts on tickets on the GM's desk and on configuration | Mark work fixed. Close as Unresolved. Ask the ZM to verify. Reassign vendors and set a new due time. Delegate a ticket to the ZM so the ZM handles it from then on. Close Duplicate or Invalid and reject disputes on its desk. Reopen within 7 days. Manage accounts, roles, permissions, zones and the location map, categories, trades, vendors, capacity and parameters. Read reports and the audit log. | Act on live tickets that are not on its desk, apart from reopening a closed ticket. Edit history. | The GM reassigns an escalated basement leak and sets a new due time. |
| System | Automatic, no login | Route recurring complaints (T2, T3). Escalate on a second send-back (T13), at 1.5x (T25), at the reopen limit (T43, T44) and on dispute timeouts (T35). Time out vendor offers (T17). Close after the confirmation window (T32). Enforce capacity. Complete a ticket on the last role done (the T19 step). | Hold a login or any permission beyond the listed automatic actions. | The 10 minute job closes a Resolved ticket 48 hours after the ZM resolved it. |

## 2. Scopes

A permission is an action plus a scope. The scope is applied inside the database query, so a ticket outside the scope is never loaded.

| Scope | Meaning | How it is enforced | Scenario |
|---|---|---|---|
| `OWN_FLAT` | Complaints raised by residents of the caller's flat | Query filter on the caller's flat | A resident of Flat 704 never sees a complaint from Flat 705. |
| `OWN_ZONE` | Complaints whose zone is the caller's zone | Query filter on the zone managed by the caller | The ZM of one zone sees nothing from another zone. |
| `OWN_JOBS` | Roles where the caller is the named vendor | Query filter on the vendor of the role | A vendor sees only the jobs offered to them. |
| `ESCALATED_ONLY` | Tickets whose handler is GM | Handler filter together with the role check | The GM acts only on tickets on its own desk. |
| `TOWNSHIP` | Every ticket and every master record | No filter | The Coordinator reads all tickets and the GM edits configuration. |

## 3. Permission matrix

Cells show the scope, Yes where no scope applies, and a dash where the role has no permission. The API column points to the endpoint numbers in the API Design Document.

### 3.1 Access, intake and reading

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Log in | 1 | Yes | Yes | Yes | Yes | Yes | - |
| Read own profile | 2 | Yes | Yes | Yes | Yes | Yes | - |
| Raise a complaint | 3 | Own flat | - | - | - | - | - |
| List complaints | 4 | Own complaints | Township | Own zone | - | Township | - |
| Open a complaint | 5 | Own complaints | Township | Own zone | Own jobs | Township | - |
| View history | 6 | Own complaints | Township | Own zone | - | Township | - |
| View attachments | 7 | Own complaints | Township | Own zone | Own jobs | Township | - |
| Add an attachment | 8 | Own complaints | Township | Own zone | Own jobs | - | - |
| Work queue | 9 | - | Township | Own zone | - | Escalated only | - |
| Dashboard | 10 | - | - | Own zone | - | Township | - |
| SLA breach report | 11 | - | - | Own zone | - | Township | - |
| Audit log | 12 | - | - | - | - | Township | - |
| Own notifications | 46, 47 | Yes | Yes | Yes | Yes | Yes | - |

### 3.2 Triage and clarification

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Fix the category | 13 | - | Township | Own zone | - | - | - |
| Confirm genuine | 14 | - | Township | Own zone | - | - | - |
| Hand off to the ZM | 15 | - | Township | - | - | - | - |
| Take over | 16 | - | - | Own zone | - | - | - |
| Send back to the Coordinator | 17 | - | - | Own zone | - | - | - |
| Ask the resident to clarify | 18 | - | Township | - | - | - | - |
| Reply to a clarification | 19 | Own complaint | - | - | - | - | - |
| Close as Duplicate | 20 | - | Township | Own zone | - | - | - |
| Close as Invalid | 21 | - | Township | - | - | - | - |
| Withdraw | 22 | Own complaint | - | - | - | - | - |

### 3.3 Assignment and vendor work

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Assign vendors and set priority | 23 | - | Township | Own zone | - | - | - |
| Change vendor, team or priority | 24 | - | Township | Own zone | - | - | - |
| View vendors with load | 25 | - | Township | Township | - | Township | - |
| View own jobs | 26 | - | - | - | Own jobs | - | - |
| Accept or reject a role | 27, 28 | - | - | - | Own jobs | - | - |
| Start work | 29 | - | - | - | Own jobs | - | - |
| Mark a role done | 30 | - | - | - | Own jobs | - | - |

### 3.4 Verification, resident decision and disputes

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Verify the work | 31 | - | - | Own zone | - | - | - |
| Order rework | 32 | - | - | Own zone | - | - | - |
| Escalate manually | 33 | - | - | Own zone | - | - | - |
| Confirm the fix | 34 | Own complaint | - | - | - | - | - |
| Reject the fix | 35 | Own complaint | - | - | - | - | - |
| Dispute a closure | 36 | Own complaint | - | - | - | - | - |
| Decide a dispute | 37, 38 | - | - | Own zone | - | - | - |

### 3.5 GM desk handling

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Mark a GM-desk ticket as fixed | 39 | - | - | - | - | Escalated only | - |
| Close as Unresolved | 40 | - | - | - | - | Escalated only | - |
| Ask the ZM to verify | 41 | - | - | - | - | Escalated only | - |
| Reassign vendors | 42 | - | - | - | - | Escalated only | - |
| Delegate to the ZM | 43 | - | - | - | - | Escalated only | - |
| Close Duplicate or Invalid, or reject a dispute on the GM's desk | 44 | - | - | - | - | Escalated only | - |
| Reopen a closed ticket | 45 | - | - | - | - | Township | - |

### 3.6 Master data and configuration

| Action | API | Resident | Coordinator | ZM | Vendor | GM | System |
|---|---|---|---|---|---|---|---|
| Read zones, towers, common areas and categories | 48, 51, 56, 59 | Yes | Yes | Yes | Yes | Yes | - |
| Read flats and trades | 54, 62 | - | Yes | Yes | - | Yes | - |
| Manage zones, towers, flats and common areas | 49, 50, 52, 53, 55, 57, 58 | - | - | - | - | Township | - |
| Manage categories | 60, 61 | - | - | - | - | Township | - |
| Manage trades and vendors (***) | 63, 64, 65 | - | - | - | - | Township | - |
| Manage users, roles and permissions | 66 to 70 | - | - | - | - | Township | - |
| Manage parameters | 72, 73 | - | - | - | - | Township | - |

### 3.7 Automatic actions by the System

| Action | Transition | Trigger | Scenario |
|---|---|---|---|
| Route recurring complaints | T2, T3 | The recurrence check at intake finds the threshold reached | The third report from Flat 502 skips the helpdesk. |
| Time out a vendor offer | T17 | The offer deadline passes (2 hours Critical, 12 hours others) | A plumber stays silent and the role returns to the assigner. |
| Escalate on a second send-back | T13 | The ZM sends the same ticket back a second time | The GM decides who owns the ticket. |
| Alert and escalate on SLA | T25 and the 1.0x alert | Counted time reaches 1.0x or 1.5x of the target | The ZM is alerted at 1.0x and the GM receives the ticket at 1.5x. |
| Close after the confirmation window | T32 | 48 hours pass with no resident action | The ticket closes as Fixed. |
| Escalate disputes without a decision | T35 | The ZM does not decide within 48 hours | The GM takes the dispute. |
| Escalate at the reopen limit | T43, T44 | A failure arrives with the reopen count at 2, or a GM-desk ticket's fix is rejected | The third failed fix goes to the GM. |
| Complete a ticket on the last role done | T19 step | The last open role is marked done | One completion is recorded even when two vendors finish together. |

## 4. Role views

Each view is a set of tickets. The permission check asks whether a ticket belongs to the caller's view.

| View | Definition | Used by | Scenario |
|---|---|---|---|
| Resident view (***) | Complaints whose `raised_by` resident lives in the caller's flat | API 4 and 5 for Resident | A flatmate's complaint appears in the same list. |
| Coordinator view | All complaints, read only outside Reported | API 4 and 5 for Coordinator | The Coordinator looks up an old ticket to link a duplicate. |
| ZM view | Complaints whose `zone_id` is the zone the caller manages | API 4 and 5 for ZM | The ZM sees only the own zone. |
| Vendor view | Roles whose vendor is the caller, with the parent ticket details needed for the job | API 5 and 26 for Vendor | The vendor sees the address and the job note. |
| GM view | All complaints, read only | API 4 and 5 for GM | The GM reviews any ticket before acting. |
| Coordinator queue | Status Reported, phase Triage and handler Coordinator | API 9 for Coordinator | The Coordinator starts the day here. |
| ZM action queue (proposed) | In the own zone with handler ZM: phase Triage, phase Assigned with no vendors named, phase Verifying, and status Disputed | API 9 for ZM | The ZM sees what needs a decision, a verification or a dispute ruling. |
| GM queue | Handler GM | API 9 for GM | The GM works the escalations. |

## 5. Separation of duties

| Duty | Done by | Never done by | Why | Scenario |
|---|---|---|---|---|
| Confirming a complaint is real | Coordinator, ZM | Resident, Vendor | The people who judge validity are not the people who benefit from the work. | A vendor cannot confirm a complaint to get more jobs. |
| Doing the work | Vendor | Coordinator, ZM, GM | The staff who assign work do not perform it. | A ZM cannot mark a role done. |
| Verifying the work | ZM, or the GM on its own desk | The vendor who did it, the Coordinator | The check comes from someone other than the vendor, and the resident then checks again. | The electrician cannot mark the ticket Resolved. |
| Closing Invalid | Coordinator, after the 72 hour window | ZM, Vendor | The resident gets the whole window to reply. | The ZM cannot close a ticket as Invalid on the first day. |
| Closing a ticket on the GM's desk | GM | ZM, Coordinator | A ticket that failed once is the GM's responsibility. | The ZM cannot close a duplicate that the GM holds, until the GM delegates it. |
| Closing as Unresolved | GM | Everyone else | Stopping work is a township-level decision with a reason on record. | Only the GM can close a builder-defect ticket. |
| Deciding a dispute | ZM, or the GM on tickets the GM held | Coordinator, Vendor | Someone with authority over the zone reviews the closure. | The ZM upholds a wrong Invalid closure. |
| Changing configuration | GM | Everyone else | One accountable owner for rules, limits and accounts. | Only the GM changes the confirmation window. |
| Editing history | Nobody | Everyone, including the GM | The audit trail has to stay trustworthy. | The GM can read but never change a past event. |

## 6. Role inheritance

Role inheritance was removed from the model. Our five roles have disjoint duties and none inherits from another, so every role holds its permissions directly.

## 7. How a request is authorised

| Step | What is checked | If it fails | Scenario |
|---|---|---|---|
| 1 | The token is valid and not expired | 401 | A resident opens the app after the session expired. |
| 2 | The role holds the action in the permission relation, including | 403 | A vendor calls the verify endpoint. |
| 3 | The scope is applied inside the query | 404 for a ticket outside the scope | A ZM opens a ticket from another zone and gets 404. |
| 4 | The guards hold: state, handler, windows, first-pass and reopen limit | 422 | A resident confirms a fix 49 hours after Resolved. |
| 5 | The ticket version matches | 409 | Two assigners act on the same ticket and the second one sees 409. |

## 8. Open points

- The permission matrix is derived, not agreed. The team should confirm it before the permission relation is seeded.
- Role inheritance was removed. If a role hierarchy is ever needed, we add it back through a change request.
- The ZM action queue also lists tickets in phase Verifying and in status Disputed for the zone (proposed).
- A ZM who closed a duplicate would decide the dispute on it. The default keeps the ZM as decider. An alternative is to send disputes on ZM-closed tickets to the GM.
- Delegation lifts the GM-desk limits. After the GM delegates a ticket the ZM may verify and close it again, and may escalate it a second time (proposed).
- Which complaint fields a vendor may see, for example the resident's phone number, is not decided.

> ### 💡 Question related to Separation of Duties
>
> ```
> I have a few questions regarding the verification workflow and the API design:
>
> - Which API endpoint should the Zone Manager use to verify the vendor's claim that the assigned work has been completed successfully?
>
> - If the Zone Manager finds that the vendor's work is not satisfactory during verification, which API endpoint should be used to reject the vendor's claim and move the complaint back to the Assigned state for rework?
>
> - After the Zone Manager is satisfied with the vendor's work, which API endpoint should be responsible for sending the complaint to the resident for confirmation? Should this be part of the same endpoint or a separate action?
>
> - Which API endpoint should the resident use to record their decision (e.g., Fixed / Not Fixed or Resolved / Unresolved)?
>
> - Once the resident submits their decision, should the complaint automatically move to another state, or should it return to the Zone Manager for the final decision?
>
> - I believe the Zone Manager should have the final authority even after receiving the resident's feedback. For example, if the resident marks the complaint as "Unresolved", the Zone Manager should be able to:
>   - agree with the resident and send the complaint back to Assigned for rework, or
>   - disagree with the resident (with proper justification) and proceed with resolving/closing the complaint.
>
> - In this case, should the Zone Manager use the same verification endpoint again, or should there be a separate API endpoint for reviewing the resident's feedback and taking the final decision?
>
> - Overall, what would be the cleanest API design for this entire verification workflow while keeping the state transitions logical and avoiding unnecessary endpoints?
> ```
