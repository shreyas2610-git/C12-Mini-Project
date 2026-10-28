# 🚦 State and State Transitions Document

> 📌 Working draft v0.2. Related engine: E5 Rule Enforcement (shared by all four of us). This page owns the states, phases, transitions, guards and invariants. Other pages repeat them and must be updated after this one. Version 0.2 replaces the 10-state model with five states that the resident can read at a glance, and keeps the detail as phases, handlers and flags.

1. Overview
2. The five states
3. The seven phases
4. Handler, flags and markers
5. Terms used in the guards
6. Where triggers come from
7. Transition table
8. Invariants
9. Resident-held time
10. The rework loop ends
11. Events that are not transitions
12. From 13 states to 5
13. Test space and requirement wording

## 1. Overview

| Item | Value |
|---|---|
| States | 5: Reported, In Progress, Under Review, Closed, Disputed |
| Phases | 7 internal sub-states: Triage, Awaiting Resident, Assigned, Accepted, Working, Verifying, Confirming |
| Allowed (status, phase) pairs | 10 |
| Handler values | 3: Coordinator, ZM, GM |
| Transition numbers | 44: T1 to T40 from the baseline (T33 and T36 retired), T41 to T44 new. 42 are active. |
| Actors | Resident, Coordinator, ZM, Vendor, GM and System |
| Top-level triples | (5 states plus an empty start) × 5 target states × 6 actors = 180 |

Notation: a position is written Status / phase / handler, where C is the Coordinator, Z is the ZM and G is the GM. Closed shows the resolution in brackets. A Closed ticket has no phase. The word same means the value does not change.

The five states are what the resident sees and what the formal state machine is built on. The seven phases are internal. They keep every decision point the old states had, so this is a hierarchical state machine: a ticket is always in one status, and inside it in one phase.

## 2. The five states

| State | What the resident sees | Meaning | Phases inside | Who holds it | Clocks and windows | Leaves through | Scenario |
|---|---|---|---|---|---|---|---|
| Reported | Received | The complaint is registered and no vendor has accepted it yet. People are triaging, clarifying or arranging a vendor. | Triage, Awaiting Resident, Assigned | Coordinator, ZM or GM as handler, and the resident while Awaiting Resident | Response clock runs and is held while Awaiting Resident | T16 to In Progress. T7, T9, T27, T31, T40 to Closed. | A leaking tap the clubhouse waits for the Coordinator to confirm it and name a plumber. |
| In Progress | Work in progress | At least one vendor has accepted. It also covers arranging vendors again after rework or a rejected fix. | Assigned, Accepted, Working | Vendors do the work. The handler (ZM, or Coordinator until the ZM acts, or GM) holds the desk. | Resolution clock runs | T19 to Under Review. T27, T31 to Closed. | The electrician has accepted and is on site. |
| Under Review | Work done, being checked | The vendors reported the work done. Nothing is called fixed until it is verified, and the resident then has 48 hours to confirm. | Verifying, Confirming | ZM (or GM) while Verifying. The resident while Confirming. | Resolution clock runs while Verifying and stops at Confirming. 48 hour window while Confirming. | T22, T42 to In Progress. T32, T41, T27, T31 to Closed. | Both vendors marked done. The ZM visits to check the lift light. |
| Closed | Closed, with the resolution | The final record with one resolution: Fixed, Unresolved, Duplicate, Invalid or Withdrawn. No more work happens. | none | Nobody. It is a record. | 7 day dispute and reopen windows | T34 to Disputed. T39 to Reported or In Progress. | A duplicate pump complaint closes at once, linked to the first report. |
| Disputed | Dispute under review | The resident challenged a Duplicate, Invalid or Unresolved closure. | none | ZM, or GM when the ticket was on the GM's desk | 48 hour ZM decision window | T37 to Reported. T38 to Closed. T29 to Reported or In Progress. T31 to Closed. | The resident disputes an Invalid closure and the ZM has 48 hours to decide. |

## 3. The seven phases

A ticket is in Reported exactly until a vendor accepts, so the resident is never told that work is in progress while a vendor can still reject the job.

