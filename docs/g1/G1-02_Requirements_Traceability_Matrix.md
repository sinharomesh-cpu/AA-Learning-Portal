# AA Pro — G1-02 Requirements Traceability Matrix (RTM)

**Version:** G1 v1.0 · 14 Oct 2026 · **Baseline:** FRD v1.1
**Status of every row: PLANNED.** Nothing in this matrix is implemented or tested yet. Screen IDs are defined in G1-01; component IDs (CMP-) and test IDs (T-) are defined in the appendices below. "Design change" refers to entries in G1-04 (DC-).

**Test levels:** U = unit · I = integration (API + DB) · E = end-to-end (browser) · V = visual regression · A = automated accessibility (axe) plus a manual check · P = provider spike / manual verification against a real provider sandbox.

---

## 1. Functional requirements

| Req | Requirement (FRD wording, condensed) | Canonical screen(s) | Missing screen / design change | Components | Planned tests |
|---|---|---|---|---|---|
| FR-001.1 | Secure sign-in/out, recovery, expiry, secure cookies, rate limits, deactivation | — | M-01, M-03, M-04, M-34 | CMP-AuthForm, CMP-StatusPage | T-AUTH-01 sign-in/out (E); T-AUTH-02 rate-limit (I); T-AUTH-03 expiry and cookie flags (I); T-AUTH-04 deactivated account rejected (I) |
| FR-001.2 | Parent creates child credentials; child login linked to parent | — | M-02, M-08 (D-23) | CMP-AuthForm (child variant), CMP-ChildForm | T-AUTH-05 parent creates child login (E); T-AUTH-06 child lockout and parent reset (I) |
| FR-002.1 | Roles: Student, Parent, Teacher, Super Admin | S1/S9, S19, S21 shells | DC-01 remove mode switcher; M-35 admin shell | CMP-ShellStudent, CMP-ShellAdult | T-RBAC-01 each role sees only its own shell and routes (E); T-RBAC-02 role claim from the server only (I) |
| FR-002.2 | Reject cross-child/cross-teacher access; audit relationship changes | All data screens | M-05 | CMP-StatusPage | T-RBAC-03 cross-child read/write denied on every API (I, generated per route); T-RBAC-04 teacher denied unassigned student (I); T-AUD-01 relationship change audited (I) |
| FR-003.1 | Parent maintains grade, curriculum, timezone, subjects | S19 (child cards) | M-07, M-08 | CMP-ChildCard, CMP-ChildForm, CMP-TimezoneSelect | T-CHILD-01 CRUD by own parent (I); T-CHILD-02 other parent denied (I); T-CHILD-03 form validation (U) |
| FR-003.2 | Initial subjects Maths, Science, SST, English, Hindi, IT; configurable | S13, S1 subject cards | DC-12 drop non-catalogue subjects | CMP-SubjectCard, CMP-SubjectPicker | T-SUBJ-01 catalogue seeded and configurable (I) |
| FR-004.1 | Approved onboarding required for teacher calendar/resource access | S21 | M-20, M-21, M-29 (D-09) | CMP-TeacherForm, CMP-StatusPage, CMP-DataTable | T-TCH-01 unapproved teacher blocked from calendar and resources (I); T-TCH-02 approval transitions (U) |
| FR-004.2 | External invitation does not create a portal account | — | M-11, M-32 | CMP-InviteForm | T-EXT-01 invite creates no user row (I) |
| FR-005.1 | AI available 24/7 except blocked periods, bookings, parent restrictions | S11, S12, S13, S14 | M-09; DC-05 (OC-05) | CMP-SlotPicker, CMP-RestrictionForm | T-AVL-01 slot engine excludes blocks, bookings and restrictions (U, property-based); T-AVL-02 DST boundary (U) |
| FR-005.2 | Teacher slots: time, timezone, recurrence, capacity, eligibility | S21 availability grid | M-23 | CMP-AvailabilityGrid | T-AVL-03 recurrence expansion (U); T-AVL-04 teacher edits own slots only (I) |
| FR-005.3 | No double booking; availability changes cannot silently remove confirmed bookings | S21, S20 | M-23 warning state | CMP-AvailabilityGrid, CMP-ConfirmDialog | T-AVL-05 removing a slot with a booking is blocked or flagged (I); T-BKG-05 DB exclusion constraint (I) |
| FR-006.1 | Student selects subject, optional chapter, date, permitted slot | S13 (D-20b), S14, S11 | — | CMP-Stepper, CMP-SubjectPicker, CMP-ChapterSelect, CMP-WeekStrip, CMP-SlotPicker, CMP-BookingSummary | T-BKG-01 student books AI (E) |
| FR-006.2 | Backend rechecks role, blocks, conflicts; idempotency key | — | M-17 | CMP-ResultState | T-BKG-02 recheck at confirm (I); T-BKG-03 idempotent replay returns same booking (I); T-BKG-04 50 parallel requests yield one booking (I, concurrency) |
| FR-007.1 | Parent selects linked child, subject, optional chapter, slot | S19 (card), S13 (reused with child picker) | DC-13 | CMP-ChildPicker + FR-006 components | T-BKG-06 parent books AI for own child only (I, E) |
| FR-007.2 | Parent views/cancels/reschedules under configured AI rules | S19 calendar | M-10 (OC-46: AI lessons any time before the start) | CMP-SessionCard, CMP-ConfirmDialog | T-BKG-07 cancel and reschedule rules (I) |
| OC-44 (D-35) | Join opens 10 min before the start, until the scheduled end | S1, S9, P21 | — | CMP-JoinButton, `lessonRules.joinState` | `lessonRules.test.ts` (U); `components.test.tsx` JoinButton (U); `roles.spec`, `shells.spec`, `parent-teacher.spec` (E) |
| OC-45 (D-08) | A teacher proposal needs the parent to accept or reject; nothing is scheduled and no Zoom meeting until accepted | P19, P21, M-10 | — | `answerProposal`, `holdsTime`, `mayCreateMeeting` | `lessonRules.test.ts` (U); `views.test.ts` proposal holds no time (U); Phase 3 server tests |
| OC-46 (D-07) | Cancel or reschedule: teacher lessons up to 30 min before (teacher reschedule needs parent approval; teacher cancel notifies the parent); AI lessons any time before the start | P19, M-10, P21 | — | `lessonChange` | `lessonRules.test.ts` (U); Phase 3 server and notification tests |
| OC-47 (D-15) | 1:1 lessons only in v1 | All lesson screens | — | `MAX_STUDENTS_PER_LESSON` | `lessonRules.test.ts` (U); data model stays 1:1 |
| FR-008.1 | Parent books approved teacher or initiates external invite | S20 | M-11 | CMP-Stepper, CMP-TeacherCard, CMP-SlotPicker | T-HUM-01 parent books human (E) |
| FR-008.2 | Students cannot book/cancel/reschedule human meetings | S1, S9, S11, S12 | DC-02, DC-03 | — | T-RBAC-05 student human-booking APIs return 403 (I); T-UI-01 no such controls in student UI (E) |
| FR-008.3 | Provider failure must not leave booking falsely confirmed | S20 | M-19 | CMP-StatusChip, CMP-ResultState | T-HUM-02 Zoom failure → FAILED state, no confirmation sent (I, mocked provider) |
| FR-009.1 | Zoom Basic; 40-minute maximum | S20, S21 | DC-04 | CMP-SlotPicker (duration ≤ 40) | T-HUM-03 > 40 min rejected server-side (I) |
| FR-009.2 | Join opens Zoom externally; embedding deferred | S1, S9, S21 | DC-06 | CMP-JoinButton | T-HUM-04 join opens external URL only when authorised (E) |
| FR-009.3 | Real provider meeting ID/URL only; verify API/host/concurrency | — | Spike (D-10) | — | T-ZOOM-01 provider spike (P); T-HUM-05 no URL without provider response (I) |
| FR-010.1 | Secure ElevenLabs session; connection/mic/speaking states; End Class | S15, S16 | DC-07 rename "AI Tutor"; M-18 | CMP-TutorPanel, CMP-ConnectionStatus, CMP-VoiceControls, CMP-EndClassDialog | T-AI-01 session token minted server-side, no key in client bundle (I + bundle scan); T-AI-02 lifecycle states (U); T-AI-03 real voice session (P) |
| FR-010.2 | Mic denial, network loss, timeout, reconnect, provider errors | S15, S16 | M-18 | CMP-PermissionPrompt, CMP-ErrorState | T-AI-04 mic denied → text fallback (E, mocked); T-AI-05 network drop and reconnect (E); T-AI-06 provider error (I) |
| FR-010.3 (OC-89(4)) | One 15-minute AI session (10 + 5), one start per child in any rolling 24 hours; one active session; no duplicates; interrupted/abandoned rule; allowance shown | S13, S15, student home, parent Children | DV-86 | ai_sessions, aiSessions.ts, AiSessionController | T-AI-07 `tests/db/aiSessions.test.ts` (I); T-AI-08 controller phases (U); T-AI-09 booking one-a-day (U + E) |
| FR-010.4 (OC-89(2)) | No "Next Question"; student-initiated "Give Me a Hint" (Q&A, at most 5); no tutor-started quizzes or question sequences | S15, S16 | DV-87 | CMP-VoiceControls | T-AI-10 hint and policy suite in `controller.test.ts` (U) |
| FR-010.5 (OC-89(1), (3), (5)) | Provider eligibility for children confirmed in writing before production (release-blocking R-AI-1); minimum data to the provider; test cost controls | — | — | Provider adapter (server only) | T-AI-11 legal checklist L-1 to L-10 (manual gate); T-AI-12 no identifiers in provider context (U, at adapter build) |
| FR-021 (CR-07; OC-51, OC-86, OC-87, OC-90) | Teacher-shared resources for linked students in the ticked subjects; no per-file parent approval; parents see them; download by any authorised user; any phone format, including HEIC | H1, H2, H5, H8 | Boards H1–H9 (designs first) | stored_files, teacher_resources, resource_shares, file route | T-R1–R5, T-F1–F6, E-1, E-2 |
| FR-022 (CR-07; OC-90 Q-2) | Digital exercises: 5 auto-marked types plus a teacher-marked short written answer; teacher controls release | H3, H6, H7 | H3, H6, H7 | assignments, questions, answers | T-A1–A4, T-M1–M7, E-3, E-4 |
| FR-023 (CR-07; OC-90 Q-4, Q-7) | Handwritten homework uploaded by the parent from any device; typed feedback only | H4, H8, H9 | H4, H9 | submission_pages | T-H1–H4, T-F6, E-5 |
| FR-024 (CR-07; OC-90 Q-10) | Lifecycle (Assigned … Reviewed, Overdue); late allowed and marked Late, auditable | H4–H8 | — | assignment_targets, assignment_events | T-S1–S5, T-C1–C2 |
| FR-027 (CR-07; OC-87, OC-90 Q-6, Q-8) | Unlinking, 12-month retention with a documented expiry, no admin access | — | — | purge job, file route | T-L1–L3, T-RET1–3, T-X (admin denied) |
| FR-038 (CR-12; OC-97) | The teacher accepts or declines each child's request (selected subjects); 14-day expiry; 7-day wait after a decline; existing links unchanged; minimum details before acceptance; no access through declined, expired or withdrawn requests | TR1–TR5 | Boards TR1–TR5 (awaiting review) | teacher_requests, `teacherMaySee` (active links only), accept/decline/withdraw actions, expiry check | T-REQ-1 to T-REQ-11, E-REQ-1, E-REQ-2 (planned) |
| FR-039 (CR-12; OC-97) | Optional trial lesson: one per teacher–child pair, 20–30 min, guardian present, no AA Pro payments, teacher-provided link after parent approval, no materials during the trial, "Link this teacher" never automatic | TR6, TR7 | Boards TR6, TR7 (awaiting review); **Phase 3** | Trial requests, meeting-link checks | T-TRIAL-1 to T-TRIAL-7 (planned, Phase 3) |
| FR-040 (CR-13; OC-98) | Teacher rate negotiation: per-price opt-in by the teacher; parent proposal; accept, decline or counter; 14-day expiry; withdrawal; one active negotiation per parent, teacher, child and basis; full offer record; published and agreed rates distinct; no access, booking or payment | RN1–RN7 | Boards RN0–RN7 (awaiting review) | rate_negotiations, rate_offers, listing price switches, connect gate (D11) | T-RN-1 to T-RN-11, E-RN-1 to E-RN-3 (planned) |
| FR-011.1 | Authorised PDF alongside AI; stacked on mobile | S15, S16 | DC-08 real PDF render | CMP-PdfViewer | T-PDF-01 renders authorised file only (I); T-V-01 responsive layout (V) |
| FR-011.2 | Agent page changes via validated structured tool with allowlist | S15 | — | CMP-PdfViewer (navigate API) | T-PDF-02 out-of-bounds or other-resource page request rejected (U); T-PDF-03 valid request navigates (E) |
| FR-012.1 | Formats/size limits; type/signature validation; scanning | S19 upload modal | M-14 | CMP-Uploader | T-UPL-01 rejects wrong type, spoofed extension, oversize (I); T-UPL-02 scan hook (I) |
| FR-012.2 | Private storage; assign by child/subject/chapter; corrupt/duplicate handling | S19 repository | M-14 | CMP-Uploader, CMP-AssignForm | T-UPL-03 private object access via signed URL only (I); T-UPL-04 duplicate and corrupt file (I) |
| FR-013 | Google Classroom: not in initial release | — | DC-09 remove GC UI (OC-03) | — | T-SCOPE-01 no GC routes or scopes present (I) |
| FR-014.1 | Browse authorised resources by subject/chapter/type/source | S17, S18 | — | CMP-ResourceCard, CMP-FilterBar, CMP-ResourcePreview | T-LIB-01 child sees only assigned resources (I); T-LIB-02 filters (E) |
| FR-014.2 | Distinguish parent uploads, teacher resources, future external | S17 | DC-10 source badges | CMP-SourceBadge | T-LIB-03 source label correct (U) |
| FR-015.1 | Parent-configurable email/WhatsApp; email initial fallback | S19 summary | M-12 | CMP-PrefsForm | T-NOT-01 preferences respected (I) |
| FR-015.2 | Default T−15 reminder subject to provider, recipient, consent | — | M-33 | — | T-NOT-02 reminder enqueued at start − 15 min in UTC (U/I) |
| FR-015.3 | Durable jobs, retries, idempotency, stale-job suppression | — | M-13 | CMP-StatusChip | T-NOT-03 no duplicate on retry (I); T-NOT-04 cancelled/rescheduled booking suppresses old job (I); T-NOT-05 SENT ≠ DELIVERED (U) |
| FR-016.1 | Separate booking from actual AI session outcome | S15 | M-15, M-16 | CMP-HistoryList | T-HIST-01 booking and session states independent (U) |
| FR-016.2 | Store summaries/progress; raw audio disabled by default | — | M-15, M-16 (D-24) | CMP-SummaryCard | T-HIST-02 no audio persisted (I); T-HIST-03 summary visible to child and own parent only (I) |
| FR-017.1 | Super Admin add/edit/deactivate Parent and Teacher | — | M-27, M-28, M-35 | CMP-DataTable, CMP-AccountForm | T-ADM-01 CRUD and deactivate (E); T-ADM-02 non-admin denied (I) |
| FR-017.2 | Audit sensitive changes; no secret exposure | — | M-30 | CMP-AuditLogTable | T-AUD-02 admin actions audited (I); T-SEC-01 secret scan of responses and logs (I) |
| FR-018 | Log booking, upload, security, integration, admin events; correlation IDs; alerts | — | M-30 | — | T-AUD-03 event coverage per category (I); T-OPS-01 correlation ID propagated (I) |
| FR-019 | UTC instants + IANA timezone; DST | All time displays | DC-11 | CMP-TimeDisplay, CMP-TimezoneSelect | T-TZ-01 conversions incl. DST zones (U); T-TZ-02 two viewers in different zones see correct local time (E) |
| FR-020.1 | External invite sends email only, no portal access | — | M-11, M-32 (D-25) | CMP-InviteForm | T-EXT-01, T-EXT-02 email content excludes child PII (U) |
| FR-020.2 | Join redirects to actual Zoom URL, only to authorised participants | S1, S9, S19, S21 | DC-06 | CMP-JoinButton | T-HUM-06 unauthorised user cannot obtain join URL (I) |

