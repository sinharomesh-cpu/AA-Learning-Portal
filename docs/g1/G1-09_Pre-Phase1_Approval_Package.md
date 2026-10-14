# AA Pro — G1-09 Pre-Phase 1 Approval Package

**Version:** 1.0 · 14 Oct 2026 · **Companions:** G1-05 Decision Register v1.5 · G1-10 Phase 1 Implementation Plan v1.0
**Status: for owner approval.**
- Nothing has been committed, pushed or deployed, and no application code exists.
- `sinharomesh-cpu/AA-Learning-Portal` is still empty: no refs, re-verified 14 Oct 2026.

## 0. Gate status

| Gate | State | What clears it |
|---|---|---|
| **D-32** Design boards | **Pending: 0 of 52 boards approved.** Round 3 published (canvas version 58). | Your explicit per-board approvals (§1). Priority-1 boards for Phase 1: 2, 5, 6, 9, 10. |
| **A-01** Project instructions | **Ready for you to apply.** The project settings still hold v1 (re-read 14 Oct 2026). | You paste v2.1 (§2), then I verify the result. |
| **D-34** Bootstrap commit | **Package prepared and validated; awaiting your approval** (§3). Not committed. | Your approval of manifest `a5f7f089…3639`, plus A-05 before the push |
| **D-38 / D-39 / D-40 / D-41** | **Pending** (new, needed before Phase 1) | Your decisions (G1-05; G1-10 §4–6) |
| Phase 2+ rules | **Open, not decided by Claude:** D-05, D-07, D-08, D-09, D-10, D-11b, D-15, D-16, D-17, D-22, D-23a, D-24, D-25, D-26, D-28, D-35, D-36, D-37, D-01a | Your decisions before the phase listed in G1-05 |

---

## 1. D-32 — Per-board review index (canvas "AA Pro — Missing Screens (G1 Review)")

**No board has been approved.** Every board still carries its red "PROPOSED — NOT APPROVED" label. Approving the G1 documents does not approve any board.

**How to record approvals:**
- Reply with the board numbers or names you approve, for example "Approve boards 2, 5, 6, 9, 10".
- Or comment on a board in the canvas.

I record each approval in `docs/design/missing-screens.md` through a pull request, and change that board's label to "Approved [date]". I change nothing else.

**Round 3 (published 14 Oct 2026).** These boards changed only to reflect your decisions D-06 (OC-22), D-11 (OC-21) and D-23 (OC-23). Each change is listed against its board number on board 4 (Change log). The main ones:
- **M-02 lock message:** "Let's take a break. You can try again in 15 minutes, or ask your parent for help." It no longer claims that the parent was told.
- **M-08 sign-in section:** a system-suffixed username, plus Reset / Unlock now / Sign out on all devices. A confirm-your-password step comes first, and a new password is shown once.
- **D-06 labels** marked approved.
- **D-11 notes** cite OC-21.

The detailed sign-in rules shown remain **pending D-23a and D-37**.

