# AA Pro — G1-08 Owner Action Plan

**Version:** 1.0 · 14 Oct 2026 · **Companion to:** G1-05 Decision Register v1.4
**Status:** for owner review. Nothing in this document has been implemented, committed, pushed or deployed. Repository `sinharomesh-cpu/AA-Learning-Portal` is still empty: `main` has no commits (re-verified 14 Oct 2026).

## 1. Decision status at a glance

| ID | Subject | State | Next step | Who |
|---|---|---|---|---|
| **D-32** | Missing-screen designs | **Pending — in owner review, not approved** | Review each board using §2. Every board keeps the "Proposed — Not Approved" label until you approve that board explicitly. | You |
| **D-33** | Stitch references in Git | **Approved — Option B** (OC-20) | I show the exact file list (§4) inside the D-34 package | Claude |
| **D-11** | Super Admin v1 scope | **Approved** (OC-21) | Remaining question D-11b: how admin accounts are created | You |
| **D-23** | Child sign-in and recovery | **Approved in principle** (OC-23) | Review the spec in §3 (D-23a) and the password policy (D-37) | You |
| **D-06** | AI session lengths | **Approved** (OC-22) | The board labels still read "proposed D-06". I update them in the next design revision. | Claude |
| **D-34** | Bootstrap commit and push | **Conditional** | I prepare the exact commit package (§4.4) and wait for your explicit approval of that exact commit | Claude, then you |
| A-01 | Project instruction file | **Proposal ready** | Review §5. You paste the approved text into the project settings. | You |
| A-03 | Protect `main` | **Steps ready, not applied** | Apply after the first commit and first CI run (§6). D-36 decides the approval rule. | You |

### Recommended order
1. **You:** D-23a, D-37, D-36, D-11b. These are short.
2. **You:** start the D-32 screen review. It can run in parallel with steps 3–5.
3. **Claude:** revise the boards for the decisions above. This includes the M-02 lock message (§3.6) and removing the "proposed" labels for D-06 and D-11. The boards stay "Proposed — Not Approved".
4. **Claude:** prepare the D-34 package: redacted files, tree, scans and validation output. No commit is made.
5. **You:** approve or amend that exact package. Only then do I commit and push, and report the commit SHA and `git ls-remote` output as evidence.
6. **You:** apply branch protection (§6). Phase 1 still needs its own approval.

---

## 2. D-32 — Design canvas and screen-by-screen review index

**Canvas:** "AA Pro — Missing Screens (G1 Review)": https://claude.ai/artifact/GuEbHf2fp3ZwZywaj7BEtJ (private to you until you share it).

**How to review**
- Open the canvas and switch pages with the page list. Each board's title matches the "Board" column below.
- Comment directly on a board, or mark a verdict in this table and send it back.
- Briefs and FRD references for every board are on board 3 ("Screen → brief → FRD").
- Boards 1–4 are review aids; approving them is optional.
- **A board is approved only when you approve it by its number or name.** A general comment such as "looks good" does not count as approval.