## 2. Use cases and use-case rules

| UC | Actor | Canonical screen(s) | Missing / change | Covered by FR rows | Planned E2E test |
|---|---|---|---|---|---|
| UC-01 Sign in | All | — | M-01, M-02, M-26 | FR-001 | T-E2E-UC01 (per role) |
| UC-02 Manage child profile | Parent | S19 | M-07, M-08 | FR-003 | T-E2E-UC02 |
| UC-03 Schedule AI class | Student/Parent | S13, S14, S11, S19 | M-17 | FR-005, FR-006, FR-007 | T-E2E-UC03a (student), UC03b (parent) |
| UC-04 Join AI class | Student | S15, S16 | M-18 | FR-010, FR-011 | T-E2E-UC04 (mocked agent); T-AI-03 (P) |
| UC-05 Upload content | Parent | S19 | M-14 | FR-012 | T-E2E-UC05 |
| UC-06 Book human meeting | Parent | S20 | M-19 | FR-008, FR-009 | T-E2E-UC06 (mocked Zoom) |
| UC-07 Manage calendar | Teacher | S21 | M-23, M-24 | FR-005.2, FR-008 | T-E2E-UC07 |
| UC-08 Invite external teacher | Parent | — | M-11, M-32 | FR-004.2, FR-020 | T-E2E-UC08 |
| UC-09 Receive reminders | Recipients | — | M-12, M-13, M-33 | FR-015 | T-E2E-UC09 (fake clock) |
| UC-10 Manage accounts | Super Admin | — | M-26…M-30, M-35 | FR-017, FR-018 | T-E2E-UC10 |
| Rule 3.2-a Student schedules AI only | Student | S1, S9, S11–S14 | DC-02, DC-03 | FR-008.2 | T-RBAC-05, T-UI-01 |
| Rule 3.2-b Parent sees only linked children | Parent | S19 | — | FR-002.2 | T-RBAC-03 |
| Rule 3.2-c External invite creates no account | External | — | M-11 | FR-004.2 | T-EXT-01 |
| Rule 3.2-d Teacher sees own calendar and assigned students | Teacher | S21 | M-25 | FR-002.2 | T-RBAC-04 |
| Rule 3.2-e Super Admin actions audited | Super Admin | — | M-30 | FR-017.2 | T-AUD-02 |

