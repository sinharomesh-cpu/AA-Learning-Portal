# AA Pro — Phase 0 Audit Report (FRD v1.1 × Google Stitch export)

> **Revision 1.1 (14 Oct 2026).** The branding decision has been updated after owner clarification. **OC-01:** AA Pro is the single umbrella brand, and the AI tutor is an integrated AA Pro capability labelled "AA Pro AI Tutor" / "AI Tutor". Former D-01 is closed. The current decision list is in **G1-05 Decision Register**, which supersedes section 12 below. All other findings are unchanged.

**Date:** 14 October 2026 · **Status:** Audit only. No application code was written. No source file was modified, reformatted or deleted. No dependencies were installed and no services were connected.
**Baseline:** AA Pro FRD v1.1 (13 Oct 2026) is the requirements baseline. The Stitch export is the design reference only.

**Evidence labels used throughout**
- **[V] Verified:** observed directly in a file I opened (HTML source, screenshot, PDF page or checksum).
- **[I] Inference:** a reasoned conclusion from verified evidence, but not proven.
- **[Q] Question:** unresolved and needs an owner decision.

---

## 1. Executive summary

1. **All sources were accessible [V].** The FRD (14 pages) was read in full, and every file in both ZIPs was opened. The two copies of "stitch … 9.zip" are byte-identical (same SHA-256), and ZIP 9's `DESIGN.md` is identical to ZIP 8's.
2. **The export holds 21 UI screens, 1 logo and 1 design specification [V].** ZIP 8 contains 20 screens and the logo; ZIP 9 contains one mobile student dashboard. There is **no Super Admin screen**, and there are **no authentication, onboarding, child-management, notification-preference or session-history screens**.
3. **Every integration in the designs is a mock-up [V].** No HTML file makes a network call (`fetch`/XHR count = 0). All interactivity is inline DOM toggling, `alert()` or hard-coded toasts. Zoom IDs, passcodes, sync times, "Verified" badges and delivery states are static text.
4. **The designs conflict with the FRD in material ways [V].** The main conflicts are:
   - students can book or reschedule human tutors;
   - students can upload ("Ingest School Book / OCR");
   - human sessions run 45–60 minutes, while the FRD caps them at 40;
   - the designs show Google Classroom sync, payments/credits/wallet, Zoom Enterprise with recording, SMS notifications and teacher ratings;
   - AI availability works as a list of parent-published slots, while the FRD says 24/7 except blocked periods;
   - a single client-side Student/Parent/Teacher mode switcher appears on most screens.
5. **The brand is mostly not AA Pro [V].** "Lumina Learn", "Lumina", "AA Lumina" and the AI persona "Tutor Lumina"/"Lumi" appear across 19 of the 21 screens. "AA Pro" appears in only 7 files, usually alongside Lumina. *(Rev 1.1: per OC-01, every Lumina reference, including the tutor persona, is replaced with AA Pro or "AA Pro AI Tutor" / "AI Tutor". See G1-04 BR-01…BR-08.)*
6. **There are privacy flags [V].** The demo data uses two demo first names (redacted in this copy), which also name the logo file (`aa_logo_[redacted]_learning_portal`). It also uses a real school ([school name redacted], plus a [school email domain, redacted] email address), a Singapore-format phone number and unverified compliance claims ("COPPA / Lumina ChildSafe Guard 2.4 Active", "ChildSafe™", "End-to-End Encrypted").
7. **The design tokens are consistent across the HTML [V].** However, `DESIGN.md` contradicts itself: the YAML front-matter sets primary `#006194`, while the prose says `#0284C7`. The HTML uses the front-matter tokens, and those pass contrast checks. The prose primary on white (4.10:1) fails WCAG AA for normal text.

**Recommended next milestone:** owner decisions in section 12, then **G1 Design gate**: a canonical screen set, an AA Pro rebrand plan and a traceability matrix. Phase 1 (design system and UI shell with mock data) starts only after that.

---

## 2. Source-file inventory

| Source | Size | SHA-256 (first 16) | Accessible | Contents |
|---|---|---|---|---|
| AA_Pro_Functional_Requirements_Document_FRD_v1.1.pdf | 1.06 MB, 14 pp | ad4b081bdbd78e68 | Yes [V] | Full FRD, 18 sections + appendix, 7 figures |
| stitch_children_s_ai_learning_portal. 8.zip (project file) | 8.31 MB | 31e5581c811bcdb8 | Yes [V] | 65 entries: 23 folders, 21 `code.html`, 20 `screen.png`, 1 `DESIGN.md` |
| stitch_children_s_ai_learning_portal. 9.zip (project file) | 214 KB | f11fd40db732ec98 | Yes [V] | 3 files at root: `code.html`, `screen.png`, `DESIGN.md` |
| stitch_children_s_ai_learning_portal. 9.zip (conversation copy) | 214 KB | f11fd40db732ec98 | Yes [V] | **Identical** to the project copy |
| Existing application codebase | — | — | None found [V] | The working directory has no project; there is nothing to reconcile |

