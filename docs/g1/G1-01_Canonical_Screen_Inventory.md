# AA Pro — G1-01 Canonical Screen Inventory

**Version:** G1 v1.2 · 14 Oct 2026 · **Baseline:** FRD v1.1 · **Design reference:** Stitch ZIP 8 (`31e5581c…`) and ZIP 9 (`f11fd40d…`), kept read-only and unmodified (checksums re-verified 14 Oct 2026).
**Branding:** AA Pro throughout. The AI tutor is labelled "AA Pro AI Tutor" / "AI Tutor" (OC-01). Stitch folder names that contain "lumina" are quoted only as file references.

## Status key

| Status | Meaning |
|---|---|
| **SELECTED** | Canonical source for the screen. It is built from this, with the design changes in G1-04 applied. |
| **SELECTED – PENDING** | My recommended canonical, which still needs your approval (decision ID given). |
| **REFERENCE** | Not built as a screen. Specific components or states are reused, as named. |
| **SUPERSEDED** | Not used. Its content is fully covered by another screen. |
| **MISSING** | No design exists. A brief is in G1-03. |

## 1. Existing Stitch screens (21 UI + logo + spec)

| ID | Stitch source (folder) | Role | Form | Status | Canonical for | Reused parts / reason | Key G1-04 changes |
|---|---|---|---|---|---|---|---|
| S1 | student_dashboard_my_learning_space | Student | Desktop | **SELECTED** (OC-14) | Student dashboard (desktop) | Pure student view; clear AI vs Human labelling | Remove mode switcher, sibling chips, GC homework, compliance banners; rebrand; static Zoom ID removed |
| S2 | child_dashboard_1 | Student | Desktop | REFERENCE (alternate for D-20a) | — | Hero greeting card, "next class" card | Remove "Book 1-on-1" |
| S3 | child_dashboard_book_ingestion_zoom_scheduling | Student+Parent mix | Desktop | SUPERSEDED (by S6) | — | — | — |
| S4 | multi_child_learning_portal_[redacted]_gr_5_[redacted]_gr_4 | Student+Parent mix | Desktop | SUPERSEDED (by S6; 96% identical to S5) | — | — | — |
| S5 | multi_child_portal_book_ingestion_zoom_scheduling_hub | Student+Parent mix | Desktop | SUPERSEDED (by S6) | — | — | — |
| S6 | student_dashboard_schedule_ai_class_integrated_ai_classroom_launcher | Student+Parent mix | Desktop | REFERENCE | — | "Schedule your AI lesson" modal step layout; confirmed-slot card; "Family schedule at-a-glance" pattern as reference for the **Parent** dashboard | Book-ingest modal, sibling switcher and student-side tutor booking not reused |
| S7 | child_dashboard_2 | Student | Mobile | REFERENCE | — | "Today's goals" progress card (subject to D-12) | — |
| S8 | lumina_ai_learning_platform | Student | Mobile | SUPERSEDED (by S7/S9; no screenshot) | — | — | — |
| S9 | ZIP 9 `code.html` | Student | Mobile | **SELECTED** | Student dashboard (mobile) | Bottom nav with AI FAB, live-session card, timetable, AI booking modal | Remove "Ingest School Book (OCR)" tile, sibling chips, GC homework, Zoom ID/passcode |
| S10 | class_schedule_1 | Student | Desktop | SUPERSEDED (by S11) | — | — | — |
| S11 | student_schedule_schedule_ai_class_flow_calendar_view | Student | Desktop | **SELECTED** | Student schedule / calendar (desktop) | Week strip, day timeline, Up Next card; "Schedule AI class" opens S13 (the parent-rules card is not shown to students, R-08) | Remove Quick Class Booking (tutors), Reschedule on human class, wallet/credit text, Spanish Club; slots computed by the FRD model (OC-05) |
| S12 | class_schedule_2 | Student | Mobile | **SELECTED** | Student schedule (mobile) | Mobile session list | "Reschedule Class" on human sessions removed; AI-only "Book this slot" |
| S13 | book_a_class_1 | Student | Desktop | **SELECTED** (OC-14; linked from S11) | Student AI booking wizard (desktop); also reused for the Parent AI booking flow with a child picker | Subject → date → slot states (available / selected / unavailable) → review → confirm | Copy changed from "parent-published slots" to "available times"; SMS removed; durations per D-06 |
| S14 | book_a_class_2 | Student | Mobile | **SELECTED** (HTML is the reference; the screenshot is incomplete) | Student AI booking (mobile) | Mobile wizard steps | Duration options per D-06 |
| S15 | ai_classroom_2 | Student | Desktop | **SELECTED** | AI classroom (desktop) | PDF toolbar (page/zoom), tutor panel, transcript, Hint/Repeat/Next, push-to-talk, text fallback, End Class dialog | Tutor renamed "AI Tutor"; viewer renders a real PDF page, not invented HTML content; extras per D-14; error states added (M-18) |
| S16 | ai_classroom_1 | Student | Mobile | **SELECTED** | AI classroom (mobile, stacked) | Stacked viewer + tutor | Same as S15 |
| S17 | learning_library_1 | Student | Desktop | **SELECTED** | Learning library (desktop) | Search, filters, source badges, preview drawer, skeleton/empty states | GC badges and sync bar removed (OC-03); locked state per D-17; offline download removed |
| S18 | learning_library_2 | Student | Mobile | **SELECTED** (HTML is the reference; the screenshot is blank) | Learning library (mobile) | State switcher patterns, note reader | Same as S17 |
| S19 | parent_dashboard_family_learning_hub | Parent | Desktop | **SELECTED** | Parent dashboard | Child cards, AI scheduling card, human-booking entry, family calendar, content repository preview, notification-preferences summary, upload modal | Separate Parent sidebar; WhatsApp shown as "when enabled"; screen-time gate per D-05; no "AI Study Cards" (OC-03); no .ics export (OC-03) |
| S20 | parent_mode_book_human_teacher | Parent | Desktop | **SELECTED** | Parent books human teacher | 4-step stepper, teacher cards, slot states, session summary | 40-min max; ratings removed (R-04); Zoom Basic external; recording, SMS and credit text removed; "Confirmed" shown only after provider success |
| S21 | teacher_dashboard_schedule_hub | Teacher | Desktop | **SELECTED** | Teacher dashboard | Sessions list, availability grid + slot publisher, assigned roster, share resources | Teacher-only sidebar; no static Zoom room/passcode; 40-min sessions; cohort session per D-15 |
| L1 | aa_logo_[redacted]_learning_portal | Brand | SVG | **REFERENCE only** (OC-11) | — | Not used. The interim logo is the "AA Pro" text wordmark in Outfit, `#006194`; a final logo is a separate decision | The file name contains child first names, so it is not used as an asset name |
| D1 | lumina_learn/DESIGN.md | Spec | — | **SELECTED** (front-matter tokens only) | Design tokens | Colour, type, radius and spacing tokens | Prose palette not adopted (contrast); retitled AA Pro in derived docs |