| # | Canvas page | Board | Source file | Status | Round 3 change | Phase 1 priority | Your verdict |
|---|---|---|---|---|---|---|---|
| 1 | Overview | Read me first — PROPOSED, NOT APPROVED | `Main` | **Proposed — not approved** | Yes | review aid | ☐ Approve ☐ Change ☐ Reject |
| 2 | Overview | Design tokens, typography & accessibility checks | `T-Tokens` | **Proposed — not approved** | — | 1 | ☐ Approve ☐ Change ☐ Reject |
| 3 | Overview | Screen → brief → FRD, role check & state coverage | `X-Traceability` | **Proposed — not approved** | Yes | review aid | ☐ Approve ☐ Change ☐ Reject |
| 4 | Overview | Change log — review round 1 & open decisions | `X-Changelog` | **Proposed — not approved** | Yes | review aid | ☐ Approve ☐ Change ☐ Reject |
| 5 | Canonical student screens | S1 Student dashboard (desktop) — AA Pro adaptation · PROPOSED | `S01-StudentDashboard` | **Proposed — not approved** | Yes | 1 | ☐ Approve ☐ Change ☐ Reject |
| 6 | Canonical student screens | S9 Student dashboard (mobile) — AA Pro adaptation · PROPOSED | `S09-StudentDashboard-Phone` | **Proposed — not approved** | Yes | 1 | ☐ Approve ☐ Change ☐ Reject |
| 7 | Canonical student screens | S13 AI booking wizard (desktop) — AA Pro adaptation · PROPOSED | `S13-AIBookingWizard` | **Proposed — not approved** | Yes | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 8 | Canonical student screens | S13 AI booking wizard (mobile) · PROPOSED | `S13-AIBookingWizard-Phone` | **Proposed — not approved** | Yes | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 9 | Common states & access denied | Common states: loading, empty, error, success, offline, access denied | `ST-CommonStates` | **Proposed — not approved** | — | 1 | ☐ Approve ☐ Change ☐ Reject |
| 10 | Common states & access denied | Common states — phone · PROPOSED | `ST-CommonStates-Phone` | **Proposed — not approved** | — | 1 | ☐ Approve ☐ Change ☐ Reject |
| 11 | Sign-in & system | M-01 Sign in (adult) | `M01-SignIn` | **Proposed — not approved** | — | 2 | ☐ Approve ☐ Change ☐ Reject |
| 12 | Sign-in & system | M-02 Child sign in | `M02-ChildSignIn` | **Proposed — not approved** | Yes | 2 | ☐ Approve ☐ Change ☐ Reject |
| 13 | Sign-in & system | M-02 Child sign in — phone, error state · PROPOSED | `M02-ChildSignIn-Phone` | **Proposed — not approved** | Yes | 2 | ☐ Approve ☐ Change ☐ Reject |
| 14 | Sign-in & system | M-03 Password recovery & reset | `M03-Recovery` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 15 | Sign-in & system | M-04 / M-05 Account status & error pages | `M04-M05-StatusPages` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 16 | Sign-in & system | M-06 Privacy notice & guardian consent | `M06-Consent` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 17 | Parent portal | M-07 Children list | `M07-ChildrenList` | **Proposed — not approved** | — | 4 | ☐ Approve ☐ Change ☐ Reject |
| 18 | Parent portal | M-08 Child profile (create / edit) | `M08-ChildProfile` | **Proposed — not approved** | Yes | later phase | ☐ Approve ☐ Change ☐ Reject |
| 19 | Parent portal | M-09 Availability & restrictions | `M09-Restrictions` | **Proposed — not approved** | Yes | later phase | ☐ Approve ☐ Change ☐ Reject |
| 20 | Parent portal | M-10 Booking detail, cancel & reschedule | `M10-BookingDetail` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 21 | Parent portal | M-11 Invite external teacher | `M11-InviteTeacher` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 22 | Parent portal | M-12 Notification preferences & consent | `M12-NotificationPrefs` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 23 | Parent portal | M-13 Notification & booking status log | `M13-NotificationLog` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 24 | Parent portal | M-14 Content repository & upload states | `M14-ContentRepository` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 25 | Parent portal | M-15 Session history & summaries (parent) | `M15-ParentHistory` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 26 | Student portal | M-16 My learning history (student) | `M16-StudentHistory` | **Proposed — not approved** | — | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 27 | Student portal | M-16 History — phone · PROPOSED | `M16-StudentHistory-Phone` | **Proposed — not approved** | — | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 28 | Student portal | M-17 Booking outcome states | `M17-BookingOutcomes` | **Proposed — not approved** | — | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 29 | Student portal | M-18 AI classroom states | `M18-ClassroomStates` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 30 | Student portal | M-18 Classroom — phone, mic denied · PROPOSED | `M18-Classroom-Phone` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 31 | Student portal | M-19 Human meeting states | `M19-MeetingStates` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 32 | Teacher portal | M-20 / M-22 Teacher onboarding & profile | `M20-M22-TeacherProfile` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 33 | Teacher portal | M-21 Teacher account status | `M21-TeacherStatus` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 34 | Teacher portal | M-23 Teacher availability | `M23-Availability` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 35 | Teacher portal | M-24 Meeting detail & propose meeting | `M24-MeetingDetail` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 36 | Teacher portal | M-25 Assigned student detail | `M25-StudentDetail` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 37 | Super Admin | M-26 / M-35 Super Admin MFA & home | `M26-M35-AdminSignInHome` | **Proposed — not approved** | Yes | 3 | ☐ Approve ☐ Change ☐ Reject |
| 38 | Super Admin | M-27 Accounts list | `M27-Accounts` | **Proposed — not approved** | — | 3 | ☐ Approve ☐ Change ☐ Reject |
| 39 | Super Admin | M-28 Create / edit / deactivate account | `M28-AccountForm` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 40 | Super Admin | M-29 Teacher approval queue | `M29-Approvals` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 41 | Super Admin | M-30 Audit log (read-only) | `M30-AuditLog` | **Proposed — not approved** | Yes | later phase | ☐ Approve ☐ Change ☐ Reject |
| 42 | Super Admin | M-31 Integration health — DEFERRED, outside v1 scope | `M31-IntegrationHealth` | **Proposed — not approved** | — | deferred (OC-19), not for approval | ☐ Approve ☐ Change ☐ Reject |
| 43 | Messages & settings | M-32 / M-33 Invitation & notification emails | `M32-M33-Emails` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 44 | Messages & settings | M-34 Account settings | `M34-Settings` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 45 | Sign-in & system | M-01 Sign in — phone · PROPOSED | `M01-SignIn-Phone` | **Proposed — not approved** | — | 2 | ☐ Approve ☐ Change ☐ Reject |
| 46 | Parent portal | M-07 Children — phone · PROPOSED | `M07-ChildrenList-Phone` | **Proposed — not approved** | — | 4 | ☐ Approve ☐ Change ☐ Reject |
| 47 | Parent portal | M-10 Booking detail — phone · PROPOSED | `M10-BookingDetail-Phone` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 48 | Parent portal | M-14 Upload — phone · PROPOSED | `M14-Upload-Phone` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 49 | Student portal | M-17 Booking outcome — phone · PROPOSED | `M17-BookingOutcomes-Phone` | **Proposed — not approved** | Yes | 5 (opt.) | ☐ Approve ☐ Change ☐ Reject |
| 50 | Student portal | M-19 Student meeting card — phone · PROPOSED | `M19-StudentMeeting-Phone` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 51 | Teacher portal | M-23 Availability — phone · PROPOSED | `M23-Availability-Phone` | **Proposed — not approved** | — | later phase | ☐ Approve ☐ Change ☐ Reject |
| 52 | Super Admin | M-27 Accounts — phone (admin is desktop-first) · PROPOSED | `M27-Accounts-Phone` | **Proposed — not approved** | — | 3 | ☐ Approve ☐ Change ☐ Reject |