**File-type findings [V]**
- There are no separate CSS, JS, font or image files in either ZIP.
- Styling uses the **Tailwind Play CDN** (`cdn.tailwindcss.com`), which is a development-only runtime and not suitable for production, plus an inline `tailwind.config`.
- Fonts come from Google Fonts: Outfit, Plus Jakarta Sans and Material Symbols Outlined.
- All photos and illustrations (2–7 per screen) are **hot-linked** from `lh3.googleusercontent.com` (Stitch-generated). They are not bundled and may expire. All `<img>` tags have alt text.
- All JavaScript is inline. Its purpose is prototype state toggling only.
- ZIP 8 timestamps are all 2026-10-12 18:09, and ZIP 9's are 19:01. These are **export** times, not design-revision times, so they cannot order versions inside ZIP 8 [I].
- Screenshots are rendered at a fixed 1600 px height. Widths of 222–369 px indicate mobile designs [V].
- Two screenshots are incomplete [V]: `learning_library_2` is blank below the header, and `book_a_class_2` has empty date, slot and preview regions. `lumina_ai_learning_platform` has **no screenshot**.

---

## 3. Screen inventory

Role is the role the screen is designed for. Similarity is the word-level similarity of visible text between screens [V].

| # | Folder | Role | Form | Screenshot | Brand seen | Purpose / notable content | Lineage group |
|---|---|---|---|---|---|---|---|
| S1 | student_dashboard_my_learning_space | Student | Desktop | Yes | AA Pro + Lumina | Dashboard; three-mode switcher; Human-teacher Zoom hero; Tutor Lumina card; 6 subject cards; GC homework; badges; today's sessions | Student dashboard (layout B) |
| S2 | child_dashboard_1 | Student | Desktop | Yes | Lumina | Dashboard; hero; next class; subject portals (incl. "Book 1-on-1"); Tutor Lumina; School Study Hub (GC demo) | Student dashboard (layout A), v1 |
| S3 | child_dashboard_book_ingestion_zoom_scheduling | Student (+Parent features) | Desktop | Yes | Lumina | S2 + Zoom live banner, "Ingest School Book" modal, chapter drawer, "Schedule Zoom Tutor" | Layout A, v2 |
| S4 | multi_child_learning_portal_[redacted]_gr_5_[redacted]_gr_4 | Student/Family hybrid | Desktop | Yes | Lumina, AA Lumina | S3 + sibling switcher, Family Schedule At-a-Glance | Layout A, v3a |
| S5 | multi_child_portal_book_ingestion_zoom_scheduling_hub | Student/Family hybrid | Desktop | Yes | Lumina, AA Lumina | 96% text-identical to S4; identical 18,005-byte script | Layout A, v3b (duplicate) |
| S6 | student_dashboard_schedule_ai_class_integrated_ai_classroom_launcher | Student/Family hybrid | Desktop | Yes | Lumina + AA Pro | S4/S5 (85–89% similar) + "Schedule Your AI Lesson" modal + confirmed-slot card | Layout A, v4 (most complete) |
| S7 | child_dashboard_2 | Student | Mobile | Yes | Lumina | Mobile dashboard; scenario walkthrough banner; bottom nav with AI FAB | Mobile dashboard v1 |
| S8 | lumina_ai_learning_platform | Student | Mobile | **No** | Lumina | 78% similar to S7; only source in the export mentioning ElevenLabs ("simulated") | Mobile dashboard v1 variant |
| S9 | ZIP 9 `code.html` | Student | Mobile | Yes | **AA Pro** header + Lumina | Mobile dashboard; sibling chips; Zoom live card; "Schedule AI Class" and "Ingest School Book (OCR)" tiles; timetable; GC homework; AI booking modal | Mobile dashboard v2 (latest export) |
| S10 | class_schedule_1 | Student | Desktop | Yes | Lumina | Week calendar; day timeline; Up Next countdown; Parent Authority rules; Quick Class Booking (tutors) | Student schedule v1 |
| S11 | student_schedule_schedule_ai_class_flow_calendar_view | Student | Desktop | Yes | **AA Pro** title + Lumina | S10 (75% similar) + "Schedule AI Learning Session" panel (subject → chapter → approved slot → confirm) | Student schedule v2 |
| S12 | class_schedule_2 | Student | Mobile | Yes | Lumina | Mobile schedule list; open slots; cancelled class with "Reschedule Class" | Student schedule mobile |
| S13 | book_a_class_1 | Student | Desktop | Yes | Lumina | AI class wizard: subject → date → parent-published slots (locked/restricted states) → review → confirm modal | AI booking desktop |
| S14 | book_a_class_2 | Student | Mobile | Partial | Lumina | AI class wizard mobile: subject, date, slot, duration (30/45), goal, confirm | AI booking mobile |
| S15 | ai_classroom_2 | Student | Desktop | Yes | Lumina | Split view: textbook (page 42/118, zoom, annotate) + Tutor Lumina panel (status, transcript, Hint/Repeat/Next, push-to-talk, text input); End Class modal with "enter 7" check | AI classroom desktop |
| S16 | ai_classroom_1 | Student | Mobile | Yes | Lumina | Stacked textbook over tutor; Hint/Repeat/Next; exit modal | AI classroom mobile |
| S17 | learning_library_1 | Student | Desktop | Yes | Lumina | Search, subject and type filters, source badges (Classroom Sync / NCERT / teacher-uploaded), preview drawer, simulator states (skeleton / empty / locked) | Library desktop |
| S18 | learning_library_2 | Student | Mobile | Blank | Lumina | Mobile library; state switcher (standard / loading / empty / locked); note reader modal | Library mobile |
| S19 | parent_dashboard_family_learning_hub | Parent | Desktop | Yes | AA Pro + Lumina | Child cards; Schedule AI Class form; Book Human Teacher card; family calendar with Reschedule/Cancel; content repository; governance (email, WhatsApp "Prototype", screen-time gate); upload modal | Parent dashboard (only version) |
| S20 | parent_mode_book_human_teacher | Parent | Desktop | Yes | AA Pro | 4-step stepper: child → teacher (ratings) → published slot (booked/locked states) → Zoom and dispatch settings; Session Manifest | Parent human booking (only version) |
| S21 | teacher_dashboard_schedule_hub | Teacher | Desktop | Yes | AA Pro | Profile; dedicated Zoom room; scheduled sessions; availability grid + slot publisher; assigned roster; publish resources; recently shared | Teacher dashboard (only version) |
| L1 | aa_logo_[redacted]_learning_portal | Brand | SVG | Yes | Lumina (comment) | Two interlocking "A" marks plus a sparkle. **The screenshot does not match the code:** the PNG has no crossbars and reads as an "M" | Logo |
| D1 | lumina_learn/DESIGN.md (= ZIP 9 DESIGN.md) | — | Spec | — | "Lumina Learn" | Design tokens (YAML) and prose design guidance | Design system |