| Phase | Inside status | Meaning | Entered by | Left by | Scenario |
|---|---|---|---|---|---|
| Triage | Reported | Waiting for a decision to confirm, hand off, send back, close as duplicate or assign. | T1, T2, T3, T8, T10, T12, T37, T39 (when no vendor ever accepted) | T6, T7, T15 | The ticket sits on the Coordinator's desk after submission. |
| Awaiting Resident | Reported | The Coordinator asked the resident to clarify. The 72 hour window runs. | T6 | T8, T9, T10, T40 | The description said only "not working" and the resident has three days to say which lift. |
| Assigned | Reported or In Progress | The roles are being staffed: vendors are named and have not accepted, or roles are unassigned after a rejection or a rework. | T15, T22, T29, T39, T42 | T16, T20, T40 (only in Reported) | The ZM named an electrician and waits for the reply. |
| Accepted | In Progress | At least one vendor accepted and none has started. | T16 | T18, T20 | The electrician accepted and will come tomorrow. |
| Working | In Progress | At least one role has started. | T18 | T19, T20 | The electrician is on site. |
| Verifying | Under Review | All roles are done, or the GM asked for a check, and someone has to verify. | T19, T28, T43, T44 | T21, T22, T26 | The ZM checks whether the lift light now works. |
| Confirming | Under Review | The work is verified as fixed and the resident has 48 hours to confirm or reject. | T21, T26 | T32, T41, T42, T43 | The resident sees "Fixed, please confirm". |

Allowed (status, phase) pairs, ten in all:

| Status | Allowed phases |
|---|---|
| Reported | Triage, Awaiting Resident, Assigned |
| In Progress | Assigned, Accepted, Working |
| Under Review | Verifying, Confirming |
| Closed | none |
| Disputed | none |

## 4. Handler, flags and markers

These attributes carry the decisions that the dropped states used to carry.

| Attribute | Values | Meaning | Set or cleared by | Scenario |
|---|---|---|---|---|
| `handler` | Coordinator, ZM, GM | The desk that owns the next decision. It is always filled. On a Closed ticket it keeps the desk that closed it. | Set to Coordinator by T1, T8, T12. Set to ZM by T2, T5, T10, T14, T19, T21, T22, T30, T34, T37, T42. Set to GM by T3, T13, T24, T25, T35, T39, T43, T44. | The Coordinator hands off with T5 and only the handler changes. |
| `escalated_flag` | true or false | The ticket has gone to the GM's desk at least once. It is history for reports and it never clears. | Set by every move to handler GM. | A ticket that the GM delegated back still counts as escalated in the monthly report. |
| Confirmed flag ( `confirmed_by` , `confirmed_at` ) | Both empty or both filled | The ticket was judged real and in the right zone, by whom and when. | Set by T4 and T11. Stamped when empty by T15 (ZM), T26, T29 (GM) and T37 (ZM). Cleared by T12. | The Coordinator confirms with T4 and the ZM later assigns without confirming again. |
| ZM-acted marker ( `zm_acted_at` ) | Empty or a time | The ZM has taken the ticket on, so the Coordinator can no longer edit it. | Set by the ZM's first action. Cleared by T12 and by a zone change in T8. | After the ZM changes a vendor, the Coordinator's edit buttons disappear. |
| `first_accepted_at` | Empty or a time | When the first vendor accepted. While it is empty an open ticket is Reported. | Set by T16. | A ticket whose vendors keep rejecting stays Reported. |
| `reopen_count` | 0 to 2 | Failed-fix verdicts so far, counting ZM rework and resident rejections. | Raised by T22 and T42. | Two failed repairs mean the next failure goes to the GM. |

## 5. Terms used in the guards