---

## 2. A-01 — Applying the master project instructions

**Current state (verified 14 Oct 2026).** The project settings of "AA Pro Learning Platform" still contain the **v1** text: three roles, "Lumina Learn" and Google Classroom in scope. There is no `CLAUDE.md` anywhere.

**Preservation (already done).**
- The v1 text is archived **verbatim** as `claude/Archived_Project_Instructions_v1.md`.
- Nothing is deleted. You can restore v1 at any time by pasting that text back.

**Text to apply.** `claude/Master_Project_Instructions_v2.1_PASTE.md`:
- 8,867 bytes, SHA-256 `0c5e798b…b850`;
- it is the v2.1 proposal you reviewed, minus its draft banner and its changes table, so only the instructions themselves are pasted;
- its single edit since your review: the G1 document range now reads G1-00…G1-10.

**Steps.** The button names follow the Claude help article "How can I create and manage projects?"; the exact labels may differ slightly in your app version.
1. Open claude.ai → **Projects** → **AA Pro Learning Platform**.
2. Open the project doc `claude/Master_Project_Instructions_v2.1_PASTE.md` and copy its **entire** content.
3. In the project, open the instructions editor: **Set project instructions**, or the edit control on the existing instructions.
4. Select **all** of the existing instruction text, delete it, and paste the copied text. Do not append to the old text, because the two would contradict each other.
5. Click **Save instructions**.
6. Tell me it is done. I will:
   - re-read the project settings;
   - compare them with the file, ignoring only trailing whitespace;
   - report "exact match" or list every difference.

Until then, the decision register (G1-05) continues to take precedence wherever v1 conflicts with it.

**Optional tidy-up (A-06).** The project root holds stale duplicate docs, for example a v1.0 copy of G1-04, next to the current `claude/` copies. The `claude/` copies are authoritative. I have not deleted anything.

---

## 3. D-34 — Exact bootstrap commit package

**Where it is.**
- The package was built in a staging folder **outside the repository** (`/home/claude/aa-bootstrap-staging/AA-Learning-Portal`).
- It was validated in a separate throwaway Git repository (`/home/claude/aa-bootstrap-validate`).
- The real repository was not touched.

**Freeze reference.** The 40-file manifest below has SHA-256 **`a5f7f089448f2ca31a2ac7b4d09716d5c8ded4b5a030aece8576534014a83639`** (manifest of SHA-256, size and path per file).

### 3.1 Exact tree (40 files, 1,887,413 bytes)

