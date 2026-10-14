# AA Pro — G1-04 Proposed Design Changes, Branding and Accessibility Log

**Version:** G1 v1.3 · 14 Oct 2026 · **Status:** PROPOSED (DC-24 and DC-25 confirmed by you). Nothing here has been applied.
The original Stitch exports remain **read-only references** and have not been modified. Every change below will be applied in the AA Pro implementation, not in the Stitch files. Each change will be recorded in a deviation log during Phase 1 and checked against Stitch baseline screenshots.

**Basis codes:** FRD = FRD v1.1 requirement · OC = owner-confirmed decision (G1-05) · R = resolved in favour of the FRD · D = pending decision · A11Y = accessibility · ENG = engineering hygiene.

---

## 1. Branding changes (OC-01)

**Rule.** "AA Pro" is the only product brand, across the website and the Student, Parent, Teacher and Super Admin portals. The AI tutor is an AA Pro capability, labelled "AA Pro AI Tutor" (full form: headings, first mention, emails) or "AI Tutor" (short form: inside panels, chips, buttons). No "Lumina", "Lumina Learn", "AA Lumina", "Tutor Lumina" or "Lumi" will appear in product UI, metadata, emails or documentation, except when quoting Stitch folder names as file references.

Both labels come from **one brand configuration**, so no brand strings live in components.

| BR | Location in Stitch (where the string appears) | Screens | AA Pro replacement |
|---|---|---|---|
| BR-01 | Browser `<title>` "Lumina Learn" / "Lumina Learn – Family Student Portal" | S2, S3, S4, S5, S6, S10, S13, S15, S17 | `AA Pro · <page name>` |
| BR-02 | Header logo text "Lumina / LEARN PORTAL", "AA Lumina", "Lumina / FAMILY PORTAL", "My Learning Space · Lumina Learn Academy", sidebar "Admin & Hub · Lumina Learn" | S1–S19, S9 | CMP-Brand: "AA Pro" text wordmark, Outfit 800, `#006194` (OC-11, confirmed) |
| BR-03 | Footer "Lumina Learn © 2025 … Lumina Learn Inc." | S1–S6, S10, S11, S13, S15, S17 | "© <year> AA Pro". The legal entity name is to be supplied by you; I will not invent one. |
| BR-04 | AI persona "Tutor Lumina", "Lumi Companion", "AI Lumina", "Ask Lumi to Explain", "Solve with Lumina", "Lumina AI Agent", "Lumina AI Pod" | S1–S7, S9–S11, S13, S15–S17, S19 | "AA Pro AI Tutor" / "AI Tutor"; buttons such as "Ask the AI Tutor", "Practise with the AI Tutor" |
| BR-05 | Product claims "Lumina ChildSafe™", "Lumina ChildSafe Guard 2.4", "Lumina Core Curriculum" | S1, S3–S6, S15 | Removed (see DC-18). Not renamed to AA Pro equivalents. |
| BR-06 | Passcode "#Lumina4G" | S21 | Removed (DC-06) |
| BR-07 | DESIGN.md front-matter `name: Lumina Learn` and prose | D1 | The derived AA Pro token documentation is titled "AA Pro Design Tokens". The Stitch file itself is unchanged. |
| BR-08 | Logo SVG comments ("Lumina Learning", child names) and folder name | L1 | Not used as an asset until D-02 is decided |

## 2. Functional design changes (resolving Stitch/FRD conflicts)

