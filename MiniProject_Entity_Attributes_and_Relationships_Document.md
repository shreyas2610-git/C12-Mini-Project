# 🧩 Entity, Attributes, and Relationships Document

## 1. Summary

| Item | Count | Detail |
|---|---|---|
| Relations (tables) | 22 | 20 entity relations and 2 junction relations (RolePermission, VendorTrade). 10 come from the baseline and 12 are new. RoleInheritance was removed. |
| Attributes | 138 | Between 2 and 33 per relation. Complaint has 33 and the average is about 6. |
| Relationships | 37 | 32 one-to-many, 3 one-to-one and 2 many-to-many. One is recursive (Complaint to Complaint). Number 10 is retired. |
| Foreign keys | 39 | 35 single-column foreign keys plus 4 inside the two junction tables. |
| Value lists | 12 | Listed in section 4. |

## 2. Entity catalogue

| # | Entity | What it stores | Origin | Attributes |
|---|---|---|---|---|
| 1 | Zone | A named area of the township under one zone manager. Every tower and every shared area belongs to exactly one zone. | Baseline | 3 |
| 2 | Tower | A residential tower and the zone it belongs to. | Baseline | 3 |
| 3 | Flat | One flat inside a tower. It gives a resident their own-flat scope. | Baseline | 3 |
| 4 | CommonArea | A shared area such as the pool, gym, park, parking, lift or clubhouse, with its zone. | Baseline | 3 |
| 5 | Resident | The resident profile of a user: which flat the person lives in. | Baseline | 2 |
| 6 | ComplaintCategory | A kind of complaint with its severity, its response and resolution targets and the sensitive flag. | Baseline | 7 |
| 7 | Complaint | The ticket itself: location, category, priority, workflow state, outcome and every clock and window. | Baseline | 33 |
| 8 | TicketRole | One trade role on a ticket, with the one named vendor and that vendor's reply and progress for the role. | Baseline | 12 |
| 9 | Vendor | The vendor profile of a user: company, capacity and current load. | Baseline | 5 |
| 10 | StatusHistory | The append-only event log: status, phase, handler, confirmation and role events, each with actor and reason. | Baseline | 11 |
| 11 | Role | One of the six actors, including the System actor. | New | 3 |
| 12 | User | A person who can log in, with role and contact details. | New | 8 |
| 13 | Action | A named operation that a role may be allowed to perform. | New | 3 |
| 14 | RolePermission | Which role may perform which action within which scope. This is the permission relation. | New (junction) | 3 |
| 15 | RoleInheritance | Removed from the model: none of our five roles inherits from another. | Removed | 0 |
| 16 | Trade | A vendor trade such as electrician or plumber. | New | 2 |
| 17 | VendorTrade | Which trades each vendor holds. | New (junction) | 2 |
| 18 | Attachment | A photo with a caption, attached to a ticket or to one of its roles. | New | 7 |
| 19 | ResidentHold | Intervals during which a ticket waited on the resident, kept so that delay is not charged to the ZM. | New | 5 |
| 20 | Status | The five states a ticket can be in. | New | 3 |
| 21 | Transition | The legal moves of the workflow: from status and phase, to status and phase, and the actor. | New | 8 |
| 22 | Parameter | The windows and limits the GM can change. | New | 5 |
| 23 | Notification | An in-app notice for one user. | New | 7 |

## 3. Attribute dictionary

PK is the primary key and FK is a foreign key. The Null column says whether the value may be empty and, where it matters, when.

### 3.1 Zone

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `zone_id` | PK | No | Unique id of the zone. |
| `name` | Unique | No | Display name of the zone. |
| `zm_user_id` | FK to User, unique | Yes, while no ZM is named | The zone manager responsible for the zone. It is unique, so one person manages at most one zone. |

### 3.2 Tower

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `tower_id` | PK | No | Unique id of the tower. |
| `zone_id` | FK to Zone | No | The zone the tower belongs to. This is part of the location to zone map. |
| `name` | Unique | No | Name of the tower. |

### 3.3 Flat

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `flat_id` | PK | No | Unique id of the flat. |
| `tower_id` | FK to Tower | No | The tower the flat is in. |
| `flat_number` | Unique with tower_id | No | Flat number inside the tower. |

### 3.4 CommonArea

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `common_area_id` | PK | No | Unique id of the shared area. |
| `zone_id` | FK to Zone | No | The one zone that owns the area. |
| `name` | Unique | No | Name such as pool, gym, park, parking, lift or clubhouse. |

