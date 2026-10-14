# AA Pro — G1-03 Design Briefs for Missing Screens

**Version:** G1 v1.2 · 14 Oct 2026 · **Status:** BRIEFS ONLY — not designs.
These briefs say what each missing screen must contain and do. **Update (G1 v1.2, OC-15):** per your corrected D-27, Claude has prepared proposed visual designs for every brief on the design canvas "AA Pro — Missing Screens (G1 Review)". The designs are **proposed, not approved**; approval is D-32. Where a brief depends on an undecided rule, the design shows an amber "Pending D-xx" note instead of guessing.

## Common constraints (apply to every brief)

- **Brand:** AA Pro only, via the central brand component. The AI tutor is "AA Pro AI Tutor" / "AI Tutor" (OC-01).
- **Tokens:** DESIGN.md front-matter tokens; Outfit headlines, Plus Jakarta Sans body; pill buttons ≥ 48 px; cards 24 px radius; accessibility rules AX-01…AX-14 in G1-04.
- **Shells:** student screens use CMP-ShellStudent; Parent, Teacher and Super Admin use CMP-ShellAdult with their own menu. There is no role switcher.
- **Data:** synthetic data only (G1-04 §4). No compliance or security claims.
- **States:** every data screen needs loading (skeleton), empty, error (retry) and success states. Every destructive action needs a confirmation dialog.
- **Responsive:** 375 / 768 / 1280 px with no horizontal scroll.
- **Authorisation:** what a screen shows is always filtered server-side. A brief's "visible to" line is a requirement, not a UI preference.

---

## A. Authentication and system states

### M-01 Sign in (adult) — Parent, Teacher, Super Admin · FR-001, UC-01
- **Content:** AA Pro wordmark; email and password; "Forgot password?"; a short neutral privacy line linking to the privacy notice.
- **States:** invalid credentials (generic message that does not reveal whether the account exists); too many attempts ("Try again in N minutes"); account deactivated (routes to M-04); Super Admin is sent to M-26 (MFA).
- **Acceptance:** keyboard-only completion; the error is announced to screen readers; no role chooser (role comes from the server).

### M-02 Child sign in — Student · FR-001, OD-01, TV-04, D-23
- **Content:** large, friendly layout; username and password fields (credential form per D-23); a "Ask your parent for help" link instead of self-service recovery.
- **States:** wrong details (child-friendly copy); locked ("Your parent has been told; please ask them to help"); deactivated.
- **Rules:** no email collection from the child; no "remember me" on shared devices unless you approve it.
- **Acceptance:** 56 px targets; readable at Grade 1 reading level; lockout follows D-23.

### M-03 Password recovery and reset — adults; child reset via parent (M-08)
- **Content:** request form (email) → neutral confirmation ("If an account exists, we have sent a link") → reset form with strength guidance → success.
- **States:** expired or used link.

### M-04 Session and account status pages — all roles
- **Variants:** signed out; session expired; account locked; account deactivated (contact parent or support); teacher pending approval links to M-21.
- **Acceptance:** one clear action per page; no internal codes shown to children.