```
AA-Learning-Portal/
├── .github/
│   ├── workflows/
│   │   └── repo-hygiene.yml
│   └── pull_request_template.md
├── design-reference/
│   ├── stitch-selected/
│   │   ├── DESIGN.md
│   │   ├── S01_student_dashboard_my_learning_space.redacted.html
│   │   ├── S09_zip9_mobile_dashboard.redacted.html
│   │   ├── S11_student_schedule_schedule_ai_class_flow_calendar_view.redacted.html
│   │   ├── S12_class_schedule_2.redacted.html
│   │   ├── S13_book_a_class_1.redacted.html
│   │   ├── S14_book_a_class_2.redacted.html
│   │   ├── S15_ai_classroom_2.redacted.html
│   │   ├── S16_ai_classroom_1.redacted.html
│   │   ├── S17_learning_library_1.redacted.html
│   │   ├── S18_learning_library_2.redacted.html
│   │   ├── S19_parent_dashboard_family_learning_hub.redacted.html
│   │   ├── S20_parent_mode_book_human_teacher.redacted.html
│   │   └── S21_teacher_dashboard_schedule_hub.redacted.html
│   ├── ORIGINAL_CHECKSUMS.sha256
│   ├── ORIGINAL_INVENTORY.md
│   └── README.md
├── docs/
│   ├── design/
│   │   └── missing-screens.md
│   ├── g1/
│   │   ├── AA_Pro_Phase0_Audit_Report.md
│   │   ├── G1-00_Completion_Report.md
│   │   ├── G1-01_Canonical_Screen_Inventory.md
│   │   ├── G1-02_Requirements_Traceability_Matrix.md
│   │   ├── G1-03_Missing_Screen_Design_Briefs.md
│   │   ├── G1-04_Design_Change_and_Accessibility_Log.md
│   │   ├── G1-05_Decision_Register.md
│   │   ├── G1-06_Repository_and_Project_Isolation_Plan.md
│   │   ├── G1-07_Design_Review_Round2_Changelog.md
│   │   └── G1-08_Owner_Action_Plan.md
│   ├── requirements/
│   │   ├── AA_Pro_FRD_v1.1.pdf
│   │   └── CHECKSUMS.sha256
│   └── README.md
├── scripts/
│   └── check-repo-hygiene.mjs
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .secrets.baseline
└── README.md
```

### 3.2 Complete file list (SHA-256 abbreviated; full values in the manifest)

| SHA-256 | Bytes | Path |
|---|---|---|
| `6d6796f1…66864553` | 188 | `.editorconfig` |
| `d169720f…dcc88f06` | 844 | `.env.example` |
| `7329fca6…af730d17` | 69 | `.gitattributes` |
| `f627bd7c…3bff1d0e` | 971 | `.github/pull_request_template.md` |
| `4a5ff7b8…83f29200` | 986 | `.github/workflows/repo-hygiene.yml` |
| `7c2f2480…c61dff5f` | 452 | `.gitignore` |
| `095d2282…2b8d6fcd` | 2768 | `.secrets.baseline` |
| `a3f8f21c…8795e7d1` | 2122 | `README.md` |
| `74415cb5…ae44eff9` | 5363 | `design-reference/ORIGINAL_CHECKSUMS.sha256` |
| `85bd7121…65cc7165` | 3919 | `design-reference/ORIGINAL_INVENTORY.md` |
| `88e10f8c…0d0bdd2d` | 2154 | `design-reference/README.md` |
| `e235b2b7…a300d875` | 10552 | `design-reference/stitch-selected/DESIGN.md` |
| `03cd575c…39fffea2` | 50368 | `design-reference/stitch-selected/S01_student_dashboard_my_learning_space.redacted.html` |
| `a66bc128…7b71c4c1` | 38948 | `design-reference/stitch-selected/S09_zip9_mobile_dashboard.redacted.html` |
| `3ef81d67…e3348177` | 55217 | `design-reference/stitch-selected/S11_student_schedule_schedule_ai_class_flow_calendar_view.redacted.html` |
| `d1733466…02115ff0` | 46196 | `design-reference/stitch-selected/S12_class_schedule_2.redacted.html` |
| `c42feadf…2b9fe124` | 45597 | `design-reference/stitch-selected/S13_book_a_class_1.redacted.html` |
| `35936afe…6e3053e1` | 37142 | `design-reference/stitch-selected/S14_book_a_class_2.redacted.html` |
| `b71f9ef2…7e18da1c` | 53952 | `design-reference/stitch-selected/S15_ai_classroom_2.redacted.html` |
| `351caeb7…1f346329` | 25006 | `design-reference/stitch-selected/S16_ai_classroom_1.redacted.html` |
| `a7a83668…2a63af8d` | 61648 | `design-reference/stitch-selected/S17_learning_library_1.redacted.html` |
| `2dae66d6…13a8ad63` | 43450 | `design-reference/stitch-selected/S18_learning_library_2.redacted.html` |
| `b3556260…61e40244` | 54962 | `design-reference/stitch-selected/S19_parent_dashboard_family_learning_hub.redacted.html` |
| `441b1c5f…3dfd02f6` | 52169 | `design-reference/stitch-selected/S20_parent_mode_book_human_teacher.redacted.html` |
| `ae285d47…61de7074` | 48808 | `design-reference/stitch-selected/S21_teacher_dashboard_schedule_hub.redacted.html` |
| `08af5f62…83b45c30` | 1857 | `docs/README.md` |
| `823fbf63…d15671a0` | 937 | `docs/design/missing-screens.md` |
| `d0c28c28…ddabc8ea` | 39733 | `docs/g1/AA_Pro_Phase0_Audit_Report.md` |
| `9d45b4d8…a40cfb88` | 4508 | `docs/g1/G1-00_Completion_Report.md` |
| `a20b1e45…d5534778` | 10862 | `docs/g1/G1-01_Canonical_Screen_Inventory.md` |
| `98e015a7…1dc18b80` | 17575 | `docs/g1/G1-02_Requirements_Traceability_Matrix.md` |
| `c4c7be49…bdec36d4` | 13740 | `docs/g1/G1-03_Missing_Screen_Design_Briefs.md` |
| `e376341f…988dac24` | 15523 | `docs/g1/G1-04_Design_Change_and_Accessibility_Log.md` |
| `6d623915…980fd969` | 23455 | `docs/g1/G1-05_Decision_Register.md` |
| `a6b0cfc8…4bcbe00b` | 10838 | `docs/g1/G1-06_Repository_and_Project_Isolation_Plan.md` |
| `8ea8a012…8660b623` | 5102 | `docs/g1/G1-07_Design_Review_Round2_Changelog.md` |
| `96f963b0…1c4fa1d9` | 31082 | `docs/g1/G1-08_Owner_Action_Plan.md` |
| `ad4b081b…53108689` | 1064659 | `docs/requirements/AA_Pro_FRD_v1.1.pdf` |
| `1b5fca34…2a7ff902` | 86 | `docs/requirements/CHECKSUMS.sha256` |
| `ed51d532…f335c22b` | 3605 | `scripts/check-repo-hygiene.mjs` |