### 3.5 Resident

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `resident_id` | PK and FK to User | No | Shares its key with the user, so a resident is a user with flat details. |
| `flat_id` | FK to Flat | No | The flat the resident lives in. It is the basis of the own-flat scope. |

### 3.6 ComplaintCategory

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `category_id` | PK | No | Unique id of the category. |
| `name` | Unique | No | Name of the category. |
| `severity` | | No | Low, Medium, High or Critical. Used to rank the queue and to pick the vendor reply time. |
| `response_sla_h` | | No | Target hours from submission to first acceptance. |
| `resolution_sla_h` | | No | Target hours from first acceptance until the ticket reaches Confirming. |
| `is_sensitive` | | No | When true, a recurring complaint in this category goes straight to the GM. |
| `is_active` | | No | Lets the GM retire a category without deleting old tickets. |

### 3.7 Complaint

| Group | Attribute | Key | Null | Meaning |
|---|---|---|---|---|
| Identity | `complaint_id` | PK | No | Unique ticket number. |
| Identity | `raised_by` | FK to Resident | No | The resident who raised the complaint. |
| Identity | `description` | | No | The resident's own words about the problem. |
| Identity | `submitted_at` | | No | Time of submission. It starts the response clock and is the base for queue aging. |
| Location | `flat_id` | FK to Flat | Yes | The flat concerned. Exactly one of `flat_id` and `common_area_id` is filled (proposed rule I7). |
| Location | `common_area_id` | FK to CommonArea | Yes | The shared area concerned. |
| Location | `zone_id` | FK to Zone | No | Zone derived from the location at submission and recomputed when the location is corrected. Stored so scope filters stay fast. |
| Classification | `category_id` | FK to ComplaintCategory | No | The kind of complaint. The Coordinator or ZM may correct it while the ticket is Reported. |
| Classification | `priority` | | Yes, until set | Low, Medium, High or Critical, set by the Coordinator or ZM. It starts as the category severity (proposed). |
| Classification | `recurring_flag` | | No | True when the recurrence check found the threshold reached. |
| Classification | `duplicate_of` | FK to Complaint | Yes | The open original, filled when the ticket is closed as Duplicate. |
| Workflow state | `status` | FK to Status | No | Current status, one of the five the resident sees. |
| Workflow state | `phase` | | Yes, empty for Closed and Disputed | Triage, Awaiting Resident, Assigned, Accepted, Working, Verifying or Confirming. Only ten (status, phase) pairs are allowed (rule I8). |
| Workflow state | `handler` | | No | Coordinator, ZM or GM. The desk that owns the next decision. Always filled. |
| Workflow state | `escalated_flag` | | No | Set whenever the ticket goes to the GM's desk and never cleared. History only: the desk itself is the handler value GM. |
| Workflow state | `confirmed_by` | FK to User | Yes | Who confirmed the ticket is real and in the right zone. Filled by an explicit confirmation, or by the ZM or GM when they assign or move the ticket on. |
| Workflow state | `confirmed_at` | | Yes | When it was confirmed. Empty exactly when `confirmed_by` is empty. |
| Workflow state | `zm_acted_at` | | Yes | Time of the ZM's first action. It ends the Coordinator's right to edit. Cleared on a send-back or when the zone changes. |
| Workflow state | `send_back_count` | | No | How many times the ZM has sent the ticket back (proposed). The second send-back escalates. |
| Workflow state | `send_back_reason` | | Yes | Wrong zone or Not genuine, while a send-back stands (proposed). |
| Workflow state | `reopen_count` | | No | Failed-fix verdicts so far, counting ZM rework and resident rejections. The limit is 2. |
| Outcome | `resolution` | | Yes, until Closed | Fixed, Unresolved, Duplicate, Invalid or Withdrawn. |
| Outcome | `resolution_note` | | Yes | Free text, including the GM's reason for Unresolved. |
| Clocks and windows | `response_due_at` | | No | Submission plus the category's response target. Resident-held time is added back when breaches are judged (proposed). |
| Clocks and windows | `resolution_due_at` | | Yes | First acceptance plus the category's resolution target. A GM reassignment sets a new value and ZM rework does not. |
| Clocks and windows | `first_accepted_at` | | Yes | When the first vendor accepted. It stops the response clock, starts the resolution clock and shows that vendor work has begun. While it is empty an open ticket is Reported. |
| Clocks and windows | `resolved_at` | | Yes | When the ticket entered phase Confirming. Cleared if the resident rejects the fix. |
| Clocks and windows | `closed_at` | | Yes | When the ticket closed. Base of the 7 day reopen window. |
| Clocks and windows | `confirm_due_at` | | Yes | End of the 48 hour confirmation window. Filled only while the phase is Confirming. |
| Clocks and windows | `dispute_due_at` | | Yes | End of the 7 day dispute window. Filled only for Duplicate, Invalid and Unresolved closures. |
| Clocks and windows | `disputed_at` | | Yes | When the resident disputed. Filled once, which enforces one dispute per ticket. |
| Clocks and windows | `alerted_at` | | Yes | When the 1.0x alert went to the ZM, so it is sent only once. |
| Concurrency | `version` | | No | Counter that rises on every update. A stale version gives 409 (optimistic locking). |