| DC | Change | Screens | Basis | Status |
|---|---|---|---|---|
| DC-01 | Remove the Student/Parent/Teacher mode switcher, the "Parent Mode" button and the shared parent+teacher sidebar. Each role gets its own shell and menu. | S1, S11, S13, S15, S17, S19–S21 | FRD FR-002, R-01 | Proposed |
| DC-02 | Remove every student-side human-meeting action: "Book 1-on-1", "Schedule Zoom Tutor", "Quick Class Booking (tutors)", "Browse Full Booking Catalog", "Reschedule Slot/Class" on human sessions. Student human sessions become view and join only. | S2, S6, S11, S12, S1 | FRD FR-008.2, OD-04, OC-06 | Proposed |
| DC-03 | Remove student upload and "Ingest School Book (OCR)" entry points | S6, S9 | OD-01, OC-03, OC-06 | Proposed |
| DC-04 | Human meeting duration capped at **40 minutes** in all copy and slot options. 45/60-minute human sessions removed. | S11, S19, S20, S21 | FR-009, OD-05, OC-06 | Proposed |
| DC-05 | AI availability: copy and slot logic change from "parent-published slots only" to "available times" computed as 24/7 minus blocked periods, existing bookings and parent restrictions. Unavailable slots show a reason ("Blocked by family schedule", "Already booked"). | S11–S14, S9 | OD-03, OC-05 | Proposed (rule details per D-05/D-06) |
| DC-06 | Static Zoom IDs, passcodes and links removed from dashboards. A "Join" button resolves the real provider URL server-side for authorised participants within the join window. Meetings open in Zoom externally. | S1, S6, S9, S19, S20, S21 | FR-009.2, FR-020, R-06 | Proposed |
| DC-07 | AI tutor renamed per BR-04. The tutor panel header reads "AI Tutor" with connection status. | S15, S16 and all cards | OC-01 | Proposed |
| DC-08 | The textbook pane renders the authorised PDF page (PDF.js). The invented HTML lesson content ("Did you know", facts, figures) is not reproduced. | S15, S16 | FR-011, project rule "do not invent textbook content" | Proposed |
| DC-09 | Remove Google Classroom UI: synced homework, "School Study Hub", "Classroom Sync" badges, sync bar, "Check Connection" | S1, S2, S6, S7, S9, S17, S18 | OD-06, OC-03 | Proposed |
| DC-10 | Library source badges limited to "Uploaded by parent" and "Shared by teacher" | S17, S18 | FR-014.2 | Proposed |
| DC-11 | Times shown in the viewer's IANA timezone with a zone label where ambiguity is possible. Hard-coded SGT/EST/GMT+8 removed. | All | FR-019 | Proposed |
| DC-12 | Subject catalogue limited to Maths, Science, SST, English, Hindi, IT in demo data. Spanish/French removed. | S11 | FR-003, R-05 | Proposed |
| DC-13 | Parent AI booking reuses the S13 wizard with a child picker as step 0 | S13, S19 | FR-007 | Proposed |
| DC-14 | Remove payment/credit text: "wallet", "Class Pass", "School Plan Credit", "Parent Budget" (unless D-05 adopts time-budget wording) | S11, S20 | OD-09, OC-03 | Proposed |
| DC-15 | Remove SMS references ("SMS & Portal", "Parent SMS Reminder Queued") | S13, S21 | FR-015, OC-03 | Proposed |
| DC-16 | Remove calendar sync and export (.ics, Google/Outlook sync) | S6, S19 | OC-03 | Proposed |
| DC-17 | Remove "Generates AI Study Cards" and offline download | S19, S17 | OC-03 | Proposed |
| DC-18 | Remove unsupported claims and badges: "COPPA / ChildSafe Guard Active", "ChildSafe™ 100% Gated", "Safe Search Active", "End-to-End Encrypted", "Zoom Verified", "[school name redacted] Verified", "Accredited Faculty", "Verified Admin", "Double-Booking Safeguard Active", "Real-time Slot Engine", "Safe Environment". They return only if a feature exists **and** is verified, with neutral wording. | S1, S6, S9, S19, S20, S21 | OC-04 | Proposed |
| DC-19 | Replace all demo data with the synthetic set in §4 | All | OC-04 | Proposed |
| DC-20 | Remove teacher ratings and review counts | S20 | R-04 | Proposed |
| DC-21 | Remove "Zoom Enterprise", "Institutional Secure Zoom Room" and "Recorded for Parent Review" | S20, S21 | OD-05, R-03 | Proposed |
| DC-22 | "Confirmed" shown only after the provider succeeds. Pending and failed states shown otherwise (M-19). | S20 | FR-008.3 | Proposed |
| DC-23 | Teacher dashboard: "Small Cohort" session hidden pending D-15. Teacher sharing behaviour per D-16. | S21 | D-15, D-16 | Pending decision |
| DC-24 | Gamification (XP, streaks, badges, quests, mastery %) removed from v1. Only FRD-supported history and progress are kept. | S1, S2, S7, S9, S11, S13 | OC-12 | **Confirmed** |
| DC-25 | Classroom: keep Hint, Repeat, Next Question and typed fallback. Defer Raise Hand, Lesson Notes and annotation. Replace the "type 7 to exit" lock with a normal confirm dialog. | S15, S16 | OC-13 | **Confirmed** |
| DC-26 | Library "locked / needs approval" state per D-17 | S17, S18 | D-17 | Pending decision |