### 3.3 Exclusions — never committed

- **Both original Stitch ZIPs, and every extracted original file.** They are kept read-only outside Git in `/home/claude/stitch-originals-readonly` (file permissions set to read-only). The originals also remain in your project files.
- **All 21 Stitch `screen.png` screenshots.** They show identifying demo data.
- **The 8 non-selected Stitch screens (S2–S8 and S10) and the logo folder (L1).** Two of these folders have demo names in their names.
- **Any `.env`, credential, token or key.** None exist; `.env.example` holds names only, with empty values.
- **The design canvas source files.** They stay in the private canvas until approved (D-32).
- **G1-09 (this document) and G1-10 (Phase 1 plan).** They stay in the private project until approved.
- **The archived and proposed project instructions.** They are project governance and are not needed in the repository.
- **The identifying-terms list.** It is supplied to CI only through the `IDENTIFYING_TERMS` repository secret (A-05) and never appears in any file.

### 3.4 Redaction approach and evidence

**Stitch HTML: 13 files, 341 substitutions by category.** Each file's first line records the original's path and SHA-256.

| Category | Count | Replaced with |
|---|---|---|
| Demo child names, including JavaScript identifiers such as button IDs | 139 | Kiran, Meera, Dev |
| Teacher names | 59 | Teacher A. Rao, B. Iyer, C. Das, D. Nair |
| School names | 48 | "Sample Primary School" |
| Parent name | 9 | "Demo Parent" |
| School location | 2 | "Sample" |
| Meeting URLs, including a school-named Zoom subdomain | 6 | `https://example.com/meeting-link-placeholder` |
| Meeting IDs / passcodes | 5 / 2 | `[meeting ID placeholder]` / `[placeholder]` |
| Phone numbers | 2 | `[phone number removed]` |
| Hot-linked third-party images | 54 | A neutral inline SVG placeholder |
| Image descriptions describing a child's age or appearance | 15 | "Placeholder image" |

- **Unchanged:** layout, classes, tokens, copy and brand strings.
- **Structure check:** the HTML tag count is identical to the original in all 13 files.
- **DESIGN.md** is byte-identical to the original; it contains no personal data.

**Documents.** Three G1 docs are committed as redacted copies, which differ from your project copies only by these substitutions:
- **Phase 0 audit:** 11 redactions.
- **G1-01:** 2 redactions.
- **G1-04:** 2 redactions.

The redactions replace the demo first names, the real school's name, its email domain and its Zoom subdomain, and two Stitch folder names, each with `[redacted]` markers. `docs/README.md` states this.