### 3.8 TicketRole

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `ticket_role_id` | PK | No | Unique id of the role on the ticket. |
| `complaint_id` | FK to Complaint | No | The ticket that needs the role. |
| `trade_id` | FK to Trade | No | The trade required. Unique with `complaint_id` , so a ticket has one role per trade. |
| `vendor_id` | FK to Vendor | Yes, until a vendor is named | The one named vendor for the role. |
| `role_status` | | No | Unassigned, Offered, Accepted, Started or Done. |
| `assigned_by` | FK to User | Yes, until a vendor is named | The Coordinator, ZM or GM who named the vendor. |
| `offered_at` | | Yes | When the vendor was named and notified. |
| `offer_due_at` | | Yes | Time by which the vendor must reply: 2 hours for Critical, 12 hours for others. |
| `accepted_at` | | Yes | When the vendor accepted. |
| `started_at` | | Yes | When the vendor started work. |
| `done_at` | | Yes | When the vendor marked the role done. |
| `done_note` | | Yes | The note the vendor must give when marking the role done. |

### 3.9 Vendor

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `vendor_id` | PK and FK to User | No | Shares its key with the user, so a vendor is a user with capacity details. |
| `company_name` | | No | Name of the company or the individual's trade name. |
| `capacity` | | No | Maximum number of accepted roles the vendor may hold at once. |
| `current_load` | | No | Accepted roles not yet done. This is the counter behind the capacity semaphore. |
| `is_active` | | No | Inactive vendors cannot be named on new roles. |

### 3.10 StatusHistory

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `history_id` | PK | No | Unique id of the event. |
| `complaint_id` | FK to Complaint | No | The ticket the event belongs to. |
| `ticket_role_id` | FK to TicketRole | Yes | Filled for role events such as accept, reject, start and done. |
| `event_type` | | No | STATUS_CHANGE, PHASE_CHANGE, HANDLER_CHANGE, CONFIRMED, CONFIRM_CLEARED, ROLE_EVENT or FIELD_CHANGE. |
| `from_value` | | Yes | Previous value of whatever changed. Empty on creation. |
| `to_value` | | No | New value of whatever changed. |
| `actor_role_id` | FK to Role | No | The role that acted. The System actor is a role too. |
| `actor_user_id` | FK to User | Yes | The person who acted. Empty when the System acted. |
| `transition_id` | FK to Transition | Yes | The matching row of the transition table. Filled for status changes. |
| `reason` | | Yes | Free text where a rule asks for a reason, such as a send-back, rejection, rework, escalation, dispute or Unresolved closure. |
| `occurred_at` | | No | Database time at commit. |

### 3.11 Role

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `role_id` | PK | No | Unique id of the role. |
| `name` | Unique | No | Resident, Coordinator, ZM, Vendor, GM or System. |
| `has_login` | | No | False for the System actor. |

### 3.12 User

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `user_id` | PK | No | Unique id of the user. |
| `role_id` | FK to Role | No | The user's single role. |
| `full_name` | | No | Name shown in the interface and the audit trail. |
| `email` | Unique | No | Login name and contact address. |
| `phone` | | Yes | Contact number. |
| `password_hash` | | No | Salted hash of the password. The plain password is never stored. |
| `is_active` | | No | Deactivated accounts cannot log in. |
| `created_at` | | No | When the account was created. |

### 3.13 Action

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `action_id` | PK | No | Unique id of the action. |
| `code` | Unique | No | Short code for the operation, for example the assign action. |
| `description` | | No | Plain-language description of what the action does. |

### 3.14 RolePermission

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `role_id` | PK part, FK to Role | No | The role that holds the permission. |
| `action_id` | PK part, FK to Action | No | The action the role may perform. |
| `scope` | | No | OWN_FLAT, OWN_ZONE, OWN_JOBS, ESCALATED_ONLY or TOWNSHIP. It limits which tickets the action may touch. |