| Term | Meaning | Used in | Scenario |
|---|---|---|---|
| First-pass ticket | Status Reported, phase Triage and `disputed_at` empty. | T7 for the ZM, T12 | A fresh ticket that the ZM can still send back. |
| Returned ticket | A ticket on the ZM's desk after T42 (In Progress, phase Assigned, no vendor named) or after T37 (Reported, phase Triage, `disputed_at` filled). The ZM may only assign (T15) or escalate (T24). | T7, T12, T15, T24 | The resident rejects the fix and the ZM cannot close it as a duplicate. |
| GM-desk ticket | Handler is GM. Only the GM decides on it, and the ZM may only give a verdict when the GM asks (T23). | T7, T21, T23, T34, T42, T43 | A ticket escalated at 1.5x stays with the GM until the GM delegates it. |
| Reopen limit | `reopen_count` has reached `reopen_limit` , which is 2. | T22, T42, T43, T44 | After two rework rounds the next failure escalates. |
| Counted time | Elapsed time minus logged resident-held time. | T25, breach reports | A resident who answers late does not add to the ZM's clock. |

## 6. Where triggers come from

| Trigger source | Transitions |
|---|---|
| Resident action | T1, T8, T34, T40, T41, T42 |
| Coordinator action | T4, T5, T6, T7, T9, T14, T15, T20 |
| ZM action | T7, T10, T11, T12, T15, T20, T21, T22, T23, T24, T37, T38 |
| Vendor action | T16, T17 (rejection), T18, T19 |
| GM action | T26, T27, T28, T29, T30, T31, T39 |
| System, intake logic | T2, T3, and the system branches of T13, T43 and T44 |
| System, 10 minute job | T17 (timeout), T25, T32, T35 (lapse) |

## 7. Transition table

Every number from T1 to T44 appears. Rows marked Retired keep their number and are never reused. The Trigger column names the event that sets the transition off.