**FRD.**
- Committed unchanged; SHA-256 `ad4b081b…8689` is verified.
- Its text, extracted with pdftotext, contains no identifying term.
- **Observation for you:** the PDF carries embedded C2PA "Content Credentials" metadata naming the AI tool that generated it, and generic creator fields (python-docx, LibreOffice). There is no personal data in the metadata.
- OC-17 says to commit the FRD unchanged, so I have not stripped this metadata. Tell me if you want a metadata-stripped copy instead; its checksum would then differ from the recorded baseline.

### 3.5 Deviations from the G1-06 §6.3 tree you approved (OC-16)

| Change | Reason |
|---|---|
| **Added** `.github/workflows/repo-hygiene.yml`, `scripts/check-repo-hygiene.mjs`, `.secrets.baseline`. G1-06 had said CI comes in Phase 1. | It enforces privacy and secret checks from the very first commit. It also gives A-03 branch protection two status checks to require (`privacy-and-brand`, `secret-scan`). The G1-08 §4 draft you reviewed already included CI. **If you prefer G1-06 as written, I remove these three files and add them in the first Phase 1 PR.** |
| **Added** G1-07, G1-08 and `design-reference/ORIGINAL_INVENTORY.md` | G1-07 and G1-08 were produced after G1-06. OC-20 requires the inventory. |
| `DESIGN.md` placed in `stitch-selected/` | It is the token source and is unchanged. |
| G1-05 is v1.5 (latest) | The current register |

### 3.6 Confirmations

All of the following hold, and each was checked by a tool rather than by eye (§3.7):
- no secrets, tokens, keys or credentials;
- no `.env` file;
- no personal student data;
- no identifying demo data, whether names, school, meeting links or IDs, phone numbers or child image descriptions;
- no original ZIPs, extracted originals or screenshots;
- no application code: no `package.json`, no `src/`;
- no file from, or reference to, any other project's brand outside the docs that state the separation rule.

**The CI workflow:**
- has `contents: read` permissions only;
- pins `actions/checkout` to commit `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2, resolved from GitHub today);
- installs `detect-secrets==1.5.0` from PyPI.

**The one secret-scan finding is a false positive.** It is the word "password" in a G1-03 sentence describing a sign-in form. It is recorded as audited (`is_secret: false`) in `.secrets.baseline`, and any new finding fails CI.

### 3.7 Validation results (run 14 Oct 2026 in the throwaway repo; actual output)

```
Checked 40 files against 13 identifying terms.
PASS: no findings.
PASS  hygiene: identifying terms, meeting links, phones, emails, hot-links, brand, forbidden files, size
PASS  secret scan: detect-secrets 1.5.0 against audited baseline (1 audited false positive)
PASS  regex sweep: cloud keys, tokens, private keys
PASS  .env.example contains names only (no values)
PASS  no .env, archive, screenshot or key files tracked
PASS  no file larger than 5 MB
PASS  FRD unchanged (SHA-256 ad4b081b...)
PASS  FRD text has no identifying terms (pdftotext)
PASS  every redacted HTML header SHA-256 matches its untouched original
  entries 47
PASS  ORIGINAL_CHECKSUMS.sha256 re-verified against the read-only originals (47 entries)
PASS  DESIGN.md identical to the original (both ZIP copies)
PASS  redacted HTML keeps the original tag structure (13 files)
  jobs: ['privacy-and-brand', 'secret-scan']
PASS  workflow YAML parses; actions pinned to full commit SHAs; read-only token
PASS  no application code (no package.json, no src/)
RESULT: ALL CHECKS PASSED
```

**Negative tests (the checks really detect problems).** I planted the following in a separate copy, and the hygiene check reported all 10 findings and exited with code 1:
- a `.env`, a `.zip` and a `screen.png`;
- a source file containing a demo name inside a JavaScript identifier, a Zoom link, a +65 phone number, a gmail address, "Tutor Lumina" and an image hot-link.

**Missing secret.** With no terms supplied, the check fails with exit code 2 rather than passing.

**Planted fake key.** A planted fake AWS key was caught by the secret scan, which exited with code 1.

### 3.8 Proposed commit

| Item | Value |
|---|---|
| Repository / branch | `sinharomesh-cpu/AA-Learning-Portal`, `main` (first commit; the repository is empty) |
| Local directory | Fresh clone into `/home/claude/AA-Learning-Portal` (OC-18) |
| Author | `Claude <noreply@anthropic.com>` (the identity configured in this workspace). Tell me if you want a different author. |
| Message | `docs: bootstrap AA Pro repository (G1 documentation, references, repo hygiene)`, then a body listing the contents and the decisions OC-16, OC-17, OC-20, D-34, followed by the two attribution lines (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` link) |