**Boards that will change before you approve them** (because of today's decisions):
- M-02 (12, 13): the lock message changes (§3.6) and the pending-D-23 note is updated.
- S13 (7, 8), S1 (5), S9 (6), M-17 phone (49): the "proposed D-06" labels change to approved.
- M-26/35 (37), M-30 (41): the "pending D-11" notes are updated to OC-21.
- M-08 (18): the child sign-in controls (reset, unlock, sign out everywhere) are added per §3.

You can still review these boards now. I will list each change against its board number.

| # | Canvas page | Board | Source file | Status | Your verdict |
|---|---|---|---|---|---|
| 1 | Overview | Read me first — PROPOSED, NOT APPROVED | `Main` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 2 | Overview | Design tokens, typography & accessibility checks | `T-Tokens` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 3 | Overview | Screen → brief → FRD, role check & state coverage | `X-Traceability` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 4 | Overview | Change log — review round 1 & open decisions | `X-Changelog` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 5 | Canonical student screens | S1 Student dashboard (desktop) — AA Pro adaptation · PROPOSED | `S01-StudentDashboard` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 6 | Canonical student screens | S9 Student dashboard (mobile) — AA Pro adaptation · PROPOSED | `S09-StudentDashboard-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 7 | Canonical student screens | S13 AI booking wizard (desktop) — AA Pro adaptation · PROPOSED | `S13-AIBookingWizard` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 8 | Canonical student screens | S13 AI booking wizard (mobile) · PROPOSED | `S13-AIBookingWizard-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 9 | Common states & access denied | Common states: loading, empty, error, success, offline, access denied | `ST-CommonStates` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 10 | Common states & access denied | Common states — phone · PROPOSED | `ST-CommonStates-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 11 | Sign-in & system | M-01 Sign in (adult) | `M01-SignIn` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 12 | Sign-in & system | M-02 Child sign in | `M02-ChildSignIn` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 13 | Sign-in & system | M-02 Child sign in — phone, error state · PROPOSED | `M02-ChildSignIn-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 14 | Sign-in & system | M-03 Password recovery & reset | `M03-Recovery` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 15 | Sign-in & system | M-04 / M-05 Account status & error pages | `M04-M05-StatusPages` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 16 | Sign-in & system | M-06 Privacy notice & guardian consent | `M06-Consent` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 17 | Parent portal | M-07 Children list | `M07-ChildrenList` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 18 | Parent portal | M-08 Child profile (create / edit) | `M08-ChildProfile` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 19 | Parent portal | M-09 Availability & restrictions | `M09-Restrictions` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 20 | Parent portal | M-10 Booking detail, cancel & reschedule | `M10-BookingDetail` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 21 | Parent portal | M-11 Invite external teacher | `M11-InviteTeacher` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 22 | Parent portal | M-12 Notification preferences & consent | `M12-NotificationPrefs` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 23 | Parent portal | M-13 Notification & booking status log | `M13-NotificationLog` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 24 | Parent portal | M-14 Content repository & upload states | `M14-ContentRepository` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 25 | Parent portal | M-15 Session history & summaries (parent) | `M15-ParentHistory` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 26 | Student portal | M-16 My learning history (student) | `M16-StudentHistory` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 27 | Student portal | M-16 History — phone · PROPOSED | `M16-StudentHistory-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 28 | Student portal | M-17 Booking outcome states | `M17-BookingOutcomes` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 29 | Student portal | M-18 AI classroom states | `M18-ClassroomStates` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 30 | Student portal | M-18 Classroom — phone, mic denied · PROPOSED | `M18-Classroom-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 31 | Student portal | M-19 Human meeting states | `M19-MeetingStates` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 32 | Teacher portal | M-20 / M-22 Teacher onboarding & profile | `M20-M22-TeacherProfile` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 33 | Teacher portal | M-21 Teacher account status | `M21-TeacherStatus` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 34 | Teacher portal | M-23 Teacher availability | `M23-Availability` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 35 | Teacher portal | M-24 Meeting detail & propose meeting | `M24-MeetingDetail` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 36 | Teacher portal | M-25 Assigned student detail | `M25-StudentDetail` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 37 | Super Admin | M-26 / M-35 Super Admin MFA & home | `M26-M35-AdminSignInHome` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 38 | Super Admin | M-27 Accounts list | `M27-Accounts` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 39 | Super Admin | M-28 Create / edit / deactivate account | `M28-AccountForm` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 40 | Super Admin | M-29 Teacher approval queue | `M29-Approvals` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 41 | Super Admin | M-30 Audit log (read-only) | `M30-AuditLog` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 42 | Super Admin | M-31 Integration health — DEFERRED, outside v1 scope | `M31-IntegrationHealth` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 43 | Messages & settings | M-32 / M-33 Invitation & notification emails | `M32-M33-Emails` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 44 | Messages & settings | M-34 Account settings | `M34-Settings` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 45 | Sign-in & system | M-01 Sign in — phone · PROPOSED | `M01-SignIn-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 46 | Parent portal | M-07 Children — phone · PROPOSED | `M07-ChildrenList-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 47 | Parent portal | M-10 Booking detail — phone · PROPOSED | `M10-BookingDetail-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 48 | Parent portal | M-14 Upload — phone · PROPOSED | `M14-Upload-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 49 | Student portal | M-17 Booking outcome — phone · PROPOSED | `M17-BookingOutcomes-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 50 | Student portal | M-19 Student meeting card — phone · PROPOSED | `M19-StudentMeeting-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 51 | Teacher portal | M-23 Availability — phone · PROPOSED | `M23-Availability-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |
| 52 | Super Admin | M-27 Accounts — phone (admin is desktop-first) · PROPOSED | `M27-Accounts-Phone` | Proposed — not reviewed | ☐ Approve ☐ Change ☐ Reject |

---

## 3. D-23a — Child sign-in, lockout and recovery: proposed specification

The approved principle (OC-23): the Parent creates the child's username and password; the Parent resets them through an authorised flow; 5 failed attempts lock the account for 15 minutes; the system never reveals whether a child account exists. This section is the detailed specification for your review. **It is not implemented, and it is not approved until you approve D-23a.**

### 3.1 Credential creation and storage
- **Hashing.** Passwords are hashed with **Argon2id** using at least the OWASP Password Storage Cheat Sheet baseline (19 MiB memory, 2 iterations, parallelism 1). The parameters are tuned upward to about 250 ms per hash on the production server. If the chosen auth provider can only do bcrypt, its cost factor is at least 12.
- **What is never stored or logged.** Plain-text passwords, and reversible encryption of passwords, are never used. Passwords never appear in logs, analytics, error reports, emails or audit records.
- **Optional pepper.** A server-side pepper, held as a secret outside the database, may be added. The decision is made in Phase 2 together with the provider choice.
- **Password policy (D-37).** Child passwords are at least 8 characters and adult passwords at least 12; both have a 64-character maximum. Passphrases and spaces are allowed. Every password is checked against a breached-password list using a k-anonymity check or an offline list, with no plain password sent to a third party. There are no forced composition rules and no periodic expiry.
- **Who sees the password.** The Parent sets the password, or the system generates a readable passphrase. It is shown to the Parent **once**, at creation or reset. After that, nobody, including the Parent and the Super Admin, can view it; it can only be replaced.
- **Child usernames.** The Parent picks a name and the system appends a short random suffix, for example `kiran-4821`. The result is unique on the platform, so a Parent never learns that another family's username exists. Usernames contain no surname, school, birth date or email address.
- **No email or phone for the child.** The child has no email or phone number and no self-service recovery.

### 3.2 Sign-in and rate limiting
| Control | Rule |
|---|---|
| **Per-username lockout** | After 5 consecutive failed attempts, that username is locked for 15 minutes. The counter is keyed on an HMAC of the normalised submitted username, **whether or not the account exists**. A non-existent username therefore locks and responds exactly as a real one does. |
| **During a lock** | Attempts are rejected without checking the password, and they do not extend the lock. This stops a sibling or classmate from keeping a child locked out indefinitely. A successful sign-in after the lock clears the counter. |
| **Per-IP throttle** | Excessive failures from one network address across usernames (proposed: more than 20 in 15 minutes) receive HTTP 429 with a Retry-After header and a child-friendly "please wait" message. A school network shares one address, so this limit is set generously and monitored. |
| **Identical responses** | Wrong username, wrong password and an unknown account all return the same message, status code and response shape. An unknown username still runs a dummy Argon2id verification, so the timing matches a real check. |
| **Session on success** | The session ID is regenerated. The cookie is HttpOnly, Secure and SameSite=Lax. Sessions are stored server-side so they can be revoked immediately. Proposed lifetimes: the child's session expires after 60 minutes idle and 12 hours absolute. Activity in the AI classroom counts as activity. There is no "remember me" unless approved. |
| **Unauthenticated callers** | They cannot see any child's existence or lock status, and they cannot trigger any message to a parent. Only real accounts generate parent notifications, and nothing about that is shown on screen. |

### 3.3 Unlock behaviour
1. **Automatic.** The lock clears 15 minutes after it started.
2. **Early unlock by the Parent.** In M-08 (child profile), the Parent chooses "Unlock sign-in". This requires recent re-authentication (§3.4 step 3) and a server-side check of the parent–child link. The lock and the counter are cleared, and the password is unchanged.
3. **No one else can unlock.** Super Admins and teachers cannot unlock or reset child accounts. This matches OC-21: no access to children's accounts.

### 3.4 Recovery flow: a child forgets the password (for your review)
1. **On the child's screen.** M-02 shows "Forgot your password? Ask your parent to help you." There is no form and no email.
2. **Parent signs in.** The Parent signs in to the Parent portal as normal, through M-01.
3. **Step-up re-authentication.** If the Parent last authenticated more than 5 minutes ago, they re-enter their password, plus MFA if they have it enabled. Failures are counted and audited (PARENT_REAUTH_FAILED), and 5 failures sign the Parent out.
4. **Authorisation check on the server.**
   - The Parent's account must be active.
   - An active guardian link must exist between this Parent and this child.
   - If either check fails, the response is a generic "not found", the same as for a non-existent child.
5. **Parent chooses an action** in M-08 → "Sign-in and security":
   - **(a) Reset password.** Set a new one or generate a passphrase. The new password is shown once.
   - **(b) Unlock only.**
   - **(c) Sign out of all devices.**
6. **Server actions on reset**, in one transaction:
   - store the new hash;
   - increment the child's credential version;
   - **revoke every session and refresh token of the child**, including any AI classroom session;
   - clear the lock and failure counter;
   - write the audit events (§3.5).
7. **Confirmation.** The Parent sees a confirmation and receives an email: "The sign-in for [child display name] was reset at [time]. If this wasn't you, contact support." The child receives nothing.
8. **Child signs in again.** The child signs in with the new password. Any open tab of the child's is signed out on its next request.

**Parent recovery (adult).** M-03, already on the canvas, is used.
- The response is identical whether or not the email exists.
- The reset link is single-use, expires in 30 minutes, and its token is stored only as a hash.
- After a reset, all of the Parent's sessions are revoked.
- A Parent who cannot recover their account contacts support. Support can verify the Parent and send a new reset link. Support **cannot** set passwords, sign in as the user, or reset child passwords.

### 3.5 Audit events
Each event records:
- event type, timestamp (UTC) and request ID;
- actor account ID and subject account ID, both internal IDs;
- outcome;
- network address, truncated or HMACed.

Events **never** contain passwords, hashes, the submitted username in plain text, child names, or learning content. Retention follows D-28.

| Event | When |
|---|---|
| CHILD_CREDENTIALS_CREATED | The Parent creates the child's sign-in |
| CHILD_PASSWORD_RESET | The Parent resets the password |
| CHILD_SESSIONS_REVOKED | All sessions are revoked, either on reset or through "sign out of all devices" |
| CHILD_LOGIN_FAILED | A failed sign-in to an **existing** child account. Failures against unknown usernames are counted only as anonymous rate-limit metrics. |
| CHILD_LOCKED | The 5th failure locks the account. The parent email is triggered at most once per lock period. |
| CHILD_UNLOCKED | Either automatic (by the system) or early (by the Parent) |
| CHILD_LOGIN_SUCCEEDED | Successful sign-in. Proposed to keep, so that parents can review sign-in times. |
| PARENT_REAUTH_FAILED / PARENT_REAUTH_SUCCEEDED | Step-up re-authentication |
| RATE_LIMIT_IP_THROTTLED | The per-IP throttle is hit. The address is stored truncated. |

### 3.6 Design change this requires (M-02)
The current M-02 lock state reads "Let's take a break. Your parent has been told…". For a non-existent username that statement would be false. The wording also hints that a real account exists. **Proposed replacement:** "Let's take a break. You can try again in 15 minutes, or ask your parent for help." The email to the Parent still goes out for real accounts, but the screen does not mention it.

### 3.7 Tests required before Phase 2 is accepted
- Lockout triggers at exactly 5 failures and lasts 15 minutes.
- An unknown username produces an identical response and lock behaviour, with timing within tolerance.
- Attempts during a lock do not extend it.
- A reset revokes all of the child's sessions and refresh tokens.
- A reset or unlock is refused, with a generic response, for a Parent without a link to the child, and for a Parent who has not re-authenticated recently.
- Teachers and Super Admins cannot reset or unlock child accounts.
- The audit events are written and contain no forbidden fields.

---

## 4. D-33 / D-34 — Draft exact proposed file list for the bootstrap commit

**Status: DRAFT.** These are not the final file contents. The redacted files have not been produced yet. I will produce them, run every check in §4.4, and show you the final list with sizes and checksums. **I will not commit or push until you approve that exact package.**

### 4.1 Proposed tree (bootstrap only, with no application code)
```
AA-Learning-Portal/
├── README.md                          # AA Pro overview, status "pre-implementation", links to docs
├── .gitignore                         # .env*, node_modules, build output, *.zip, design-reference/originals/
├── .env.example                       # variable NAMES only, empty values (list in G1-06 §6)
├── .gitattributes                     # LF line endings; PDF as binary
├── SECURITY.md                        # how to report issues; no secrets in Git
├── docs/
│   ├── requirements/
│   │   └── AA_Pro_FRD_v1.1.<ext>      # FRD, unchanged; SHA-256 recorded
│   ├── decisions/
│   │   └── G1-05_Decision_Register.md # latest approved version
│   ├── audit/
│   │   ├── AA_Pro_Phase0_Audit_Report.md
│   │   ├── G1-00 … G1-04, G1-06 … G1-08 (.md)
│   └── design/
│       └── DESIGN-CANVAS.md           # link + list of APPROVED boards only (empty until D-32)
├── design-reference/
│   ├── README.md                      # "derived, redacted, reference only, not production code"
│   ├── ORIGINAL_CHECKSUMS.sha256      # SHA-256 of both ZIPs and every inner file
│   ├── ORIGINAL_INVENTORY.md          # file inventory of the originals (paths/sizes), no content
│   └── stitch-selected/
│       ├── DESIGN.md                  # unchanged (contains no names)
│       ├── S01_student_dashboard_my_learning_space.redacted.html
│       ├── S09_zip9_mobile_dashboard.redacted.html
│       ├── S11_student_schedule_calendar_view.redacted.html
│       ├── S12_class_schedule_2.redacted.html
│       ├── S13_book_a_class_1.redacted.html
│       ├── S14_book_a_class_2.redacted.html
│       ├── S15_ai_classroom_2.redacted.html
│       ├── S16_ai_classroom_1.redacted.html
│       ├── S17_learning_library_1.redacted.html
│       ├── S18_learning_library_2.redacted.html
│       ├── S19_parent_dashboard_family_learning_hub.redacted.html
│       ├── S20_parent_mode_book_human_teacher.redacted.html
│       └── S21_teacher_dashboard_schedule_hub.redacted.html
├── scripts/
│   └── check-banned-strings.mjs       # fails CI on banned brand strings / identifying data
└── .github/
    └── workflows/ci.yml               # banned-string check + secret scan (lint/test/build added in Phase 1)
```
The FRD file extension is confirmed when the package is prepared.

Rule names such as "Lumina" inside the redacted Stitch files are kept as historical evidence, so the banned-brand check excludes `design-reference/stitch-selected/` for brand strings only. The identifying-data check runs on **every** file, including that folder.

### 4.2 Excluded and never committed
- Both original Stitch ZIPs, and any extracted original file.
- Every Stitch `screen.png` screenshot.
- `.env` and any real credentials, tokens or keys.
- Real child or student data.
- Duplicate project-root copies of the G1 docs (only the latest `claude/` versions go in).
- The design canvas source files: they remain an artifact until D-32 approval.

### 4.3 Redaction approach (for each selected HTML)
1. Start from the untouched original. Record its SHA-256 in a header comment: `<!-- REDACTED DERIVATIVE of <path> sha256=<hash>; reference only -->`.
2. Replace the identifying demo data with synthetic equivalents:
   - demo child names → Kiran / Meera;
   - family surname → removed;
   - teacher names → Teacher A. Rao, Teacher B. Iyer, Teacher C. Das;
   - the real school name → "Sample Primary School";
   - school email domains → `example.com`;
   - phone numbers → removed;
   - Zoom meeting IDs, passcodes and links → `[meeting link placeholder]`.

   The full list of search terms is kept **outside Git**, in the local working notes, so the repository does not itself list the identifying values. CI instead checks a list of SHA-256 hashes of those terms.
3. Replace hot-linked external images, such as `lh3.googleusercontent.com` avatars, with a neutral placeholder. This also stops the files from fetching third-party content.
4. Change nothing else: layout, classes, tokens and brand strings stay as they are, so the files remain a faithful design reference.
5. Re-scan every redacted file. The target is zero hits for any identifying term, any email outside `example.com`, phone-number patterns and Zoom URL patterns.

### 4.4 Validation I will run and report before asking for approval
- `git status` and `git ls-files`, with the exact staged list compared against §4.1.
- A secret scan (gitleaks or an equivalent): expected 0 findings.
- The identifying-data scan across all staged files: expected 0 hits.
- The banned-brand scan, outside `design-reference/stitch-selected/`: expected 0 hits.
- No file over 5 MB; no `.zip` or `.png` from Stitch; no `.env` file.
- SHA-256 of the FRD, matched against the recorded value `ad4b081b…`.
- `ORIGINAL_CHECKSUMS.sha256` re-verified against the originals.
- The proposed commit message, author identity and target (`origin main`).

The output of all of these goes into the approval request. A failed check is reported as a failure, not fixed silently.

---

## 5. A-01 — Project instruction file

**What exists (verified 14 Oct 2026):**
- There is **no `CLAUDE.md`**: none in the repository (which contains only `.git`), in `/home/claude/` or in `~/.claude/`.
- The only instruction file in force is the **project-settings text** of "AA Pro Learning Platform": the "Master Project Instruction" plus the "Official Product Branding — AA Pro" section.
- I cannot edit the project settings. Only you can paste the replacement text.

**Preservation:** the current text is saved verbatim, without edits, as `claude/Archived_Project_Instructions_v1.md`, so nothing is lost when you replace it.

**Proposal:** `claude/Proposed_Project_Instructions_v2.md` (now **v2.1**). It ends with a table showing each change from v1. The main changes:

| Current text says | Proposed text says | Basis |
|---|---|---|
| "Lumina Learn" product identity (§2) | AA Pro only; the AI Tutor is an integrated AA Pro capability | OC-01 |
| Three roles | Four roles plus an external invitee; Super Admin limited to the approved scope | FRD, OC-21 |
| Google Classroom in scope (§7, §8, Phase 6) | Deferred, together with payments, SMS, calendar sync, OCR and study cards | OC-03 |
| Directory `Childrens-AI-Learning-Portal` | Repository `sinharomesh-cpu/AA-Learning-Portal`; directory `AA-Learning-Portal` | OC-08, OC-18 |
| Only "do not modify P4B website" | Full two-way separation from P4Bpay.com | OC-07 |
| No commit or deployment gates | Explicit approval gates for commits, pushes and deployments | OC-09, OC-10, D-34 |
| No AI session rules | 15/30-minute sessions on 15-minute boundaries; one active AI session per child; enforced on the server | OC-22 |
| No child sign-in rules | Credentials managed by the Parent; 5 attempts then a 15-minute lock; no disclosure that an account exists; spec D-23a | OC-23 |
| Stitch export path and three-role screen list | Stitch is a read-only reference; only redacted copies go in Git | OC-14, OC-20 |
| Classroom Phase 4, Notifications 5, Google Classroom 6, Zoom 7 | Phase order per the G1 plan, without Google Classroom | FRD §17 |

**After you paste the new text,** tell me. I will re-read the project settings and confirm that they match the approved v2.1 word for word.

---

## 6. A-03 — Protecting `main` (apply after the first commit)

**Do not apply these yet:** status checks can only be selected after the CI workflow has run at least once. I will not change any repository setting without your explicit authorisation. These steps tighten security only; none of them weakens a setting.

**Check first.** Branch protection and rulesets on a **private** repository owned by a personal account need **GitHub Pro** (or Team/Enterprise). I have not verified your plan. If the account is on GitHub Free, the options are to upgrade to Pro, to move the repository into an organisation on Team, or to rely on process discipline until then. In no case should the repository be made public.

**Steps** (GitHub → repository → Settings):
1. **Rules → Rulesets → New branch ruleset.**
   - Name: `protect-main`.
   - Enforcement: **Active**.
   - Bypass list: **empty**, so not even the admin can bypass.
   - Target: **default branch** (`main`).
2. **Rules to enable:**
   - **Restrict deletions.**
   - **Block force pushes.**
   - **Require linear history.**
   - **Require a pull request before merging:**
     - required approvals: **0 while you are the only maintainer (D-36)**, then 1 when a second reviewer exists;
     - dismiss stale approvals on new commits;
     - require conversation resolution.
   - **Require status checks to pass**, with "require branches to be up to date" enabled. Add each check as it first appears: `banned-strings`, `secret-scan` (from the bootstrap), then `lint`, `typecheck`, `test` and `build` (added in Phase 1).
   - *Optional:* **Require signed commits.**
3. **Actions → General:**
   - workflow permissions: **Read repository contents**;
   - do not allow Actions to create or approve pull requests.
4. **Code security:**
   - enable **Dependabot alerts** and **Dependabot security updates**;
   - enable **Secret scanning and push protection** if your plan offers it for private repositories (verify availability);
   - CI runs its own secret scan either way.
5. **Collaborators:** keep access to the minimum. Do not add deploy keys yet.
6. **Verification**, with your authorisation:
   - I read the ruleset back with `gh api repos/sinharomesh-cpu/AA-Learning-Portal/rulesets` (read-only) and confirm that every rule above is present;
   - you confirm in the GitHub UI that a direct push to `main` is rejected.

From then on all work goes through feature branches and pull requests. No pull request is merged without passing checks and your review.