| # | From (status / phase / handler) | To | Who | Trigger | Guards and effects | Scenario |
|---|---|---|---|---|---|---|
| T1 | none | Reported / Triage / C | Resident | Resident presses Submit | Valid submission for the own flat or a shared area, with a category and description. The zone is looked up, due times are set from the category and the recurrence check runs in the same transaction, so T2 or T3 may follow. | A resident of Tower 7 reports that the lift light is out and the ticket lands on the Coordinator's desk. |
| T2 | Reported / Triage / C | Reported / Triage / Z | System | Intake logic finds the recurrence threshold reached | The category is neither Critical nor sensitive. Only the handler changes. The recurring flag is set and the helpdesk is skipped. | The third low-water-pressure complaint from Flat 502 in 90 days goes straight to the ZM. |
| T3 | Reported / Triage / C | Reported / Triage / G | System | Intake logic finds the recurrence threshold reached | The category is Critical or sensitive. The escalated flag is set and the ticket goes to the GM's desk. | A third gas-smell complaint from the same block within 90 days goes to the GM. |
| T4 | Reported / Triage / C | same, confirmed flag set | Coordinator | Coordinator presses Confirm | The complaint is real, clear and in the right zone. Allowed while the handler is Coordinator and the ZM has not acted. After a ZM send-back for Not genuine it stays blocked until the resident was asked (T6) and replied (T8). | The Coordinator reads "no water in the bathroom, Flat 1204" and confirms it. |
| T5 | Reported / Triage / C | Reported / Triage / Z | Coordinator | Coordinator presses Hand off because the case is unclear | The confirmed flag stays empty. Only the handler changes. | A complaint about noise from the terrace may be a sensitive matter, so the Coordinator passes it to the ZM. |
| T6 | Reported / Triage / C | Reported / Awaiting Resident / C | Coordinator | Coordinator presses Ask resident | The description is unclear or the complaint looks not genuine. Required after a ZM send-back for Not genuine. The response clock is held, the 72 hour window starts, the resident is notified and the wait is logged. | A complaint says only "not working" and the Coordinator asks which equipment and where. |
| T7 | Reported / Triage / C or Z | Closed (Duplicate) | Coordinator, ZM | User presses Close as duplicate | An open original exists and is linked. The Coordinator needs handler C and no ZM action yet. The ZM needs own zone and a first-pass ticket. The resident is notified and the 7 day dispute window opens. | Three residents report the same pool pump failure and the second and third close as duplicates of the first. |
| T8 | Reported / Awaiting Resident / C | Reported / Triage / C | Resident | Resident sends a reply | The resident replies or corrects within 72 hours. The zone is recomputed if the location changed, and the ZM-acted marker clears if the zone changed. The hold ends. | The resident answers "Lift B in Tower 7" and the ticket goes back to the Coordinator. |
| T9 | Reported / Awaiting Resident / C | Closed (Invalid) | Coordinator | Coordinator presses Close as invalid | Either 72 hours passed with no reply, or the resident replied that there is no issue. The resident is notified and the dispute window opens. | The resident never answers and after 72 hours the Coordinator closes the ticket as Invalid. |
| T10 | Reported / Triage / C, or Reported / Awaiting Resident / C | Reported / Triage / Z | ZM | ZM presses Take over | Own zone only. The ZM-acted marker is set. From Awaiting Resident the hold ends and the clarification request is overruled. | The ZM knows the pump has been failing all week and takes over while the Coordinator waits on the resident. |
| T11 | Reported / Triage / Z | same, confirmed flag set | ZM | ZM presses Confirm | The ZM is recorded as the confirmer. | The ZM reads a forwarded complaint and confirms it. |
| T12 | Reported / Triage / Z | Reported / Triage / C | ZM | ZM presses Send back | Wrong zone or Not genuine, with a reason code, first time only, and only on a first-pass ticket. Clears the confirmed flag and the ZM-acted marker and raises the send-back count to 1. | The ZM sees the complaint belongs to another zone and sends it back with Wrong zone. |
| T13 | Reported / Triage / Z | Reported / Triage / G | System | ZM presses Send back for the second time | Instead of returning the ticket, the system escalates it. The escalated flag is set. | After a second send-back the GM decides who should own the ticket. |
| T14 | Reported / Triage / C, flag set | Reported / Triage / Z | Coordinator | Coordinator presses Hand off after confirming | The ticket is confirmed but the Coordinator cannot set priority or team. Only the handler changes. | The Coordinator confirms an electrical fault but cannot judge severity and passes it on. |
| T15 | Reported / Triage / C or Z | Reported / Assigned / same handler (Z if the ZM acts) | Coordinator (until the ZM acts), ZM | Assigner presses Assign | Priority is set and each role has one named vendor. The Coordinator needs handler C and the flag already set. The ZM stamps the flag if empty. On a returned ticket (In Progress / Assigned / Z with no vendors) the same action names vendors and leaves status and phase unchanged, and the reopen count does not rise again. | The ZM names a plumber for the leaking pipe and sets priority High. |
| T16 | Reported / Assigned, or In Progress / Assigned | In Progress / Accepted | Vendor | Vendor presses Accept | Capacity is checked (409 if full). The first acceptance stores `first_accepted_at` , stops the response clock, starts the resolution clock and moves the status to In Progress. | The electrician has three of five slots free and accepts. |
| T17 | Reported / Assigned, or In Progress / Assigned | same | Vendor, System | Vendor presses Reject, or the offer deadline passes in the 10 minute job | A rejection needs a reason. The deadline is 2 hours for Critical and 12 hours for others. The role returns to the assigner and the ticket stays where it is. | The plumber does not answer within 12 hours so the ZM must name someone else. |
| T18 | In Progress / Accepted | In Progress / Working | Vendor | Vendor presses Start | First start of work on any role. | The electrician arrives and starts on the wiring. |
| T19 | In Progress / Working | Under Review / Verifying / Z (stays G on a GM-desk ticket) | Vendor | Vendor marks the last open role done | A note is required. An atomic countdown guarantees one entry into Under Review even when two vendors finish together. The handler becomes the ZM unless the GM holds the ticket. | An electrician and a civil worker finish together and only one of them moves the ticket. |
| T20 | Reported / Assigned, or In Progress / Assigned, Accepted or Working | phase recomputed, handler same | ZM, and the Coordinator until the ZM acts | Assigner presses Change assignment | Vendor, team or priority changes with a reason. The phase is recomputed from the role states. The status stays In Progress once any vendor has accepted. Capacity frees for removed vendors. | A vendor falls ill, the ZM replaces the vendor and the phase returns to Assigned. |
| T21 | Under Review / Verifying / Z | Under Review / Confirming / Z | ZM | ZM presses Verify | The handler must be ZM, so this is not allowed on a GM-desk ticket. The resolved time is stored, the resident is notified, the resolution clock stops, the 48 hour window starts and the wait is logged. | The ZM checks that the lift light works and verifies the work. |
| T22 | Under Review / Verifying / Z | In Progress / Assigned / Z | ZM | ZM presses Rework | A reason is required. The reopen count rises by 1, roles go back to Offered, and the resolution clock keeps running. Allowed only while the count is below the limit, otherwise T44. | The light still flickers so the ZM sends the vendor back for round 1. |
| T23 | Under Review / Verifying / G | same | ZM | ZM presses Submit verdict after the GM asked (T28) | The verdict, Fixed or Not fixed, and a note are logged and the GM is notified. Status, phase and handler do not change. | The GM asked for an on-site check and the ZM reports the repair is still incomplete. |
| T24 | Reported / Triage / Z, Reported / Assigned, In Progress / any phase, or Under Review / Verifying, handler Z | same status and phase, handler G | ZM | ZM presses Escalate | A reason is required and the ZM must own the zone. The escalated flag is set. Also available on returned tickets. | The ZM escalates a basement flood because the vendors lack the equipment. |
| T25 | Reported / Triage, Reported / Assigned, In Progress / any phase, or Under Review / Verifying, handler C or Z | same status and phase, handler G | System | The 10 minute job finds counted time at 1.5 times the running target | The alert at 1.0x is a notification only. Awaiting Resident cannot reach 1.5x because resident-held time is not counted. Confirming is excluded because the clock has stopped. | A High ticket sits without action, reaches 1.5x and goes to the GM. |
| T26 | any open ticket with handler G and `first_accepted_at` filled | Under Review / Confirming / G | GM | GM presses Mark fixed | The resident is notified, the 48 hour window starts and the wait is logged. The confirmed flag is stamped if empty. | After reviewing the photos the GM confirms the repair. |
| T27 | any open ticket with handler G | Closed (Unresolved) | GM | GM presses Close as unresolved | A reason is required. The resident is notified and the 7 day dispute window opens. This replaces the baseline T27 and T33. | The repair belongs to the builder's defect liability so the GM closes the ticket with a note. |
| T28 | any open ticket with handler G and `first_accepted_at` filled | Under Review / Verifying / G | GM | GM presses Ask ZM to verify | The GM keeps the ticket. The ZM answers with T23. | The GM wants the zone's ZM to check on site before deciding. |
| T29 | any open ticket with handler G, or Disputed / G | Reported / Assigned / G if no vendor ever accepted, otherwise In Progress / Assigned / G | GM | GM presses Reassign | The GM names vendors and sets a new due time. The confirmed flag is stamped. From Disputed this upholds the dispute and reopens the ticket. Keeping the current vendors and only resetting the due time is a logged field change, not a transition. | The GM brings in another plumber and sets a 24 hour due time. |
| T30 | any open ticket with handler G | same status and phase, handler Z | GM | GM presses Delegate to ZM | The ticket goes to the ZM of its zone, who regains full authority over it: verify, close as duplicate on a first-pass ticket, change vendors and decide disputes. The escalated flag stays for history. The ZM can escalate again with T24. A note is optional. | The GM sees the ZM can handle the ticket from now on and delegates it. |
| T31 | any open ticket with handler G, or Disputed / G | Closed (Duplicate, Invalid, or the original resolution) | GM | GM presses Close | Duplicate or Invalid opens the dispute window. Rejecting a dispute keeps the original resolution and allows no second dispute. | After a dispute reaches the GM, the original Invalid closure stands. |
| T32 | Under Review / Confirming | Closed (Fixed) | System | The 10 minute job finds the 48 hour window passed | Silence counts as acceptance. The handler is unchanged, the wait is logged and no dispute window opens. | The resident does not respond for two days and the ticket closes as Fixed. |
| T33 | Retired | none | none | none | Merged into T27, where the GM closes directly as Unresolved. | none |
| T34 | Closed | Disputed / Z, or Disputed / G when the handler was G | Resident | Resident presses Dispute | Within 7 days of closing, once per ticket, with a reason. Only for Duplicate, Invalid and Unresolved closures. | A resident disagrees that the complaint was a duplicate. |
| T35 | Disputed / Z | Disputed / G | System, ZM | The 10 minute job finds 48 hours passed with no decision, or the ZM presses Escalate | The escalated flag is set. | The ZM misses the 48 hour window and the dispute goes to the GM. |
| T36 | Retired | none | none | none | Fixed closures can no longer be disputed. An upheld dispute follows T37 and then T15. | none |
| T37 | Disputed / Z | Reported / Triage / Z | ZM | ZM presses Uphold | Only for Duplicate and Invalid closures. Clears the resolution and stamps the confirmed flag with the ZM. The ZM can then assign (T15) or escalate (T24) only. | The resident shows the earlier ticket was a different fault, so the ZM upholds the dispute. |
| T38 | Disputed / Z | Closed (original resolution) | ZM | ZM presses Reject | The original resolution is kept and no second dispute is possible. | The ZM confirms the duplicate and closes the ticket again. |
| T39 | Closed | Reported / Triage / G if no vendor ever accepted, otherwise In Progress / Assigned / G | GM | GM presses Reopen | Within 7 days of closing. Clears the resolution and sets the escalated flag. | The RWA president complains days after a Fixed closure and the GM reopens the ticket. |
| T40 | Reported / any phase | Closed (Withdrawn) | Resident | Resident presses Withdraw | Allowed while the status is Reported, which means before any vendor has accepted. Open offers are cancelled. No dispute is possible. | The resident sorts the problem out and withdraws. |
| T41 | Under Review / Confirming | Closed (Fixed) | Resident | Resident presses Confirm fix (the button can read Mark as resolved) | Within 48 hours. The wait is logged and no dispute window opens. | The resident confirms the next morning. |
| T42 | Under Review / Confirming / Z | In Progress / Assigned / Z | Resident | Resident presses Reject fix | A reason is required. The handler must not be GM and the reopen count must be below 2. The count rises by 1, roles are unassigned, and the ZM may only assign (T15) or escalate (T24). The wait is logged. | The light still flickers and the resident rejects the fix. |
| T43 | Under Review / Confirming | Under Review / Verifying / G | System | Resident presses Reject fix and the reopen count is at 2, or the handler is GM | The count stays unchanged and the escalated flag is set. The GM re-verifies and decides. | A third failed fix goes straight to the GM. |
| T44 | Under Review / Verifying / Z | Under Review / Verifying / G | System | ZM presses Rework and the reopen count is at 2 | The count stays unchanged and the escalated flag is set. | After two rework rounds the ZM's next not-fixed verdict escalates. |