### 3.15 RoleInheritance (removed)

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| none | | | Removed from the model. None of our five roles inherits from another, so the table would hold no rows. |
| none | | | The number 3.15 is kept so the later sections do not shift. |

### 3.16 Trade

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `trade_id` | PK | No | Unique id of the trade. |
| `name` | Unique | No | Trade name such as electrician or plumber. |

### 3.17 VendorTrade

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `vendor_id` | PK part, FK to Vendor | No | The vendor. |
| `trade_id` | PK part, FK to Trade | No | A trade the vendor holds. |

### 3.18 Attachment

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `attachment_id` | PK | No | Unique id of the attachment. |
| `complaint_id` | FK to Complaint | No | The ticket the photo belongs to. |
| `ticket_role_id` | FK to TicketRole | Yes | Filled when the photo belongs to one vendor role. |
| `uploaded_by` | FK to User | No | Who added the photo. |
| `file_ref` | | No | Reference to the stored photo. The file itself is kept outside the table. |
| `caption` | | Yes | Short note about the photo. |
| `uploaded_at` | | No | When the photo was added. |

### 3.19 ResidentHold

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `hold_id` | PK | No | Unique id of the interval. |
| `complaint_id` | FK to Complaint | No | The ticket that waited on the resident. |
| `hold_type` | | No | AWAITING_RESIDENT or CONFIRMATION_WAIT. |
| `started_at` | | No | When the wait began. |
| `ended_at` | | Yes, while the wait is open | When the wait ended. |

### 3.20 Status

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `status_code` | PK | No | One of the five state names. |
| `label` | | No | Text shown on screens. |
| `is_open` | | No | False only for Closed. |

### 3.21 Transition

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `transition_id` | PK | No | Unique id of the legal triple. |
| `t_code` | | No | The transition number, T1 to T44. |
| `from_status` | FK to Status | Yes | Empty for T1, where the ticket does not exist yet. |
| `to_status` | FK to Status | No | The status the ticket moves to. |
| `from_phase` | | Yes | The phase the ticket moves from. Empty for T1 and for Closed and Disputed. |
| `to_phase` | | Yes | The phase the ticket moves to. Empty for Closed and Disputed. |
| `actor_role_id` | FK to Role | No | The role allowed to make the move. |
| `requires_reason` | | No | True when the actor must give a reason. |

### 3.22 Parameter

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `param_key` | PK | No | Name of the setting, for example the confirmation window. |
| `param_value` | | No | Current value. |
| `description` | | No | What the setting controls. |
| `updated_by` | FK to User | No | The GM who last changed it. |
| `updated_at` | | No | When it was last changed. |

### 3.23 Notification

| Attribute | Key | Null | Meaning |
|---|---|---|---|
| `notification_id` | PK | No | Unique id of the notice. |
| `user_id` | FK to User | No | The person who receives it. |
| `complaint_id` | FK to Complaint | Yes | The ticket it is about, when there is one. |
| `notification_type` | | No | CLARIFICATION_REQUEST, FIX_CONFIRMATION, STATUS_UPDATE, SLA_ALERT or DISPUTE_UPDATE. |
| `message` | | No | Text shown to the user. |
| `created_at` | | No | When the notice was created. |
| `read_at` | | Yes, until read | When the user read it. |

## 4. Value lists