## 3. Accessibility improvements (WCAG 2.2 AA target, NFR-09)

Contrast figures are values I computed in Phase 0 [Verified].

| AX | Issue observed in Stitch | Proposed correction | Expected benefit |
|---|---|---|---|
| AX-01 | DESIGN.md prose palette fails contrast (`#0284C7` on white 4.10:1; white on `#F59E0B` 2.15:1; white on `#10B981` 2.54:1) | Use the front-matter tokens only (primary `#006194` 6.69:1; tertiary `#006947` 6.75:1). Ban white text on amber or mint fills; use `on-secondary-container` `#684000` on `#fea619` (4.60:1). | Readable text for all users |
| AX-02 | `outline` `#707881` on white 4.48:1 | Use `outline` only for borders and icons. Use `on-surface-variant` `#3f4850` for secondary text. | Meets 4.5:1 for body text |
| AX-03 | 206 uses of 9–11 px text | Minimum 12 px for labels (label-sm) and 14–16 px for body. Remove arbitrary pixel sizes from components. | Legibility for emerging readers |
| AX-04 | Controls below 48 px; DESIGN.md's own 44 px audio button | Minimum 48 × 48 px targets; 56 px for primary child actions; 8 px minimum spacing between targets | Easier tapping for children (WCAG 2.5.8) |
| AX-05 | Dense student headers with 8–10 controls; nav labels wrapping ("Book / a / Class") | Five primary nav items maximum; overflow into a profile menu; no wrapping labels | Clearer navigation |
| AX-06 | Material Symbols ligature text (e.g. "calendar_today") may be read aloud | Decorative icons `aria-hidden`; icon-only buttons get an `aria-label` | Screen-reader clarity |
| AX-07 | Status shown by colour alone (green/amber/red chips) | Every status chip includes text and an icon | Colour-independent meaning (1.4.1) |
| AX-08 | No visible keyboard focus styling in the prototypes | Use DESIGN.md's 4 px focus ring (15% primary) on all interactive elements; logical tab order; dialogs trap focus and return it | Keyboard access (2.4.7, 2.4.11) |
| AX-09 | Classroom: voice-only interaction risk | Captions or transcript always visible; typed-input fallback; mic state announced via a live region | Students who cannot speak or hear |
| AX-10 | Countdown timers and auto-updating content | Live-region announcements are throttled. Session timers do not auto-end a class without warning. | Predictability (2.2.1) |
| AX-11 | Emoji used as meaning carriers in headings | Emoji are decorative only, with text equivalents | Screen-reader clarity |
| AX-12 | Child-facing copy uses adult terms ("Orchestration", "Ingestion", "Dispatch", "Governance") | Plain-language copy review for the Student portal; adult portals use clear, plain terms | Comprehension for ages 6–11 |
| AX-13 | Reduced-motion not addressed | Respect `prefers-reduced-motion` for the "tactile" press and celebration animations | Vestibular safety |
| AX-14 | No dark theme defined | Light theme only for v1, stated explicitly. Dark theme deferred. | Avoids untested colour pairs |
| AX-15 | Input and secondary-button borders `#BFC7D2` measured 1.71:1 on white (below the 3:1 non-text minimum) | Use the `outline` token `#707881` (4.48:1) for all control borders. **Applied on the design canvas, round 2.** | Visible field and button edges (WCAG 1.4.11) |
| AX-16 | No visible keyboard focus style on the design boards | 3 px `#006194` outline, 2 px offset, on every interactive element (6.69:1). **Applied on the design canvas, round 2.** | Keyboard users can see where they are (2.4.7) |
| AX-17 | Hex values shown in lowercase sans-serif could be misread (`#ba1a1a` read as "#balala") | Show all hex codes in uppercase monospace in designs and documentation | Prevents token transcription errors |

## 4. Synthetic demo-data set (replaces all Stitch demo data; OC-04)

All values are fictional and must not match real people, schools or accounts. Reserved domains (`example.com`, RFC 2606) and reserved phone ranges are used.