## 8. Invariants

The database enforces these rules, and the application checks them before it writes.

| ID | Rule in plain words | Why we need it | Scenario |
|---|---|---|---|
| I1 | `resolution` is filled exactly when the status is Closed. | A closed ticket always has an outcome and an open ticket never has one. | A reopen (T39) clears the resolution in the same update. |
| I2 | `handler` is always filled. | Every ticket has a desk that owns the next decision. | T30 changes the handler from GM to ZM in one step. |
| I3 | `confirmed_by` and `confirmed_at` are both empty or both filled. | Who and when must travel together. | T4 sets both in one step. |
| I4 | `confirmed_at` is filled once the phase is Assigned, Accepted, Working, Verifying or Confirming. | No work starts on an unconfirmed ticket. | The ZM's assign (T15) stamps the confirmation before the phase changes. |
| I5 | `confirm_due_at` is filled exactly when the phase is Confirming. | The 48 hour window exists only while the resident is deciding. | T41 clears it when the ticket closes. |
| I6 | `dispute_due_at` is filled only for Duplicate, Invalid and Unresolved closures, and `disputed_at` only when `dispute_due_at` is filled. | The system can never accept a dispute on a Fixed or Withdrawn closure. | A resident tries to dispute a Fixed ticket and gets 422. |
| I7 (proposed) | Exactly one of `flat_id` and `common_area_id` is filled. | A complaint is about one location. | A complaint cannot name Flat 704 and the pool together. |
| I8 (new) | The (status, phase) pair is one of the ten allowed pairs, and the phase is empty for Closed and Disputed. | Keeps the internal detail consistent with the five states. | A write that sets Under Review with phase Working is refused. |
| I9 (new, proposed) | An open ticket in Reported has an empty `first_accepted_at` . A ticket in In Progress or Under Review has it filled. | The status follows the facts and cannot drift. | T16 fills it in the same update that moves the status. |