| Attribute | Values | Meaning of each value |
|---|---|---|
| Complaint status (Status) | Reported, In Progress, Under Review, Closed, Disputed | Reported means no vendor has accepted yet. In Progress means a vendor has accepted. Under Review means the vendors reported the work done and it is being verified, and then confirmed by the resident. The handler value GM marks the GM's desk. Closed is the final record. Disputed means a closure was challenged. |
| Complaint handler | Coordinator, ZM, GM | The desk that owns the next decision. Always filled. |
| Complaint phase | Triage, Awaiting Resident, Assigned, Accepted, Working, Verifying, Confirming | Triage waits for a decision. Awaiting Resident waits for the resident to clarify. Assigned has trade roles being staffed. Accepted has a vendor committed. Working means work began. Verifying waits for the ZM or GM to check the work. Confirming gives the resident 48 hours to confirm. |
| Complaint priority and category severity | Low, Medium, High, Critical | Ranks the queue and the SLA targets. Critical categories send recurring complaints straight to the GM and shorten the vendor reply time to 2 hours. |
| Complaint resolution | Fixed, Unresolved, Duplicate, Invalid, Withdrawn | Fixed: confirmed by the resident or lapsed after verification. Unresolved: the GM stopped and recorded a reason. Duplicate: linked to an open original. Invalid: no reply, or the reply confirmed there was no valid complaint. Withdrawn: the resident withdrew before any vendor accepted. |
| Complaint send-back reason | Wrong zone, Not genuine | Why the ZM returned the ticket. Not genuine forces the Coordinator to ask the resident before confirming. |
| TicketRole status | Unassigned, Offered, Accepted, Started, Done | Unassigned has no vendor, or the vendor rejected or timed out. Offered has a vendor named and no reply yet. Accepted has the vendor committed and a capacity slot taken. Started means work began. Done means the vendor finished the role. |
| StatusHistory event type | STATUS_CHANGE, PHASE_CHANGE, HANDLER_CHANGE, CONFIRMED, CONFIRM_CLEARED, ROLE_EVENT, FIELD_CHANGE | Status moved. Phase moved inside a status. Handler moved between Coordinator, ZM and GM. Confirmed flag set. Confirmed flag cleared on a send-back. A vendor role was accepted, rejected, started, done or timed out. Category or priority was edited. |
| ResidentHold type | AWAITING_RESIDENT, CONFIRMATION_WAIT | Waiting for a clarification reply, or waiting for the resident to confirm or reject a fix. |
| RolePermission scope | OWN_FLAT, OWN_ZONE, OWN_JOBS, ESCALATED_ONLY, TOWNSHIP | Own flat's complaints, own zone, own vendor jobs, tickets on the GM's desk only, or the whole township. |
| Notification type | CLARIFICATION_REQUEST, FIX_CONFIRMATION, STATUS_UPDATE, SLA_ALERT, DISPUTE_UPDATE | Clarification asked, fix awaiting confirmation, ordinary status news, a time alert, or news about a dispute. |
| Role name | Resident, Coordinator, ZM, Vendor, GM, System | The six actors. System is automatic and has no login. |

## 5. Relationships