**What I will do after your approval, in this order. I stop and report if any step differs from what is expected.**
1. Confirm that A-05 is done: you tell me the `IDENTIFYING_TERMS` secret exists. I cannot read secret values.
2. Clone fresh. Re-verify the remote and that it has no refs. If the repository is no longer empty, stop.
3. Copy the staged files. Confirm that every file's SHA-256 equals the manifest, and that the manifest hash is still `a5f7f089…3639`.
4. Re-run every §3.7 check inside the real working tree.
5. Make one commit and push to `origin main`.
6. Report:
   - the commit SHA;
   - `git ls-remote origin`;
   - the CI run result for `privacy-and-brand` and `secret-scan`.
7. Then give you the A-03 branch-protection checklist with the now-selectable check names. The approval rule follows D-36.

**To approve**, reply for example: **"Approve D-34 package a5f7f089…3639"**, together with any amendment, for example "drop the CI files". If any file has to change, I rebuild, re-run all checks, and present a new manifest hash for approval.

---

## 4. Remaining blockers before Phase 1

1. **D-32:** priority-1 boards **2, 5, 6, 9, 10** must be approved before WP-1/WP-2/WP-4. WP-0 needs no board.
2. **D-34:** approve the package, add A-05, then I commit and push and CI runs. **A-03** branch protection follows; D-36 sets the approval rule.
3. **D-38** (Parent/Teacher design reference), **D-39** (demo access), **D-40** (no hosted preview), **D-41** (technology baseline): your decisions.
4. **A-01:** recommended before Phase 1, so that every new session starts from v2.1.
5. Your explicit **"begin Phase 1"**.

**Phase 2 and later decisions stay open in G1-05.** They do not block Phase 1, and Phase 1 shows them as pending: D-05, D-07, D-08, D-09, D-10, D-11b, D-15, D-16, D-17, D-22, D-23a, D-24, D-25, D-26, D-28, D-35, D-36, D-37, D-01a.

**Separation, roles and privacy (unchanged).**
- AA Pro remains fully separate from P4Bpay.com (OC-07).
- There are four roles plus an external invitee, with server-side enforcement (OC-06, OC-21).
- Data is synthetic only (OC-04).
- There are no identifying data or secrets in Git (OC-09, OC-20).
- The deferred scope stays deferred (OC-03, OC-12, OC-13, OC-19).

---

## Appendix A — Full manifest (SHA-256  bytes  path). The SHA-256 of this block’s text, as a file with a trailing newline, is a5f7f089…3639