## 3. Owner decisions in the FRD (OD) and technical verifications (TV)

| ID | Item | Where honoured | Planned test / verification |
|---|---|---|---|
| OD-01 | Child individual login; no human-meeting management or upload | M-02; DC-02, DC-03, R-02 | T-RBAC-05, T-UPL-05 student upload API 403 (I) |
| OD-02 | Approved teacher onboarding; external invite email only | M-20, M-21, M-29, M-11 | T-TCH-01, T-EXT-01 |
| OD-03 | AI 24/7 except blocks/conflicts/restrictions | OC-05; M-09 | T-AVL-01 |
| OD-04 | Students cannot cancel/reschedule human meetings | DC-02 | T-RBAC-05 |
| OD-05 | Zoom Basic, 40 min, external launch | DC-04, DC-06 | T-HUM-03, T-ZOOM-01 |
| OD-06 | Google Classroom not in initial scope | DC-09 | T-SCOPE-01 |
| OD-07 | Parent-configurable email/WhatsApp; email fallback | M-12 | T-NOT-01 |
| OD-08 | Summaries and progress stored; raw audio off | M-15, M-16 | T-HIST-02 |
| OD-09 | Payments out of scope | DC-14 | T-SCOPE-02 no payment/credit UI strings (V/U lint) |
| OD-10 | Super Admin manages accounts, audited | M-27…M-30 | T-ADM-01, T-AUD-02 |
| OD-11 | UTC + user IANA timezone | DC-11 | T-TZ-01/02 |
| OD-12 | External Zoom launch; embed deferred | DC-06 | T-HUM-04 |
| TV-01/02 | Zoom host permissions and concurrency | Spike before Phase 6 (D-10) | T-ZOOM-01 (P) |
| TV-03 | Email configured; WhatsApp after consent/provider readiness | Phase 5 | T-NOT-06 provider sandbox (P) |
| TV-04 | Safe child credential recovery, lockout, deactivation | M-02, M-08 (D-23) | T-AUTH-06 |

