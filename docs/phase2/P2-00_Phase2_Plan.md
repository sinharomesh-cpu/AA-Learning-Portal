# AA Pro — P2-00 Phase 2 Plan: Sign-in, accounts and permissions

**Version:** 1.0 · 14 Oct 2026 · **Status:** for owner approval · **Baseline:** FRD v1.1 + change request CR-01 (OC-36)
**Decisions this plan relies on:** OC-21, OC-23, OC-35 (D-23a, D-37), OC-36 (D-09, parent-added teachers), OC-37 (D-11b).

## 1. What Phase 2 delivers, in plain words

At the end of Phase 2, AA Pro has **real accounts** instead of the sample "pick a person" sign-in:

- **Parents** register with their email, confirm it, sign in, reset a forgotten password, and create their children's accounts.
- **Children** sign in with the username and password their parent set. Five wrong tries lock the account for 15 minutes; only the parent can unlock it or reset the password.
- **Teachers** either sign up themselves or are **added by a parent**. Either way, a Super Admin must approve them before they can sign in. A teacher only sees the children a parent linked them to.
- **Two Super Admins** sign in with a password plus a code from a phone app (MFA). They approve teachers, manage accounts and read the audit log. They can never see children's learning content or sign in as someone else.
- Every page checks on the server **who is asking and whether they are allowed**, using the database rather than the sample data.

It still uses **test data only**. Nothing is stored about real children until D-28 (where data is kept) is decided and a launch is approved.

## 2. How it will be built (technical approach)

| Topic | Choice | Why |
|---|---|---|
| Database | PostgreSQL 16 | It is in the master instructions. It runs locally and in CI with no outside account. |
| Database access | `postgres` 3.4.9 driver with plain SQL migrations | It is small and clear, and adds no heavy framework. |
| Sign-in system | Built into the app, following G1-08 §3 exactly | The approved rules need things hosted sign-in services do not offer well: child accounts with no email, the same lock on unknown usernames, and Argon2id hashing. |
| Password hashing | Argon2id via `@node-rs/argon2` 2.2.2 | Uses the OWASP baseline parameters (OC-35). |
| Breached-password check | An offline list shipped with the app | No password ever leaves the server (OC-35). |
| Admin MFA | Time-based codes from an authenticator app (`otplib` 13.5.0) | It is the standard method and works with Google Authenticator and similar apps. |
| Sessions | Stored in the database, in an HttpOnly, Secure cookie | They can be revoked at once, for example after a child password reset. |
| Emails | Written to an **outbox** in the database | Nothing is really sent until an email provider is approved (A-02). In development and tests, a local mailbox page shows each email. |
| Input checks | `zod` 4.6.7 on every form and server action | All inputs are validated on the server. |

Versions were checked on npm on 14 Oct 2026 and are re-confirmed before installation. No other new dependencies are planned.

**Hosted database.** None is needed to build and test Phase 2. A hosted test environment is proposed at the end of the phase (WP2-9) and needs its own approval, together with D-28.

## 3. New screens needed for your rule OC-36

These designs do not exist yet. I will add them to the design canvas for your approval **before** building them (the same process as P19/P21):

| Board | Screen | Contents |
|---|---|---|
| 57 | **Parent · My teachers** (desktop, phone) | The parent's teachers, each with a status (Waiting for approval, Active, Not approved) and the children linked to them. Change children; remove the teacher. Adds a "Teachers" item to the parent menu. |
| 58 | **Parent · Add a teacher** (desktop, phone) | Teacher name, email, subject, and tick boxes for which children. After sending, it shows either "Waiting for AA Pro approval" or "Added" for an already-approved teacher. |
| 59 | **Teacher · Set your password** | Opened from the email link. Valid, expired and already-used states. Same password rules as other adults. |
| 60 | **Admin · Approval queue update (M-29)** | Shows "Added by a parent" and the parent's masked email. No child names (OC-21). |
| 61 | **Emails** | "A parent added you to AA Pro"; "You're approved — set your password"; parent told "approved" or "not approved"; existing teacher told "a parent linked you". |

The one-lesson invitation without an account (M-11) stays as it is and is built in Phase 6.

## 4. Work packages

Each work package is a pull request. It is merged by me after all automatic checks pass (OC-32).