```
6d6796f174b736bcd7a68999e30d2f19a3719ad92355dcc0cfdfce8a66864553       188  .editorconfig
d169720f9a50e6b2a070234d83868450460c61dee206169eaf5aec1adcc88f06       844  .env.example
7329fca69fbf06316c669a5d646eb37a6ff6be105d4b5e06998e8957af730d17        69  .gitattributes
f627bd7cbedbc961f3e1e9bf5b3aa4c3a10b159f933fe9d9023988d73bff1d0e       971  .github/pull_request_template.md
4a5ff7b80239c3f8b02036fbb7bfd721e6804bccff5a9593d43d429783f29200       986  .github/workflows/repo-hygiene.yml
7c2f2480dfc6aba01c4f0f915e7f0a1709af2cef434399ead0f531a2c61dff5f       452  .gitignore
095d2282553d98af4bb491493f17cb920f58d6be5abf5289699a3a372b8d6fcd      2768  .secrets.baseline
a3f8f21ce3f486d70105c37b628a4a22bd9160ede3a391a427b5887e8795e7d1      2122  README.md
74415cb59b141df741feb5a7adf9c8a72eae23fcd64266ad1b0bd279ae44eff9      5363  design-reference/ORIGINAL_CHECKSUMS.sha256
85bd712194d3604e733d6c2faf3fc2e180b8023a60496e48c7d674f265cc7165      3919  design-reference/ORIGINAL_INVENTORY.md
88e10f8c44382913123cbd310b73d5e4c52900258152e6a1c219a0e20d0bdd2d      2154  design-reference/README.md
e235b2b798604e559677ce3a9151071f9ce978f8ff549236c6034ad4a300d875     10552  design-reference/stitch-selected/DESIGN.md
03cd575caf9e4eb04f293e532e1ea033db4ca3b12a13811e86c3d8c439fffea2     50368  design-reference/stitch-selected/S01_student_dashboard_my_learning_space.redacted.html
a66bc1283c9ac4454a71498d88799d1e79f1627be11e58ca4a112dd47b71c4c1     38948  design-reference/stitch-selected/S09_zip9_mobile_dashboard.redacted.html
3ef81d67dbe0e87ada95a7ac8143c8799ef7db96cb42a3e0eaac98b2e3348177     55217  design-reference/stitch-selected/S11_student_schedule_schedule_ai_class_flow_calendar_view.redacted.html
d1733466d2fbf1678716db33171e59bb23f59024a83958d18eda731c02115ff0     46196  design-reference/stitch-selected/S12_class_schedule_2.redacted.html
c42feadf47cc31363e5b3ec8655818f1b3cd5e67698e6fc589f21cb42b9fe124     45597  design-reference/stitch-selected/S13_book_a_class_1.redacted.html
35936afed685a2bd61e51eed9aae48217319a5934d7e04e2a9bed4cc6e3053e1     37142  design-reference/stitch-selected/S14_book_a_class_2.redacted.html
b71f9ef200f1b7bca4bbacc9e3940e0f038d34ce0fc1289a4654a0af7e18da1c     53952  design-reference/stitch-selected/S15_ai_classroom_2.redacted.html
351caeb7c2ee03bb07423ddd8d1cceb12fb9cff0c3efd3f2d2c0662a1f346329     25006  design-reference/stitch-selected/S16_ai_classroom_1.redacted.html
a7a83668266e396762e33211a0c13832c37b8c866a108a1082c518aa2a63af8d     61648  design-reference/stitch-selected/S17_learning_library_1.redacted.html
2dae66d6f2bee70059b0f3db259b95695271b9ca26c00748bffc606d13a8ad63     43450  design-reference/stitch-selected/S18_learning_library_2.redacted.html
b3556260ae335fabf68ce8796f52fa39ddd6605ef616efa242f045cd61e40244     54962  design-reference/stitch-selected/S19_parent_dashboard_family_learning_hub.redacted.html
441b1c5f23f7e605ef011bdd17f67f65931f88b7cb969484090514563dfd02f6     52169  design-reference/stitch-selected/S20_parent_mode_book_human_teacher.redacted.html
ae285d47b96e8b1f031e1de8076e6c2699a2946db9cfd9f7211b864861de7074     48808  design-reference/stitch-selected/S21_teacher_dashboard_schedule_hub.redacted.html
08af5f62e100d15e31745370bf41cf6c906b10d2811f738b6946f50c83b45c30      1857  docs/README.md
823fbf632805eba3be285be729c8fbaf50fe67299a15cf9aae37be34d15671a0       937  docs/design/missing-screens.md
d0c28c28f270f64d08ddd3234d5a1e3beee08d38a4f059adb17cf288ddabc8ea     39733  docs/g1/AA_Pro_Phase0_Audit_Report.md
9d45b4d8493c0c95f43c0583a172cd5a550190f7d40f9c2f1e6c7693a40cfb88      4508  docs/g1/G1-00_Completion_Report.md
a20b1e452f71a8d8383f9d7b6ad576f9098252f9b8851b709c079d6ed5534778     10862  docs/g1/G1-01_Canonical_Screen_Inventory.md
98e015a7fd58849790fab56afbb74c5daa36de9d90a61d98e4fa4f9f1dc18b80     17575  docs/g1/G1-02_Requirements_Traceability_Matrix.md
c4c7be49afaab8431edd8feccf95c9d221ea51fd9447dd7cffbc4f28bdec36d4     13740  docs/g1/G1-03_Missing_Screen_Design_Briefs.md
e376341f04ae6713ceb3f8db35c91691182e7206847153122e75621b988dac24     15523  docs/g1/G1-04_Design_Change_and_Accessibility_Log.md
6d6239159e175ce871caba11b4a8c4645916fdd98f5efe80d75a3b37980fd969     23455  docs/g1/G1-05_Decision_Register.md
a6b0cfc8e7dbdf96f58cf5512de56957fa8854c20c7bf6d17b5383f14bcbe00b     10838  docs/g1/G1-06_Repository_and_Project_Isolation_Plan.md
8ea8a012fa520f9e2af1e3ef25387dd4920e08d63bec679a344ac9428660b623      5102  docs/g1/G1-07_Design_Review_Round2_Changelog.md
96f963b011c9464b620d06bcc7519a53cc47c01e6626bb0530f3254e1c4fa1d9     31082  docs/g1/G1-08_Owner_Action_Plan.md
ad4b081bdbd78e689dea8c7d75040fa7338cfa374f934b26d2b0760253108689   1064659  docs/requirements/AA_Pro_FRD_v1.1.pdf
1b5fca349cb6ebe359a93de76ed48721fda9906c20ac061580335f8b2a7ff902        86  docs/requirements/CHECKSUMS.sha256
ed51d5321f801babe7fe823f579fb0a461de3ccc35f6c3fcb6f1f710f335c22b      3605  scripts/check-repo-hygiene.mjs
```