| # | Relationship | Type | Implemented by | What it means |
|---|---|---|---|---|
| 1 | Zone and Tower | 1:N | `Tower.zone_id` | A zone holds many towers and each tower belongs to one zone. |
| 2 | Zone and CommonArea | 1:N | `CommonArea.zone_id` | Each shared area belongs to exactly one zone. |
| 3 | Tower and Flat | 1:N | `Flat.tower_id` | A tower holds many flats. |
| 4 | Zone and User (zone manager) | 1:1, optional | `Zone.zm_user_id` (unique) | A zone has at most one ZM and a person manages at most one zone. |
| 5 | Role and User | 1:N | `User.role_id` | Every user has exactly one role. |
| 6 | User and Resident | 1:1 (subtype) | `Resident.resident_id` | A resident is a user with flat details. |
| 7 | Flat and Resident | 1:N | `Resident.flat_id` | Several residents can live in one flat. |
| 8 | User and Vendor | 1:1 (subtype) | `Vendor.vendor_id` | A vendor is a user with capacity details. |
| 9 | Role and Action | M:N with scope | RolePermission | Each role holds a set of action and scope pairs. |
| 10 | Retired | none | none | RoleInheritance was removed from the model. |
| 11 | Vendor and Trade | M:N | VendorTrade | A vendor may hold several trades and a trade has many vendors. |
| 12 | ComplaintCategory and Complaint | 1:N | `Complaint.category_id` | A category covers many complaints. |
| 13 | Resident and Complaint (raised by) | 1:N | `Complaint.raised_by` | A resident can raise many complaints. |
| 14 | Flat and Complaint | 1:N, optional | `Complaint.flat_id` | A flat can have many complaints. Empty when the complaint is about a shared area. |
| 15 | CommonArea and Complaint | 1:N, optional | `Complaint.common_area_id` | A shared area can have many complaints. Exactly one of relationships 14 and 15 applies to each ticket. |
| 16 | Zone and Complaint (derived) | 1:N | `Complaint.zone_id` | Each ticket sits in one zone, derived from its location. |
| 17 | Status and Complaint | 1:N | `Complaint.status` | Each ticket is in exactly one state. |
| 18 | User and Complaint (confirmed by) | 1:N, optional | `Complaint.confirmed_by` | Records who confirmed the ticket. |
| 19 | Complaint and Complaint (duplicate of) | 1:N, recursive, optional | `Complaint.duplicate_of` | A duplicate points to the open original. One original can have many duplicates. |
| 20 | Complaint and TicketRole | 1:N | `TicketRole.complaint_id` | A ticket has one role per trade it needs. |
| 21 | Trade and TicketRole | 1:N | `TicketRole.trade_id` | A trade appears in many roles. |
| 22 | Vendor and TicketRole | 1:N, optional until named | `TicketRole.vendor_id` | A vendor can hold many roles over time. Empty until a vendor is named. |
| 23 | User and TicketRole (assigned by) | 1:N | `TicketRole.assigned_by` | Records who named the vendor. |
| 24 | Complaint and Attachment | 1:N | `Attachment.complaint_id` | A ticket can carry many photos. |
| 25 | TicketRole and Attachment | 1:N, optional | `Attachment.ticket_role_id` | A photo can belong to one vendor role. |
| 26 | User and Attachment (uploaded by) | 1:N | `Attachment.uploaded_by` | Records who added the photo. |
| 27 | Complaint and StatusHistory | 1:N | `StatusHistory.complaint_id` | A ticket has a growing list of events. |
| 28 | TicketRole and StatusHistory | 1:N, optional | `StatusHistory.ticket_role_id` | Role events point at their role. |
| 29 | Role and StatusHistory (actor role) | 1:N | `StatusHistory.actor_role_id` | Every event names the role that acted. |
| 30 | User and StatusHistory (actor) | 1:N, optional | `StatusHistory.actor_user_id` | Names the person, or stays empty for the System. |
| 31 | Transition and StatusHistory | 1:N, optional | `StatusHistory.transition_id` | Links a status change to the legal triple that allowed it. |
| 32 | Complaint and ResidentHold | 1:N | `ResidentHold.complaint_id` | A ticket can wait on the resident several times. |
| 33 | Status and Transition (from) | 1:N, optional | `Transition.from_status` | The state a move starts from. Empty for creation. |
| 34 | Status and Transition (to) | 1:N | `Transition.to_status` | The state a move ends in. |
| 35 | Role and Transition (actor) | 1:N | `Transition.actor_role_id` | The role allowed to make the move. |
| 36 | User and Parameter (updated by) | 1:N | `Parameter.updated_by` | Records who last changed a setting. |
| 37 | User and Notification | 1:N | `Notification.user_id` | A user receives many notices. |
| 38 | Complaint and Notification | 1:N, optional | `Notification.complaint_id` | A notice can point at a ticket. |

Complaint and Vendor are many-to-many through TicketRole. We count that link as two one-to-many relationships (20 and 22) rather than a separate pair.

## 6. Navigation paths

These are the joins the application uses most.

| Question | Path | Scenario |
|---|---|---|
| Which complaints may this resident see? | Resident ( `flat_id` ) to the residents of the same flat to Complaint ( `raised_by` ) | A resident of Flat 704 sees a leak raised by a flatmate and a pool complaint they raised themselves. |
| Which complaints may this ZM see? | Zone ( `zm_user_id` is the caller) to Complaint ( `zone_id` ) | The ZM of one zone opens the zone list and sees nothing from other zones. |
| Which zone owns this location? | Flat to Tower to Zone, or CommonArea to Zone | A complaint about Flat 704 lands in the zone of its tower. |
| Is this complaint recurring? | Complaint where the flat or shared area and the category match and `submitted_at` is within 90 days | The third low-pressure complaint from Flat 502 is flagged. |
| Which vendors can take this role? | Vendor joined to VendorTrade for the trade, ordered by `current_load` against `capacity` | The ZM sees electricians ranked by free slots. |
| What happened to this ticket? | Complaint to StatusHistory ordered by `occurred_at` , with TicketRole for role events | The resident opens the timeline and sees when the vendor accepted. |
| May this user perform this action here? | User to Role to RolePermission to Action, then the scope check | A Coordinator tries to verify work and no permission row allows it. |
| How long did the resident hold the ticket? | Complaint to ResidentHold, summing the intervals | The breach report removes 40 hours the resident took to answer. |

## 7. Notes

- Resident and Vendor share their primary key with User, so each is a subtype of User.
- Redundant columns that we keep on purpose are listed in the Database Design Document with the check that reconciles each one.
- Proposed additions that go beyond the baseline: `phase` , `send_back_count` , `send_back_reason` , the rule that exactly one of `flat_id` and `common_area_id` is filled, and a nullable `assigned_by` on TicketRole.