## 4. Non-functional requirements (verification method)

| NFR | Verification planned |
|---|---|
| NFR-01 Availability 99.5% | Hosting SLA review plus uptime monitor (pre-production) |
| NFR-02 p95 < 2 s reads | Load test T-PERF-01 at agreed load |
| NFR-03 Responsive UX | Visual regression at 375/768/1280 px (T-V-xx); no horizontal overflow check |
| NFR-04 Voice first response | Benchmark T-AI-07 (P); threshold set after measurement |
| NFR-05 Booking integrity | T-BKG-04, T-BKG-05 |
| NFR-06 Reminder integrity | T-NOT-04 |
| NFR-07 Security | Dependency scan, secret scan, authz tests (T-RBAC-*), rate limits |
| NFR-08 Privacy | Data inventory, retention config (D-24, D-28), deletion test T-PRIV-01 |
| NFR-09 WCAG 2.2 AA | axe on every page (T-A-xx) plus manual keyboard and screen-reader pass on key flows |
| NFR-10 Reliability | Retry and backoff tests with fault injection (T-NOT-03, T-HUM-02) |
| NFR-11 Observability | T-OPS-01; log redaction test T-OPS-02 |
| NFR-12 Maintainability | Typed provider adapters; CI lint and type-check |
| NFR-13 Scalability | Load test before expansion |
| NFR-14 Recovery | Backup and restore drill (pre-production) |
| NFR-15 Compatibility | Browser matrix (to be defined) via Playwright projects |
| NFR-16 Data residency | D-28 |
| NFR-17 File safety | T-UPL-01…04 |
| NFR-18 Auditability | T-AUD-02, T-OPS-02 (no secrets or unnecessary conversation content) |

