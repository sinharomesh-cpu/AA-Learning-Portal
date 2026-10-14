# AA Pro — G1-07 Design Review Round 2: Change Log

**Date:** 14 Oct 2026 · **Canvas:** "AA Pro — Missing Screens (G1 Review)" · **Status:** PROPOSED — NOT APPROVED (D-32 open). No application code, commits or deployments.

## 1. Your ten review points and what was done

| # | Request | Action | Verified how |
|---|---|---|---|
| 1 | Fix invalid error colour `#balala` | No such value existed. The token is `error` `#BA1A1A` (FRD/Stitch DESIGN.md), misread because the old label used lowercase sans-serif. All hex codes are now uppercase monospace. A central token list and contrast table were added (Tokens board). `#BA1A1A` is 6.46:1 against white in both directions. | Source search found 0 occurrences of "balala"; contrast computed with the WCAG formula |
| 2 | AA Pro umbrella brand; no Lumina / P4Bpay.com | Confirmed: no Lumina, Lumi or P4Bpay content on any board. AI Tutor is shown as an AA Pro capability. | Automated text scan of all 52 boards. The only matches are "removed" or "not allowed" notes |
| 3 | Undecided rules stay pending | M-09 limits made inactive ("Pending D-05"). Teacher cancel disabled ("pending D-07") on M-23 and M-24. Join timing marked "pending D-35" on M-10, M-19, M-24 and S1. "Always on" failure alerts removed (M-12). "2 of 3" retry count removed (M-13). Duplicate-upload handling labelled "proposed" (M-14). AI lengths marked as proposed D-06. | Source review |
| 4 | Role permissions on every screen | Role check per screen on the Traceability board. One ambiguous child-facing "Cancel" (classroom connecting state) renamed "Stop connecting". Integration Health removed from Super Admin menus. | Automated scan of 14 student boards for upload, cancel, reschedule and teacher-booking actions: none found (only explanatory text) |
| 5 | Detailed designs, mobile and states | New "Common states & access denied" page: loading, empty, error, success, offline, and role-specific access denied, on desktop and phone. 9 new phone boards: M-01, M-07, M-10, M-14, M-17, M-19, M-23, M-27, plus S13 mobile. | Board inventory below |
| 6 | Map to G1-03 briefs and FRD | Traceability board: every screen → brief → FRD v1.1 references, offered actions, forbidden actions, states, mobile. | Source review |
| 7 | M-31 deferred | Red "DEFERRED — outside v1 scope" banner; removed from v1 menus; recorded as OC-19. | Source review |
| 8 | Tokens, type, contrast, targets, focus, status labels | **Two genuine issues found and fixed on all boards:** control borders `#BFC7D2` were 1.71:1 (now `#707881`, 4.48:1), and there was no focus ring (now 3 px `#006194`, 2 px offset). Type scale (12 px minimum), 48/56 px targets and worded status labels are documented on the Tokens board. | Contrast computed; source check confirms focus style and border change on every board |
| 9 | Show S1, S9, S13 alongside | New "Canonical student screens" page: AA Pro adaptations of S1 (desktop), S9 (mobile), S13 (desktop and mobile), applying DEV-01, DEV-02 and DEV-04. The original Stitch files are unchanged. | Board inventory |
| 10 | Keep "Proposed — Not Approved" | Red label on every board, including all phone boards, plus a top banner on the read-me. | Automated check: label present on all 52 boards |

## 2. Board inventory after round 2 (52 boards, 9 pages)

- **Overview (4):** Read me · Tokens & accessibility · Traceability & role check · Change log.
- **Canonical student screens (4):** S1 desktop · S9 phone · S13 desktop · S13 phone.
- **Common states (2):** desktop · phone.
- **Sign-in & system (7):** M-01 (+phone) · M-02 (+phone) · M-03 · M-04/05 · M-06.
- **Parent (12):** M-07 (+phone) … M-15, with phone boards for M-07, M-10, M-14.
- **Student (8):** M-16 (+phone), M-17 (+phone), M-18 (+phone), M-19 (+student phone).
- **Teacher (6):** M-20/22, M-21, M-23 (+phone), M-24, M-25.
- **Super Admin (7):** M-26/35, M-27 (+phone), M-28, M-29, M-30, M-31 (deferred).
- **Messages & settings (2):** M-32/33, M-34.

## 3. Checks performed (and not performed)

**Performed (on source files):**
- every board in the index exists and is published;
- HTML tags balanced on all 52;
- focus style on all 52;
- no low-contrast control borders remain;
- "PROPOSED" label on all 52;
- banned-string scan;
- student forbidden-action scan;
- contrast ratios computed for 19 colour pairs.

**Not performed:**
- visual rendering or screenshots of the boards;
- screen-reader or keyboard walk-throughs;
- axe automated testing.
These need a running build (Phase 1). Frame heights on the canvas are estimates.

## 4. Decisions changed this round

- **OC-19 (new, owner):** M-31 Integration Health deferred, outside v1 scope.
- **D-35 (new):** join-window timing for human meetings. Recommended: 10 minutes before start until the scheduled end.
- **D-11:** narrowed to the remaining Super Admin scope.

## 5. Still unresolved

D-32 design approval · D-33 Git approach · D-34 bootstrap commit · D-05 · D-06 · D-07 · D-08 · D-09 · D-11 (remainder) · D-15 · D-16 · D-17 · D-22 · D-23 · D-24 · D-25 · D-26 · D-28 · D-35 · D-01a (non-blocking).