### M-05 Access denied / not found / general error — all roles
- **Content:** plain-language explanation, a "Go to my home" button and a support reference (correlation ID for adults only).
- **Rule:** a 403 must not reveal whether the requested record exists (show 404 behaviour for other children's records).

### M-06 Privacy notice and guardian consent — Parent, first run · §12, NFR-08
- **Content:** what data is collected about the child; how the AI Tutor uses lesson context; no raw audio stored; summaries kept per D-24; retention and deletion rights; consent checkbox(es) per purpose (account, AI Tutor, notifications); link to the full notice.
- **Rule:** no child account can be created until required consent is given. The consent version and timestamp are recorded.
- **Dependency:** the legal text is supplied after legal review. Placeholders are clearly marked "DRAFT – not legal text".

## B. Parent portal

### M-07 Children list — Parent · FR-003, UC-02
- **Content:** a card per linked child (first name, grade, curriculum, timezone, next session) with actions: View, Edit, Restrictions, Reset sign-in.
- **States:** empty ("Add your first child"), linking to M-08.

### M-08 Child profile create/edit — Parent · FR-003, FR-001.2, D-23
- **Fields:** first name (display); grade; curriculum (free text or list, to be configured); IANA timezone (defaults to the parent's); subjects (from catalogue); sign-in username and password set by the parent; avatar (illustration choice, no photo upload).
- **Actions:** save; reset child password; deactivate child (confirmation); delete child data (confirmation; follows the retention policy, D-28).
- **Rules:** data minimisation — no date of birth, school or surname unless you approve them.

### M-09 Availability and restrictions — Parent · FR-005, OD-03, D-05
- **Content:** explanation "The AI Tutor is available any time except the times you block"; recurring blocked periods (weekly grid); one-off blocked dates; limits per D-05 (e.g. max AI minutes per day, minimum lead time); a preview of the child's resulting available times for the coming week.
- **Rule:** changes never silently remove confirmed bookings. Conflicting bookings are listed for the parent to keep or cancel (FR-005.3).
- **Open:** exact rule set (D-05) and slot length (D-06).

### M-10 Booking detail with cancel/reschedule — Parent; read-only variant for Student
- **Content:** session type badge (AI / Human), child, subject, chapter, date and time in the viewer's timezone, duration, teacher or AI Tutor, booking status (§6 states), notification status per recipient (M-13), and Join action when authorised.
- **Actions:** cancel and reschedule within the D-07 rules, both with confirmation. Reschedule re-uses the slot picker. The student variant has no actions for human sessions.
- **States:** PENDING_PROVIDER, FAILED (with "Try again" or "Choose another time"), CANCELLED, COMPLETED, MISSED.

### M-11 Invite external teacher — Parent · UC-08, FR-004.2, FR-020, D-25
- **Content:** teacher name and email, child (first name only), subject, date/time, duration ≤ 40 min, and a preview of the email (M-32).
- **Rule:** the copy states plainly that the person will get an email invitation only, with no AA Pro account.
- **States:** sent, failed, Zoom creation failed.

### M-12 Notification preferences and consent — Parent · FR-015, OD-07, UC-09
- **Content:** per event (booking confirmation, T−15 reminder, cancellation, reschedule, failures) × channel (email; WhatsApp shown as "Available when enabled"); reminder lead time (default 15 min); recipients (the parent; additional guardian if approved); WhatsApp consent capture when enabled.
- **Rule:** email is the fallback if WhatsApp is unavailable or consent is missing.

### M-13 Notification and booking status log — Parent · FR-015, §6
- **Content:** table of messages: event, channel, recipient (masked), scheduled time, status (QUEUED / SENDING / SENT / DELIVERED / FAILED / RETRY_PENDING / SKIPPED) with plain-language explanations ("Sent" means handed to the provider, not delivered).
- **Filters:** child, date, status.

### M-14 Content repository and upload — Parent · FR-012, FR-014, UC-05, D-26
- **Content:** library table/grid of parent uploads and teacher-shared items (source badge); upload dialog with file picker, allowed formats and size, rights confirmation (D-26), and assignment (child, subject, chapter).
- **States:** uploading (progress), processing, available, failed (reason: type, size, corrupt, scan), duplicate detected (keep both / replace), archived.
- **Rule:** only AVAILABLE resources open (FRD §6).

### M-15 Session history and summaries — Parent · FR-016, D-24
- **Content:** per child, a list of past sessions (AI and human), each showing date, subject, duration, outcome (completed, missed, ended early) and, for AI sessions, the short summary and topics covered.
- **Rule:** no audio or full transcript is shown or stored (per D-24 recommendation).

## C. Student portal additions

### M-16 My learning history — Student · FR-016
- **Content:** a simple timeline of the child's own past sessions with subject icons and a short, child-friendly summary.
- **Rule:** no sibling data.

### M-17 Booking outcome states — Student and Parent · FR-006, NFR-05
- **Variants:** confirmed (with Add-to-schedule, no calendar sync); "That time was just taken — pick another" (conflict); "Something went wrong — try again" (idempotent retry); outside allowed times (restriction message without exposing parent settings detail to the child).

### M-18 AI classroom states — Student · FR-010, FR-011
- **Variants:**
  1. Before start: mic permission explainer → browser prompt.
  2. Mic denied: continue with typed answers, with "How to turn on the mic" help.
  3. Connecting.
  4. Connected/listening/speaking indicators.
  5. Reconnecting after network loss (lesson pane stays usable).
  6. Offline.
  7. Provider error with Retry and Leave.
  8. Session timeout.
  9. Resource unavailable (textbook can't load) with "Tell my parent".
  10. End-class confirmation (per D-14).
  11. Ended: short summary and "Back to my dashboard".
- **Rule:** page changes come only from validated navigation events (FR-011.2). An invalid request is ignored silently for the child and logged.

### M-19 Human meeting states — Student, Parent, Teacher · FR-008, FR-009, FR-020
- **Variants:** awaiting Zoom (PENDING_PROVIDER); failed to create (parent/teacher see the reason and actions; the student sees "Not ready yet"); join opens in N minutes; join now (opens Zoom externally); cancelled; rescheduled (old time struck through, new time shown).

## D. Teacher portal

### M-20 Teacher onboarding — Teacher · FR-004, OD-02
- **Content:** name, display name, subjects, supported grades, short bio, timezone, contact email; agreement to platform terms. Submit sends the profile for approval (D-09).
- **Rule:** no access to calendar, students or resources until ACTIVE.

### M-21 Teacher account status — Teacher · §6 Teacher states
- **Variants:** PENDING_APPROVAL ("We're reviewing your profile"), SUSPENDED, DEACTIVATED; each with a support contact.

### M-22 Teacher profile edit — Teacher
- Same fields as M-20. Changes to subjects or grades may require re-approval (decision recorded under D-09 if you want it).

### M-23 Availability management — Teacher · FR-005.2, UC-07
- **Content:** full-page version of the S21 availability grid: recurring weekly slots, exceptions/time off, timezone, slot length ≤ 40 min, capacity = 1 (D-15), publish/unpublish.
- **Rule:** removing a slot with a confirmed booking requires an explicit cancel flow with parent notification (FR-005.3, D-07).

### M-24 Meeting detail and propose meeting — Teacher · FR-008, D-08
- **Content:** meeting detail (student first name, subject, time, status, join action); "Propose meeting" for an assigned student → awaits parent confirmation if D-08 is approved as recommended.
- **States:** M-19 variants.

### M-25 Assigned student detail — Teacher · §3.2
- **Content:** first name, grade, subjects taught by this teacher, past and upcoming meetings with this teacher, resources this teacher shared.
- **Rule:** no parent-uploaded files unless shared (D-16); no data from other teachers' sessions.

## E. Super Admin portal

### M-26 Super Admin sign in with MFA — UC-10
- Sign-in (M-01 layout) followed by a second-factor step (method to be chosen in Phase 2). Lockout and audit on failure.

### M-35 Super Admin home
- Counts (active parents, active teachers, pending approvals) and shortcuts to M-27 and M-29. No child content.

### M-27 Accounts list — FR-017
- Table of Parent and Teacher accounts: name, email, role, status, created, last sign-in. Search and filter by role and status. Child accounts are visible only as counts under a parent, unless you approve more.

### M-28 Create / edit / deactivate account — FR-017, UC-10
- Forms for Parent and Teacher. Deactivation requires a reason and confirmation and is audited. There is no "impersonate user" feature.

### M-29 Teacher approval queue — FR-004, D-09
- Pending teacher profiles with an Approve / Request changes / Reject decision and a mandatory note. Every decision is audited.

### M-30 Audit log (read-only) — FR-018, NFR-18, D-11
- Filterable table: time, actor, action, entity, correlation ID. It contains no secrets or conversation content. Export is subject to your approval.

### M-31 Integration health — deferred unless D-11 approves
- Status per integration (NOT_CONNECTED / CONNECTED / DEGRADED / EXPIRED / REVOKED / ERROR). It never shows tokens.

## F. Messages and settings

### M-32 External teacher invitation email — D-25
- **Contents:** "AA Pro" header; invitation from the parent (display name); subject, date and time with timezone; duration; Zoom join link (per D-25); statement that no AA Pro account is created; contact/decline instruction.
- **Rule:** no child surname, school, photo or profile data.

### M-33 Notification templates — FR-015
- Email templates for booking confirmation, T−15 reminder, cancellation, reschedule and booking failure. WhatsApp versions are written to provider template rules when enabled.
- **Rule:** minimum necessary content; join links only for authorised recipients.

### M-34 Account settings and sign out — adults
- Name, email, password change, timezone, notification preferences link (parents), sign out of all devices.