Every change of (status, phase) must also appear as a row of the Transition table for the acting role. A database trigger checks this as a safety net behind the application check.

## 9. Resident-held time

Nothing pauses or resumes. We log intervals when the ticket waited on the resident, and breach reports and the 1.5x test use counted time, which is elapsed time minus those intervals (proposed). The calculation happens when the data is read, like queue aging.

| Interval | Starts | Ends | Scenario |
|---|---|---|---|
| Awaiting Resident | T6 | T8, T9, T10 or T40 | The Coordinator asks which lift on Monday and the resident answers on Tuesday. The day in between is charged to nobody. |
| Confirmation wait | T21 or T26 | T32, T41, T42 or T43 | The resident takes 40 hours to reject a fix. Those hours are not charged to the ZM when the rework clock is judged. |

If the team prefers to use the log for reporting only, T25 goes back to raw elapsed time and nothing else changes. After T42 the resolution clock continues against the same due time, as it does after ZM rework.

## 10. The rework loop ends

ZM rework (T22) and resident rejection (T42) both raise `reopen_count` , which is bounded by `reopen_limit` . At the limit, T43 and T44 send the ticket to the GM. The cycle through In Progress therefore runs at most twice before it leaves through the GM's desk. A ZM cannot loop a ticket silently, because a returned ticket offers only T15 and T24, and neither closes it. The 1.5x rule (T25) is a second safety net, since rework does not reset the due time.