**Counts (21 UI screens):** 13 selected (all confirmed by OC-14), 3 reference-only (S2, S6, S7), 5 superseded (S3, S4, S5, S8, S10). Plus the logo (reference only; text wordmark per OC-11) and the spec (tokens selected). Intentional deviations from the selected screens are in G1-04 §5.

## 2. Screens with no Stitch design (brief in G1-03; proposed design on the review canvas)

Per OC-15, Claude prepared proposed designs for all of these on the design canvas **"AA Pro — Missing Screens (G1 Review)"**, one page per portal. They are **proposed, not approved**; approval is D-32. Some screens are combined on one board: M-04/M-05, M-20/M-22, M-26/M-35, M-32/M-33. Phone-width boards exist for M-02, M-16 and M-18.

| ID | Screen | Role | FRD refs |
|---|---|---|---|
| M-01 | Sign in (adult) | Parent / Teacher / Super Admin | FR-001, UC-01 |
| M-02 | Child sign in | Student | FR-001, OD-01, TV-04 |
| M-03 | Password recovery and reset | Adults (child via parent) | FR-001, TV-04 |
| M-04 | Session expired / signed out / account locked or deactivated | All | FR-001 |
| M-05 | Access denied (403), not found (404), general error | All | FR-002, §12 |
| M-06 | Privacy notice and guardian consent (parent first run) | Parent | §12, NFR-08 |
| M-07 | Children list | Parent | FR-003, UC-02 |
| M-08 | Child profile create/edit (incl. credentials) | Parent | FR-003, FR-001, OD-01 |
| M-09 | Availability and restrictions | Parent | FR-005, OD-03, D-05 |
| M-10 | Booking detail with cancel/reschedule | Parent (Student read-only variant) | FR-007, FR-008, §6 states |
| M-11 | Invite external teacher | Parent | UC-08, FR-020 |
| M-12 | Notification preferences and consent | Parent | FR-015, UC-09, OD-07 |
| M-13 | Notification and booking status log | Parent | FR-015, §6 |
| M-14 | Content repository and upload states | Parent | FR-012, FR-014, UC-05 |
| M-15 | Session history and summaries | Parent | FR-016 |
| M-16 | My learning history | Student | FR-016 |
| M-17 | Booking outcome states (slot taken, failed, confirmed) | Student / Parent | FR-006, NFR-05 |
| M-18 | AI classroom states (mic, connecting, reconnecting, offline, provider error, ended + summary, resource unavailable) | Student | FR-010, FR-011 |
| M-19 | Human meeting states (pending provider, failed, join window, cancelled) | Student / Parent / Teacher | FR-008, FR-009, FR-020 |
| M-20 | Teacher onboarding (profile, subjects, grades) | Teacher | FR-004, OD-02 |
| M-21 | Teacher account status (pending approval / suspended / deactivated) | Teacher | FR-004, §6 |
| M-22 | Teacher profile edit | Teacher | FR-004 |
| M-23 | Teacher availability management | Teacher | FR-005, UC-07 |
| M-24 | Teacher meeting detail and propose meeting | Teacher | FR-008, UC-07, D-08 |
| M-25 | Assigned student detail | Teacher | §3.2 rules |
| M-26 | Super Admin sign in with MFA | Super Admin | UC-10 |
| M-27 | Accounts list and search | Super Admin | FR-017 |
| M-28 | Create / edit / deactivate Parent or Teacher | Super Admin | FR-017, UC-10 |
| M-29 | Teacher approval queue | Super Admin | FR-004, D-09 |
| M-30 | Audit log (read-only) | Super Admin | FR-018, NFR-18, D-11 |
| M-31 | Integration health (deferred unless D-11 approves) | Super Admin | §6 Integration states |
| M-32 | External teacher invitation email | External | UC-08, D-25 |
| M-33 | Notification templates (email; WhatsApp later) | Recipients | FR-015 |
| M-34 | Account settings and sign out (adults) | Parent / Teacher / Super Admin | FR-001 |
| M-35 | Super Admin home / shell | Super Admin | FR-017 |

## 3. Navigation map (proposed, role-separated)

| Portal | Primary navigation (from canonical sources) | Added by G1 |
|---|---|---|
| Student (S1/S9 shell) | Dashboard · My Schedule · Book AI Class · AI Classroom (entered from a booking) · Library · History | History (M-16). "Parent Mode" button removed; parents use their own login. |
| Parent (S19 sidebar, parent items only) | Family Home · Children · Schedule AI Class · Book Human Teacher · Family Calendar · Content Repository · Session History · Notifications · Settings | M-07…M-15, M-34 |
| Teacher (S21, teacher items only) | Dashboard · My Schedule · Availability · Students · Learning Resources · Profile | M-20…M-25 |
| Super Admin (new) | Home · Accounts · Teacher Approvals · Audit Log · (Integration Health per D-11) | M-26…M-31, M-35 |