| WP | Delivers | Screens |
|---|---|---|
| **WP2-1** Database foundation | Tables for accounts, profiles, parent–child links, teacher–child links, invitations, sessions, sign-in attempts, audit events and the email outbox. Migrations, test data and a CI database. | — |
| **WP2-2** Security core | Argon2id hashing, password policy, breached list, sessions, sign-in throttling, audit events, CSRF and origin checks | — |
| **WP2-3** Parent accounts | Registration with email confirmation, privacy and consent notice, sign-in, sign-out, forgotten password, account status pages, account settings | M-01, M-03, M-04/05, M-06, M-34 |
| **WP2-4** Child accounts | Parent creates and edits children; username with random suffix; password shown once; child sign-in with the 5-try lock; parent unlock and reset with step-up | M-02, M-07, M-08 |
| **WP2-5** Super Admin | One-off setup step for the two admins; MFA enrolment and sign-in; accounts list; create, edit and deactivate with a reason; teacher approvals; read-only audit log | M-26/35, M-27, M-28, M-29, M-30 |
| **WP2-6** Teachers | Teacher self-sign-up and profile; account status pages; **parent-added teachers (OC-36)** with set-password links; teacher–child links that the parent controls | M-20, M-21, M-22, boards 57–61 |
| **WP2-7** Email outbox | Every email above written to the outbox, with a local mailbox page for development and tests only | M-32/33 (account emails only) |
| **WP2-8** Real data in pages | All Phase 1 pages read the database through ownership-checked queries. The sample-data sign-in is retired from the main app. | All Phase 1 screens |
| **WP2-9** Review and hand-over | An independent security review by a separate reviewer that has not seen the build, accessibility checks, a test-environment proposal and the completion report P2-01 | — |

**Order:** WP2-1 and WP2-2 come first. WP2-3 to WP2-6 build on them. Boards 57–61 are drawn in parallel and must be approved before WP2-6 builds them.

## 5. What happens to the online preview

The current Vercel preview shows the Phase 1 sample-data prototype. Once WP2-8 retires the sample sign-in, new versions of the main code need a database.

- **Before that merge**, I will create a branch `preview/phase1` frozen at the Phase 1 prototype, so the current preview can stay as it is.
- You will be asked to change one setting in Vercel (Settings → Git → Production Branch: `preview/phase1`), with screenshots-level instructions.
- A preview of real sign-in needs a hosted test database. That is proposed in WP2-9 for separate approval.

## 6. Acceptance criteria (Phase 2 is done when all pass)

1. Every rule in G1-08 §3 is covered by an automated test, as listed in its §3.7. This includes:
   - the same response and timing for unknown usernames;
   - the lock on the 5th failure, with no extension while locked;
   - a parent reset revokes all of the child's sessions;
   - only the linked parent can unlock or reset a child.
2. Password policy (OC-35): ≥ 12 / ≥ 8 / ≤ 64 characters, a breached password is refused, and passphrases with spaces are accepted.
3. Super Admin (OC-21, OC-37): MFA is required. The admin cannot open child content, cannot impersonate anyone, and cannot reset child passwords. Every admin action is in the audit log.
4. OC-36:
   - a parent-added teacher cannot sign in before approval;
   - the set-password link is single-use and expires;
   - no password is ever emailed;
   - the teacher sees only the ticked children;
   - removing a child from the teacher ends the teacher's access at once;
   - an existing approved teacher is linked straight away.
5. Isolation tests:
   - a parent cannot reach another family's child;
   - a teacher cannot reach an unlinked child or another teacher's calendar;
   - a child cannot reach a sibling's data.

   Each case is tested by direct URL and by changing request values.
6. No password, token or child data appears in logs, emails (other than the intended content), audit records or the repository.
7. All CI checks pass, plus a new database-backed integration test job.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Building sign-in ourselves is security-critical | Proven libraries for hashing and MFA; every rule turned into a test; an independent security review in WP2-9 before Phase 2 is closed |
| Emails cannot really be sent yet | The outbox shows exactly what would be sent. A real provider is a separate approval (A-02). |
| The school network shares one IP for many children | The per-IP limit is generous (G1-08 §3.2) and is monitored |
| Lost admin MFA phone | Two admins (OC-37); one can reset the other's MFA, and this is audited |
| The hosted preview breaks when sample sign-in is retired | The `preview/phase1` branch and one Vercel setting (§5) |
| D-28 still open | Phase 2 uses test data only; D-28 is required before any real data |

## 8. Not in Phase 2

- Real bookings and calendars (Phase 3).
- AI classroom (Phase 4).
- Uploads (Phase 4).
- Zoom and the M-11 one-lesson invitation (Phase 6).
- Real email or WhatsApp sending (Phase 7).
- Google Classroom.
- Any production deployment.

## 9. What I need from you

1. **Approve this plan** (or tell me what to change).
2. Later in the phase: approve boards 57–61 when I show them.