## 11. Events that are not transitions

- A second or third vendor accepting, or a role finishing while others stay open, changes no status and no phase. It is logged as a role event.
- A vendor rejecting or timing out on a role while other roles are already accepted leaves the phase unchanged and is logged as a role event.
- The 1.0x alert is a notification and changes nothing.
- Category or priority edits and a due-time reset by the GM are logged as field changes.

## 12. From 13 states to 5

| Baseline state | Now | Where the information lives | Reason |
|---|---|---|---|
| Reported | Reported / Triage | `phase` , handler Coordinator | Entry point stays. |
| Awaiting Resident | Reported / Awaiting Resident | `phase` plus the resident-held interval | A waiting condition, not a stage the resident needs to see. |
| Triaged | Reported / Triage, handler ZM | `handler` | It only said whose desk the ticket was on. |
| Genuine | Confirmed flag | `confirmed_by` , `confirmed_at` | A pass-through between confirm and assign. |
| Assigned | Reported / Assigned, or In Progress / Assigned after rework | `phase` | Work is not claimed until a vendor accepts. |
| Accepted | In Progress / Accepted | `phase` , `first_accepted_at` | A vendor has committed. |
| In Progress | In Progress / Working | `phase` | Work has started. |
| Completed | Under Review / Verifying | `phase` | The vendor only claims completion, so the resident sees Under Review. |
| Resolved | Under Review / Confirming | `phase` , `confirm_due_at` | Verified, and the resident still has 48 hours. |
| Unresolved | Closed (Unresolved) | `resolution` | One column holds the outcome. |
| Escalated | any status, handler GM | `handler` , `escalated_flag` | The GM's desk is not a stage of the problem. |
| Closed | Closed | `resolution` | Final record. |
| Disputed | Disputed | `disputed_at` , `dispute_due_at` | A closure was challenged. |

## 13. Test space and requirement wording

The top-level space of triples is 6 source values × 5 target states × 6 actors = 180. We test every triple and expect it to succeed exactly when it appears in the table. The ten allowed (status, phase) pairs and the phase checks of each transition add guard tests. We count the legal triples once the table is frozen.

The baseline wording needs three changes through change control:

- FR5.1 says 13-state machine and becomes a five-state machine with seven phases.
- FR3.5 and NFR3.5 say Completed exactly once and become Under Review entered exactly once.