**By role [V]**
- **Student:** 18 screens (S1–S18). Of these, S3–S6 and S9 also embed parent-type functions such as sibling switching and book ingestion.
- **Parent:** 2 screens (S19, S20).
- **Teacher:** 1 screen (S21).
- **Super Admin:** 0 screens.
- **External teacher:** 0 (FRD scope is email only, and no email template is designed).

**Navigation pattern [V]**
- Student desktop uses a top nav: Dashboard / Class Schedule / Book a Class / AI Classroom / Learning Library, plus streak and XP chips and a "Parent Mode" button.
- Student mobile uses a bottom nav: Dashboard / Schedule / centre AI FAB / Library / Profile.
- Parent and teacher screens share **one** left sidebar. It contains a Student Space / Parent Hub / Teacher Portal toggle and both parent and teacher menu groups, with the footer "Parent / Faculty · Verified Admin".

---

## 4. Canonical-screen recommendation

| Need | Recommended canonical | Evidence | Also keep as reference | Supersede (don't build) |
|---|---|---|---|---|
| Student dashboard, desktop | **S1 student_dashboard_my_learning_space** | Named in project brief; AA Pro partly applied; a pure student view, unlike S3–S6 which mix in parent ingestion and sibling management; clear Human vs AI session labelling | S2 for the simpler hero and "next class" card; S6 for its AI scheduling modal | S3, S4, S5 (superseded by S6, which is itself not canonical) |
| Student dashboard, mobile | **S9 (ZIP 9)** | AA Pro in the header; latest export; complete screenshot; bottom nav matches DESIGN.md | S7 for the "today's goals" card | S8 (no screenshot; 78% overlap with S7) |
| Student schedule / calendar | **S11** | Superset of S10 that adds the FR-006 flow (subject → optional chapter → permitted slot → confirm); AA Pro title | S12 (mobile list) | S10 |
| Student AI booking wizard | **[Q] needs review:** S11 inline panel *vs* S13 dedicated page | Both satisfy FR-006. S13 has better slot states (available / locked / restricted) and a confirmation modal. S11 keeps booking in context. | S14 mobile (screenshot incomplete; use HTML) | — |
| AI classroom | **S15 desktop + S16 mobile as one responsive screen** | S15 has every FR-010 control (status, End Class, Hint, Repeat, Next, page nav, zoom). S16 is the stacked mobile layout FR-011 requires. | — | — |
| Learning library | **S17 desktop + S18 mobile** | S17 has source badges, filters, preview drawer and designed loading, empty and locked states | — | — |
| Parent dashboard | **S19** | Only version | — | — |
| Parent books human teacher | **S20** | Only version; good stepper and slot-state design | — | — |
| Teacher dashboard | **S21** | Only version | — | — |
| Logo | **[Q] needs owner decision** | The SVG code and the PNG differ, and the product brand is AA Pro, not Lumina | L1 | — |

**Ambiguous versions for human review**
1. S1 vs S2/S6 layouts for the student desktop dashboard. They are visually different families: S1 has a dense header and three-mode switcher, while S2/S6 use a hero greeting with streak cards.
2. S11 vs S13 for student AI booking.
3. S6's "Family hub" concept, a student view that switches between siblings. The FRD gives each child an individual login (OD-01), so this concept conflicts with it. Should it become the **Parent** "view as child" mode, or be dropped?
4. Whether the end-class "type 7 to confirm" child-lock in S15 is wanted. It is not in the FRD and adds friction for young users.

---

## 5. Design-system report

### 5.1 Tokens actually used in the HTML [V]
Every screen's inline Tailwind config uses the same Material-3-style token set as the `DESIGN.md` front-matter. Some configs are minified differently, but their values are identical.

| Group | Tokens (from front-matter / HTML) |
|---|---|
| Primary | primary `#006194`, primary-container `#007bb9`, on-primary `#fff`, primary-fixed `#cce5ff`, inverse-primary `#93ccff` |
| Secondary (amber) | secondary `#855300`, secondary-container `#fea619`, on-secondary-container `#684000` |
| Tertiary (green) | tertiary `#006947`, tertiary-container `#00855b`, tertiary-fixed `#6ffbbe` |
| Error | error `#ba1a1a`, error-container `#ffdad6` |
| Surfaces | background/surface `#faf8ff`; container-lowest `#fff` → low `#f2f3ff` → `#eaedff` → high `#e2e7ff` → highest `#dae2fd` |
| Text / lines | on-surface `#131b2e`, on-surface-variant `#3f4850`, outline `#707881`, outline-variant `#bfc7d2` |
| Typography | Headlines: **Outfit** 600–800 (xl 40/52, lg 32/40, md 24/32, sm 20/28; mobile xl 32, lg 26). Body/labels: **Plus Jakarta Sans** 500/700 (body 18/16/14; label 16/14/12) |
| Radius | sm 0.5rem, DEFAULT 1rem, md 1.5rem, lg 2rem, xl 3rem, full |
| Spacing | gutter 1.5rem (mobile 1rem), margin 2.5rem (mobile 1rem), xs .375 / sm .75 / md 1.25 / lg 2 / xl 3 rem |
| Breakpoints (prose) | Mobile < 640, Tablet 640–1024, Desktop > 1024; max canvas 1280 px; 12-column grid reflowing to 4 |
| Elevation (prose) | Level 1–3 soft shadows; "tactile push" `translate-y-0.5` on press |
| Icons | Material Symbols Outlined (variable FILL/weight); emoji prefixes on chips |
| Dark mode | `darkMode: "class"` is configured, but no dark palette is defined. **Not designed.** |

### 5.2 Inconsistencies and accessibility issues
- **Two palettes in DESIGN.md [V].** The prose specifies Tailwind-sky values (`#0284C7`, `#F59E0B`, `#10B981`, slate neutrals `#F8FAFC`) that the HTML does not use; only the logo SVG uses them. Recommendation: treat the front-matter tokens as the source of truth.
- **Contrast (computed) [V].**
  - Pairs that pass: primary `#006194` on white 6.69:1; tertiary on white 6.75:1; on-secondary-container on secondary-container 4.60:1.
  - Prose pairs that fail: `#0284C7` on white 4.10:1; white on `#F59E0B` 2.15:1; white on `#10B981` 2.54:1.
  - Borderline: outline `#707881` on white 4.48:1 (fails for text below 18 px).
- **Text size [V].** There are 206 uses of 9–11 px arbitrary text sizes (S6 alone has 59). This contradicts DESIGN.md's legibility goals for 6–11-year-olds.
- **Touch targets [V].** DESIGN.md requires ≥ 48 px and prefers 56 px for children, but defines a 44 px audio button. Many chips and secondary buttons in the screenshots appear smaller than 48 px [I].
- **Header density [V].** Student desktop headers carry 8–10 controls, and nav labels wrap ("Book / a / Class" in S10, S13, S15). This needs responsive correction.
- **Radius conflict [V].** The prose says cards are 24 px (`md`), but the token `DEFAULT` is 16 px. A component-level mapping is needed.
- **Hot-linked imagery [V].** These images are not licensable assets and must be replaced with owned or illustrative assets.

### 5.3 Reusable component catalogue (observed) [V]
- App shells: student top nav, mobile bottom nav with AI FAB, parent/teacher sidebar.
- Greeting hero and stat chips (streak, XP).
- Live/next session banner with a Human/AI badge.
- Subject card (icon, chapter chip, book source, mastery bar, CTA).
- AI companion card (speech bubble, play prompt, quick prompts).
- Timeline/session card (time, duration, type badge, status chip, actions).
- Week date strip, slot card (available / selected / booked / locked / restricted), step indicator, booking summary panel, confirmation modal, toast.
- Resource card (type, source badge, progress, Read/Download), preview drawer, empty, locked and skeleton states.
- Textbook viewer toolbar (page x/y, zoom, annotate), tutor panel (connection status, audio meter, transcript bubbles, quick-help chips, push-to-talk, text fallback), end-class modal.
- Teacher availability grid and slot publisher, roster card, upload dropzone.
- Badge tile and progress meter.

---

## 6. Requirements/design gap report

### 6.1 FRD → design coverage

| FRD item | Design coverage | Gap |
|---|---|---|
| FR-001 Authentication | **None** | No sign-in, child login, recovery, expiry, rate-limit or deactivated-account screens |
| FR-002 Roles/relationships | Partial (mode switcher) | The switcher is a client toggle and must not exist in production. There are no relationship-management screens. |
| FR-003 Child profiles | Sidebar link "Manage Children" only; "Configure" link on S19 | **No child-profile screen** (grade, curriculum, IANA timezone, subjects, credentials) |
| FR-004 Teacher onboarding | None | No teacher sign-up, profile edit, pending-approval or suspended states |
| FR-005 Availability | Teacher grid (S21); parent rules shown read-only (S10/S11) | **No parent restriction/blocked-period editor.** The AI availability model conflicts with the FRD (see 6.3). |
| FR-006 Student AI booking | S11, S13, S14, S6 modal, S9 modal | Covered. Missing: slot-taken/conflict error, idempotent retry state and booking-failed state. |
| FR-007 Parent AI booking | S19 form | Partial. No parent view/cancel/reschedule flow for AI bookings beyond buttons in the calendar. |
| FR-008 Human booking | S20 | Partial. Missing: PENDING_PROVIDER state, failed-Zoom state, external teacher invite (UC-08) and parent reschedule flow. |
| FR-009 Zoom | Buttons and static IDs | Real-meeting states missing. Designs show 45–60 min sessions, Zoom Enterprise, recording and a vanity domain (conflicts). |
| FR-010 AI classroom | S15/S16 | **Missing states:** mic permission denied, connecting, network loss, reconnect, timeout, provider error, session ended/summary. |
| FR-011 Textbook viewer | S15/S16 | The design shows rich HTML lesson content, not a rendered PDF page. A PDF-render, page-out-of-range and resource-unavailable state is needed. |
| FR-012 Parent uploads | S19 upload modal; S3–S6/S9 "Ingest Book" modal | Missing: format/size errors, processing/failed states, duplicate handling. Upload is also shown in **student** views (conflict). |
| FR-013 Google Classroom | Shown on S1, S2–S7, S9, S17, S18 | Out of initial scope (OD-06), so it must be hidden or deferred |
| FR-014 Learning library | S17/S18 | Good. The "Material requires parent or teacher approval" workflow is not in the FRD [Q]. |
| FR-015 Notifications | S19 governance panel; S20 dispatch checkboxes | **No notification-preference/consent screen.** No delivery-status view (QUEUED / SENT / DELIVERED / FAILED / SKIPPED). |
| FR-016 Session history | Badges and mastery only | **No session history or summary screen** for student or parent |
| FR-017 Super Admin | **None** | Entire role missing |
| FR-018 Audit/operations | None | Audit log viewer for Super Admin [Q: in UI scope?] |
| FR-019 Timezone | Mixed static labels (SGT, EST, GMT+8) | No timezone display or setting pattern |
| FR-020 External invite/join | None | No invite flow or email template; join redirect not designed |

### 6.2 Missing screens (to be designed or approved before build; I have not invented them)

| Role | Screens |
|---|---|
| All | Sign in; child sign-in (simplified); password recovery; session expired; account deactivated; 403/404; privacy notice and guardian consent; profile/settings |
| Parent | Manage children (list, create, edit, credentials, subjects, timezone); availability and restrictions editor; booking detail with cancel/reschedule confirmation; external teacher invite; notification preferences and consent; content repository full page with upload states; session history and summaries; booking and notification status |
| Teacher | Onboarding/profile edit; pending-approval and suspended states; availability management page; meeting detail (create/update/cancel with Zoom state); student detail/history |
| Super Admin | Account list and search; create/edit/deactivate Parent and Teacher; teacher approval queue; audit log; integration health (NOT_CONNECTED / CONNECTED / DEGRADED / EXPIRED / REVOKED / ERROR) |
| Student | Session history; booking-failed or slot-taken state; AI classroom error, reconnect and end-of-session summary states |
| External teacher | Email invitation template (no portal) |

### 6.3 Conflicts between the Stitch designs and FRD v1.1 [V unless marked]

| # | Design shows | FRD says | Where |
|---|---|---|---|
| C-01 | Student "Book 1-on-1", "Schedule Zoom Tutor", "Quick Class Booking – tutors available", "Browse Full Booking Catalog" | Students cannot book human meetings (FR-008, OD-04) | S2, S3–S6, S10, S11 |
| C-02 | Student "Reschedule Slot/Class" on a cancelled human class | Students cannot cancel or reschedule human meetings | S10, S11, S12 |
| C-03 | Student "Ingest School Book (OCR)" upload | Child has no file upload (OD-01); OCR is not in the FRD | S3–S6, S9 |
| C-04 | Human sessions of 45/60 min | 40-minute maximum (FR-009, OD-05). No design mentions 40 minutes. | S3–S6, S10, S11, S19, S20, S21 |
| C-05 | AI bookable **only** in parent-published slots ("arbitrary free-text hours strictly prohibited") | AI available **24/7 except** blocked periods, conflicts and parent restrictions (FR-005, OD-03) | S11, S12, S13, S14 |
| C-06 | Google Classroom sync, synced homework, "Check Connection" | Out of initial scope (OD-06) | S1–S9, S17, S18 |
| C-07 | "Credits returned to wallet (+1 Class Pass)", "School Plan Credit", "Parent Budget" | Payments out of scope (OD-09) | S10, S11, S20 |
| C-08 | "Zoom Enterprise", [school Zoom subdomain, redacted] room, "Recorded for Parent Review", "End-to-End Encrypted" | Zoom Basic, external launch, raw audio off; recording not in scope | S20, S21 |
| C-09 | SMS reminders ("SMS & Portal", "Parent SMS Reminder Queued") | Email + WhatsApp only (FR-015) | S13, S21, S3 |
| C-10 | Zoom IDs, passcodes ("#Lumina4G") and join URLs displayed on dashboards | Expose only to authorised participants (FR-020). All IDs are fake. | S1, S3–S6, S9, S19–S21 |
| C-11 | Client-side Student/Parent/Teacher mode switcher; shared parent+teacher sidebar; "Verified Admin" | Separate role-bound sessions; server-enforced authorisation | S1, S19–S21 (and "Parent Mode" button on student screens) |
| C-12 | Teacher ratings/reviews ("4.95, 148 reviews") | Not in FRD | S20 |
| C-13 | Gamification (XP, streaks, badges, quests, mastery %) | Not in FRD; FR-016 covers progress only | Most student screens |
| C-14 | Parent rules: weekly hour budget, 2 h daily cap, "Parent PIN for > 10 h", quiet hours, screen-time gate after 45 min, "Request Budget Extension" | "Parent restrictions" are not defined | S10, S11, S19 |
| C-15 | Classroom extras: Raise Hand / parent assistance, Lesson Notes, annotate pen, "Ask Lumi to Explain", XP timer | FR-010 lists the core controls only | S15, S17 |
| C-16 | Teacher "Small Cohort" (one student + 2 peers) | Bookings implied 1:1; slot "capacity" exists but group sessions are undefined | S21 |
| C-17 | Teacher upload "auto-sync / Instant Sync to Family Hub" *and* "Safe Parent-Gated Distribution" | Teacher "share assigned resources"; parent approval undefined | S21 |
| C-18 | Subjects include Spanish/French "Languages" and Spanish Club | Initial catalogue: Maths, Science, SST, English, Hindi, IT (configurable) | S10, S11 |
| C-19 | Calendar sync to Google/Outlook/.ics | Not in FRD | S4–S6, S19 |
| C-20 | Upload generates "AI Study Cards"; offline download | Not in FRD | S19, S17 |
| C-21 | Compliance badges: "COPPA / Lumina ChildSafe Guard 2.4", "ChildSafe™ 100% Gated", "[school name redacted] Verified", "Accredited Faculty" | Not verified claims; must not ship | S1, S2–S9, S20 |

### 6.4 Conflicts between the project instructions and FRD v1.1 (reported, not resolved)

| # | Project instructions | FRD v1.1 (baseline) |
|---|---|---|
| P-01 | Three roles: Student, Parent, Teacher | **Four** roles plus an External invitee (adds Super Admin) |
| P-02 | Google Classroom in scope (Phase 6) | Out of initial scope (OD-06) |
| P-03 | Zoom is Phase 7, after Classroom | "Prove Zoom API/host permissions" early (step 27, before notifications) |
| P-04 | Default brand text references "Lumina Learn" (later superseded by the AA Pro section) | AA Pro only |
| P-05 | Teacher can "Send meeting invitations through email; WhatsApp when enabled" | WhatsApp is parent-configurable; teacher-initiated WhatsApp is undefined |

---

## 7. External integrations: mock-up vs real

| Integration | In FRD | In designs | Reality in export [V] |
|---|---|---|---|
| ElevenLabs voice agent | Yes | "Tutor Lumina" panel, audio meter, push-to-talk | Mock. S8 labels it "simulated"; transcript is static HTML. |
| PDF/textbook viewer | Yes | Page x/y, zoom | Mock. HTML text, not a PDF renderer. |
| Zoom | Yes (Basic, external) | Join buttons, IDs, passcodes, rooms | Mock. Fake IDs (e.g. 987 654 3210); no API |
| Email | Yes | "Email Dispatch Confirmed", invite sent | Mock (static text) |
| WhatsApp | Yes (after readiness) | "WhatsApp Alert Dispatched", "(Prototype)" | Mock |
| SMS | **No** | Shown | Mock; not in scope |
| Google Classroom | Deferred | Heavy use | Mock ("Simulated Sandbox", "Demo Sync") |
| Calendar sync (.ics/Google/Outlook) | No | Shown | Mock |
| OCR / "AI Study Cards" | No | Shown | Mock |
| Object storage / upload | Yes | Dropzones | Mock (no upload code) |
| Auth / RBAC | Yes | Mode switcher | None (client toggle only) |
| Payments/credits | No (OD-09) | Shown | Mock |

---

## 8. FRD review: UML, use cases and sequence diagrams (ambiguities, not rewrites)

**Document defects [V]**
- Numbered steps in 5.2–5.4 and section 17 continue from earlier lists (7–29) instead of restarting. This is cosmetic, but it breaks cross-referencing.
- In Figure 1, the "Upload learning files", "Manage user accounts" and "Manage own calendar" ellipses overlap, so the Parent, Teacher and Super Admin associations are visually ambiguous. The section 2 table is the clearer source.
- Figure 6 (ERD) omits `teacher_student_links`, `subjects`, `availability`, `audit_events` and `notification_preferences`, which the entity table lists. The figure is labelled "not final", which is acceptable.

**Implementation ambiguities [Q]**
1. **AI availability model (FR-005 vs designs).** Is AI time a block-list (24/7 minus blocks) or an allow-list (parent-published windows)? What does "conflict" mean for AI, given the AI is not a scarce resource? Is the conflict against the child's other bookings only?
2. **"Parent restrictions".** Which rules exist (daily/weekly caps, quiet hours, max session length, lead time, per-subject limits)? Which actor can override them?
3. **AI session duration and limits.** These are not specified. The designs show 30/45 minutes.
4. **Cancellation/reschedule rules.** "Configured AI booking rules" are undefined. There are no cut-off windows for human meetings. RESCHEDULE_PENDING exists, but no actor flow does. Can teachers cancel? Who is notified?
5. **Teacher-initiated meetings (table: "Authorised student only").** No sequence diagram exists. Is parent consent or confirmation required? Which notifications fire?
6. **Teacher–student linking.** Who creates `teacher_student_links`: the parent's first booking, Super Admin, or teacher request?
7. **Teacher approval.** FR-004 requires approval, and the Teacher state includes PENDING_APPROVAL. Is the approver Super Admin? Can teachers self-register?
8. **Zoom ownership.** Whose account hosts meetings: a platform account, each teacher's account, or the parent's (for external invites)? With Zoom Basic, how is host concurrency handled (TV-01/TV-02)? How does a meeting longer than 40 minutes get refused?
9. **External teacher.** Who hosts, and what does the invite contain? Is the join URL in the email? How does FR-020 "only authorised participants" apply to an email recipient?
10. **Child credentials (TV-04).** What form do they take (username + PIN/password, no email)? How does recovery via the parent work? Lockout thresholds?
11. **Reminder recipients.** For a student-booked AI class, who receives the T−15 reminder when the child has no email or phone? Is there an in-app reminder (designs show a "chime"), and is in-app a channel?
12. **Session summaries (FR-016).** Where do summaries come from (ElevenLabs transcript, the app's own summariser)? Is a transcript stored, and for how long? NFR-18 says to avoid unnecessary conversation content.
13. **Page-navigation tool (FR-011).** What is the allowlist schema: page bounds only, or also chapter/resource switching? Can the student's manual navigation be fed back to the agent?
14. **Super Admin "Support only" scheduling.** Can Super Admin create or cancel bookings on a user's behalf? Is this audited?
15. **Resource visibility.** Can a teacher see parent-uploaded files for their assigned student? Can parent-uploaded textbooks be shared across siblings automatically?
16. **Timezones.** Is a teacher's timezone separate from the family's? Are slots shown in the viewer's timezone (FR-019 implies yes)?
17. **Copyright.** Who attests rights for uploaded school or commercial textbooks? This matters especially if text is sent to ElevenLabs as lesson context.

---

## 9. Risks and assumptions

**Risks (beyond FRD §16)**

| Risk | Impact | Mitigation |
|---|---|---|
| Real children's names, a real school and a school email domain in design fixtures | Critical (privacy) | Replace with synthetic data before any code or commit; confirm whether the two demo first names are real children |
| Design-encoded behaviours that break permissions (C-01…C-03, C-11) ported verbatim | Critical | Traceability matrix; screen-level role audit at G1 |
| Unverified compliance or security claims shipped in UI (C-21) | High (legal/trust) | Strip all certification and encryption badges unless verified |
| Tailwind Play CDN and hot-linked images copied into production | High | Compile Tailwind at build time; replace imagery with owned assets |
| 9–11 px text and dense headers | Medium/High (WCAG 2.2 AA, NFR-09) | Enforce a minimum 12 px label / 14–16 px body in tokens; lint |
| AI availability model ambiguity | High (core flow) | Decide D-04 before Phase 3 |
| Zoom Basic suitability (40 min, host concurrency, API on free tier) | High | Spike early, as the FRD recommends |
| Copyrighted textbooks sent to a third-party AI | Medium/High | Rights attestation on upload; legal review |
| Brand drift (Lumina strings left in the UI) | Medium | Central brand config; OC-01 applied; CI check for banned brand strings; logo per D-02 |

**Assumptions [I]**
- S1/S9/S11/S19/S20/S21, which carry AA Pro text, reflect the owner's latest direction.
- The Stitch HTML will be re-implemented as components rather than embedded.
- The FRD supersedes the project instruction file wherever they differ, per this brief.

---

## 10. Recommended implementation order (aligned to FRD §17 and §15 gates)

1. **G1 Design (next milestone, documentation only):** owner decisions; canonical set approved; rebrand plan; synthetic-data plan; requirements traceability matrix (FR/UC/OD → screen → component → test); design briefs for the missing screens, including Super Admin.
2. **Phase 1 — Design system and shell:** tokens from DESIGN.md front-matter; compiled Tailwind; component library; four role shells (no mode switcher); all canonical screens with mock data and every state (loading, empty, error, locked).
3. **Phase 2 — Auth and RBAC (G2):** the four roles, parent–child and teacher–student links, child credentials, server authorisation, row-level security, and negative cross-child tests.
4. **Phase 3 — Availability and booking (G3):** state models, transactional booking with idempotency keys, 40-minute enforcement, cancel/reschedule.
5. **Phase 4 — Uploads and library:** private storage, validation and scanning; source distinction.
6. **Phase 5 — AI classroom (G4):** ElevenLabs secure session, PDF.js viewer, validated page-navigation tool, every error state.
7. **Phase 6 — Zoom (G6):** spike first on host and concurrency, then real meeting creation, external join and failure paths.
8. **Phase 7 — Notifications (G5):** durable jobs, T−15, stale suppression, email; WhatsApp after readiness.
9. **Phase 8 — Super Admin, audit, ops and live readiness (G7, G8).** Google Classroom stays deferred unless approved.

---

## 11. How to preserve the approved designs during conversion

1. **Tokens first.** Port the DESIGN.md front-matter verbatim into a single token source: Tailwind theme plus CSS variables, with names kept (`primary`, `surface-container-high`, …) so the Stitch class names map 1:1. Add the missing tokens (elevation levels, minimum touch size, focus ring) from the prose.
2. **Freeze the reference.** Keep the original ZIPs read-only under `design-reference/stitch-export/` with checksums, and record the canonical selection in a `design-inventory.md`.
3. **Componentise, don't copy.** Extract the components listed in 5.3 into typed React components with variants and states. Never paste whole Stitch pages. Strip all inline `<script>`, `alert()` and hard-coded data.
4. **Separate data from layout.** All names, schools, Zoom IDs, times and statuses come from typed mock fixtures (synthetic), later from the API.
5. **Visual regression.** Capture baseline screenshots of the canonical Stitch screens at 375 / 768 / 1280 px. Compare the implemented screens with Playwright visual diffs, and document intentional deviations (rebrand, removed conflicts, accessibility fixes) in a deviation log.
6. **Accessibility guard-rails.** Token-level minimum font sizes, a 48 px minimum target, contrast-checked pairs only, and axe checks in CI.
7. **Brand isolation.** One `brand` config (name, logo, AI persona name, footer, metadata). No literal "AA Pro" or "Lumina" in components.
8. **Self-host assets.** Self-host fonts (or use next/font) and Material Symbols (subset). Replace hot-linked images with owned illustrations.

---

## 12. Decisions needed from the owner

| ID | Decision | Options / my recommendation |
|---|---|---|
| D-01 | ~~AI tutor persona name~~ **CLOSED: owner-confirmed OC-01** | AA Pro is the umbrella brand; the AI tutor is an integrated AA Pro capability. "Lumina Learn", "Tutor Lumina" and "Lumi" are not retained in any form. Interim labels: "AA Pro AI Tutor" / "AI Tutor". Only the optional final display name remains open (G1-05 D-01a, non-blocking). |
| D-02 | Logo | Adapt L1 (two A's) to AA Pro, commission a new one, or use a wordmark for now. Note that the L1 PNG does not match its SVG. |
| D-03 | Demo data | Confirm the two demo first names are not to be used, and approve synthetic names. Remove [school name redacted] and other real-school references. |
| D-04 | AI availability model | FRD block-list (24/7 minus blocks) **or** design allow-list (parent-published windows) **or** both (parent chooses). |
| D-05 | Parent restriction rule set | Choose from: daily/weekly caps, quiet hours, max AI length, lead time, PIN override |
| D-06 | AI session lengths | e.g. 15/30/45 min |
| D-07 | Cancel/reschedule policy | Cut-off windows per session type and actor; whether teachers can cancel |
| D-08 | Teacher-initiated meetings | Allowed in v1? Parent confirmation required? |
| D-09 | Who links teachers to students and who approves teachers | Super Admin / parent booking / teacher request |
| D-10 | Zoom host model | Platform account vs teacher-owned accounts; behaviour for external invites |
| D-11 | Super Admin UI scope for v1 | Accounts + approvals only, or also the audit log viewer and integration health |
| D-12 | Gamification (XP, streaks, badges, mastery %) | Keep (needs a data model), defer, or drop |
| D-13 | Student sibling switcher / family hub view | Drop, or move it to the parent "view as child" mode |
| D-14 | Classroom extras (Raise Hand, Lesson Notes, annotate, type-7 exit lock) | Keep or defer each |
| D-15 | Group/cohort human sessions | Out of v1, or define capacity rules |
| D-16 | Teacher resource sharing | Instant to student, or parent-gated |
| D-17 | Resource approval / "locked" state in library | Keep (define the workflow) or drop |
| D-18 | Out-of-scope features shown in designs (Google Classroom, payments/credits, SMS, calendar sync, OCR/AI study cards, ratings, recording) | Confirm all are hidden for v1 |
| D-19 | Project instructions vs FRD (P-01…P-05) | Confirm the FRD wins; update the project instructions accordingly |
| D-20 | Canonical picks needing review | S1 vs S2/S6 student dashboard; S11 vs S13 booking flow |
| D-21 | Missing screens | Approve that I write design briefs (not invented designs) for the missing screens, for you to generate in Stitch or approve as wireframes |
| D-22 | Child reminder channel | Is in-app (dashboard chime/banner) a notification channel for students? |

**Gate:** I will not begin implementation until you approve this audit and the next stage (G1 documentation milestone).