| Entity | Synthetic values |
|---|---|
| Parent | "Demo Parent", `parent@example.com` |
| Children | "Kiran" (Grade 5) and "Meera" (Grade 4). Fictional first names only, no surnames. No real photos; illustrated avatars only. |
| Teachers | "Teacher A. Rao" (Science, Grades 4–5), "Teacher B. Iyer" (Maths, Grades 3–5), "Teacher C. Das" (Social Studies) |
| Super Admin | "Demo Admin", `admin@example.com` |
| School | "Sample Primary School" (fictional). No [school name redacted], NCERT or Cambridge branding on cards. |
| Resources | Generic titles such as "Fractions practice sheet (sample)" and "Plants and cells notes (sample)". Sample PDFs are created for testing; no real textbooks. |
| Meeting data | No meeting IDs or links in demo data. Join shows "Available 10 minutes before start" (mocked). |
| Phone | None by default. WhatsApp examples use a fictional placeholder, never a real-format number. |
| Timezones | Parent `Asia/Kolkata`; one teacher `Asia/Singapore`, to exercise FR-019 |

## 5. Intentional design deviations from the selected Stitch screens (OC-14)

These apply when the selected screens are rebuilt in AA Pro. The Stitch originals are unchanged.

| DEV | Screen | Deviation | Reason |
|---|---|---|---|
| DEV-01 | S1 Student dashboard (desktop) | Remove the role switcher, sibling chips, Google Classroom "Synced Homework" card, compliance banners, Weekly Quests, XP, badge shelf, mastery percentages and the static Zoom ID. "Tutor Lumina" card becomes "AI Tutor". Human session hero shows Join only within the join window. | R-01, R-02, OC-03, OC-04, OC-12, OC-01, R-06 |
| DEV-02 | S9 Student dashboard (mobile) | Remove the "Ingest School Book (OCR)" tile, sibling chips, Google Classroom homework, badges and the Zoom ID/passcode. Proposed bottom nav: Home · Schedule · AI (centre) · Library · History, with the account moved to the header avatar (shown on the M-16 phone board). | OC-06, OC-03, OC-12, R-06, FR-016 |
| DEV-03 | S11 Student schedule | "Schedule AI class" opens the S13 wizard instead of the inline panel. Remove "Quick Class Booking" (tutors), the Reschedule button on human sessions, wallet/credit text and Spanish Club. Replace the "Parent Authority" rules card with a simple list of open times; the child does not see parent rule details. | OC-14, OC-06, OC-03, R-05, R-08 |
| DEV-04 | S13 AI booking wizard | Copy changes from "Parent-Published Slots" to "Open times" (FRD availability model). Remove XP rewards, "Parent Approved by…" text and SMS. Durations per D-06. Outcomes follow M-17. | OC-05, OC-12, OC-03, D-06 |
| DEV-05 | S15/S16 AI classroom | Rename the tutor; real PDF page instead of invented HTML lesson content; extras per OC-13; error states per M-18. | OC-01, FR-011, OC-13 |
| DEV-06 | S19–S21 Parent and Teacher | Separate sidebars per role; 40-minute human sessions; no ratings, recording, "Zoom Enterprise", SMS, AI Study Cards or .ics export | R-01, OC-06, R-03, R-04, OC-03 |

## 6. Missing-screen designs (OC-15)

Proposed designs for M-01…M-35 are on the design canvas "AA Pro — Missing Screens (G1 Review)". They apply the tokens, BR, DC and AX rules above, the synthetic data in §4 and the interim wordmark. Rules still undecided appear as amber "Pending D-xx" notes rather than guessed behaviour. They await your approval (D-32).

## 7. Engineering hygiene notes (for Phase 1; nothing changed yet)

| ENG | Item |
|---|---|
| ENG-01 | Tailwind is compiled at build time; the Play CDN is not used |
| ENG-02 | Fonts are self-hosted (Outfit, Plus Jakarta Sans); Material Symbols are subset and self-hosted |
| ENG-03 | Hot-linked `lh3.googleusercontent.com` images are replaced with owned illustrations or neutral placeholders |
| ENG-04 | Stitch inline scripts and `alert()` are not ported. Behaviour is re-implemented in typed components. |
| ENG-05 | Baseline screenshots of the selected Stitch screens are kept under `design-reference/` (read-only) for visual comparison. Intentional differences come from this log. |