---

## Appendix A — Component catalogue (proposed)

Components are derived from canonical Stitch screens unless marked "new". "New" components follow DESIGN.md tokens but have **no approved visual design** yet.

| ID | Component | Source | Notes |
|---|---|---|---|
| CMP-Brand | Product mark and wordmark from central brand config | L1 / D-02 | One config: product name "AA Pro", tutor label "AA Pro AI Tutor" / "AI Tutor" |
| CMP-ShellStudent | Student top nav (desktop) and bottom nav with AI FAB (mobile) | S1, S9 | No role switcher |
| CMP-ShellAdult | Sidebar shell; role-specific menu config for Parent, Teacher, Super Admin | S19, S21 | One component, three menu sets |
| CMP-AuthForm | Sign-in, recovery, child sign-in variant | New | M-01…M-03 |
| CMP-StatusPage | Full-page status (expired, locked, 403, 404, pending approval) | New | M-04, M-05, M-21 |
| CMP-ChildCard / CMP-ChildPicker / CMP-ChildForm | Child summary, picker, profile form | S19, S20 (picker) / New (form) | |
| CMP-SubjectCard / CMP-SubjectPicker / CMP-ChapterSelect | Subject tiles, chapter dropdown | S1, S13, S11 | |
| CMP-SessionCard / CMP-SessionBanner | Session row/card with AI vs Human badge and status; live banner | S1, S11, S12, S19 | Must always show the session type |
| CMP-WeekStrip / CMP-SlotPicker | Date strip; slot states available / selected / unavailable / booked | S13, S20 | |
| CMP-Stepper / CMP-BookingSummary / CMP-ResultState | Wizard steps, summary panel, outcome states | S20, S13 / New (outcome) | |
| CMP-ConfirmDialog / CMP-Toast | Confirmation modal, toast | S13, S19 | |
| CMP-StatusChip | Booking, notification and integration state chips (FRD §6) | New (styled from S19 chips) | |
| CMP-TeacherCard | Teacher selection card | S20 | Ratings removed |
| CMP-AvailabilityGrid | Weekly availability and slot publisher | S21 | |
| CMP-RestrictionForm | Parent blocked periods and limits | New | Content per D-05 |
| CMP-ResourceCard / CMP-SourceBadge / CMP-FilterBar / CMP-ResourcePreview | Library items and preview drawer | S17 | |
| CMP-Uploader / CMP-AssignForm | Upload with validation states, assignment | S19, S21 | |
| CMP-PdfViewer | PDF.js-based viewer with page/zoom toolbar and a validated navigate API | S15 toolbar | |
| CMP-TutorPanel / CMP-VoiceControls / CMP-ConnectionStatus / CMP-EndClassDialog / CMP-PermissionPrompt | AI tutor UI | S15, S16 / New (permission, errors) | |
| CMP-JoinButton | Server-authorised external Zoom join | S1, S21 | |
| CMP-PrefsForm | Notification preferences and consent | New (S19 summary as reference) | |
| CMP-HistoryList / CMP-SummaryCard | Session history and summaries | New | |
| CMP-DataTable / CMP-AccountForm / CMP-AuditLogTable | Super Admin tables and forms | New | |
| CMP-TimeDisplay / CMP-TimezoneSelect | Timezone-aware time rendering | New | |
| CMP-EmptyState / CMP-ErrorState / CMP-Skeleton | Generic states | S17, S18 | |
| CMP-InviteForm | External teacher invite | New | |

## Appendix B — Test ID families

T-AUTH (authentication) · T-RBAC (authorisation and isolation) · T-CHILD · T-SUBJ · T-TCH · T-EXT · T-AVL (availability) · T-BKG (AI booking) · T-HUM (human booking) · T-ZOOM · T-AI · T-PDF · T-UPL · T-LIB · T-NOT (notifications) · T-HIST · T-ADM · T-AUD · T-TZ · T-SCOPE · T-PRIV · T-OPS · T-PERF · T-V (visual) · T-A (accessibility) · T-UI (UI absence checks) · T-E2E-UCxx.

None of these tests exist yet.
