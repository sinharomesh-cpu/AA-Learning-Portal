# TL-4 application layer: moving a confirmed lesson

**3 Nov 2026.** Builds on the TL-4 database layer (`db/drafts/tl4_lesson_changes.sql`, PR #142).
- Development authorised by the BA sign-off of 2 Nov 2026, 22:57 IST.
- Continued in parallel with the PO's conditional reservation of migration number 0036 (3 Nov 2026, 13:24 IST).

The business rules are Evidence Pack 4.3 §4; they are not changed here.

## Until the TL-4 SQL is applied
The TL-4 SQL is **not applied on any shared database**. `lessonChangesReady()` checks the schema: the `lesson_reschedules` table and the `lessons.replaces_lesson_id` column.

While they are absent:
- no "Move lesson" button is shown;
- the move pages say the feature isn't available yet;
- every move action is refused as `unavailable` before anything is written;
- the Family calendar keeps the old wording ("cancel it and request a new time").

Queries that read TL-4 columns go through `to_jsonb(row)`, so they work on either schema. TL-2 and TL-3 behaviour is unchanged.

## What a move is
A move is an ordinary lesson request or proposal whose `replaces_lesson_id` names the confirmed original.

| Who | How | Rules |
|---|---|---|
| Either active parent of the child | Family calendar → **Move lesson** → a free time → **Ask to move** | Request rules: the teacher's usual times on the 30-minute grid, the same length. May overlap the original (rule 4) |
| The lesson's own teacher, while linked | My schedule → **Move lesson** → day, time, length, optional planned chapters → **Send new time** | Proposal rules: any 5-minute start. Overlap with the original: see DEF-TL4-07 |
| The child | Never | — |

Common rules:
- The original stays booked until the other side accepts.
- One open move per lesson. A move past its deadline is recorded as expired, with its notices, when a new one is started.
- A move can't be offered within 30 minutes of the original's start.
- A move counts towards the existing limits (AC-20): 10 open requests per parent, and 10 open proposals per teacher and child.
- **Chapters (Q-B):**
  - if the move names no chapters, the original's chapters are carried at the swap (C1);
  - if it names its own, those are used (C2);
  - the teacher can't add planned chapters while accepting a parent's move.

## Accepting
- The teacher accepts a parent's move with the existing **Accept** in Requests to answer.
- A parent accepts a teacher's move on the existing booking-details page. The dialog is titled "Move the lesson to this time?".

The acceptance locks, in this order:
1. the teacher–child link;
2. the original and the change, together (`lessons_lock_pair`, lower id first);
3. the change row.

It then confirms the change, and the database swap does the rest:
- the original closes as *Moved*;
- chapters and open material requests are carried;
- the swap record and the request mapping are written.

After the swap, the application:
- drops the original's reminder;
- writes one `LESSON_MOVED` audit event;
- sends one **lesson moved** notice.

If the swap refuses, nothing is committed and the change stays open. The refusal is shown in words (`src/lib/moveText.ts`):

| Database refusal | Reason | Shown as |
|---|---|---|
| `material_request_unmappable` | `move_unmappable` | A material request is about a chapter that isn't on the new lesson |
| `material_request_limit` | `move_limit` | More than 5 open material requests on the new lesson |
| `material_request_parent_limit` | `move_parent_limit` | A parent would have more open requests than allowed |
| original cancelled or changed | `original_changed` | The lesson was cancelled or changed meanwhile |
| too close to the start | `too_soon` | Must be answered at least 30 minutes before the lesson |

## What people see
- **Parents and teachers:**
  - a pending move on the booked lesson ("waiting for an answer; stays booked");
  - "A new time for the lesson booked on …" on the change;
  - "Moved from …" on the replacement;
  - "Moved" and "Moved to …" on the original;
  - "Moved to the new lesson" on a carried material request.
- **The child (D3, AC-25):** only confirmed lessons, as before. The original disappears and the replacement appears; there is no "moved" wording.
- **Notices** (in-app only; a teacher's never names the child):
  - `lesson_change_requested` and `lesson_change_proposed` (action);
  - `lesson_change_declined`, `_withdrawn`, `_expired` and `_closed`;
  - one `lesson_moved`.
  - There is no "material requested" or "no longer needed" notice for carried requests.

## Defects and open points (not decided here)
| ID | Severity | Rule / AC | Description | Status |
|---|---|---|---|---|
| DEF-TL4-05 | Non-critical | AC-20 | Changes counting towards the 10-limits was not tested | **Closed:** `tl4App.test.ts` AC-20 |
| DEF-TL4-07 | Minor | Rule 4 (overlap; the original excluded) | A **teacher's** move that overlaps its own original is refused as busy by 0034's proposal insert rule, which the TL-4 SQL leaves unchanged. A parent's move may overlap (0029 checks overlap only at confirmation, after the swap closed the original) | **Escalated for the technical review of #142.** Fixing it needs SQL (0034's function body or a TL-4 trigger). Pinned by a test |
| DEF-TL4-08 | Minor | Rules 1 and 6 | If the original is cancelled (by a parent, the teacher, or AA Pro) while a move is open, the move stays open until it expires. Accepting it is refused ("cancelled or changed meanwhile") and nothing changes. There is no close reason for "the original was cancelled", so it can't be closed at once | **Needs a decision:** close at once (new close reason, SQL) or leave to expire |
| DEF-TL4-09 | Minor | TL-3 owner acceptance (review step) | A teacher's move has no "Review proposal" price step; the parent sees the new price before accepting | **Open question:** is the TL-3 review step required for moves? |
| Note | — | PO-D6 to D8 | One-for-one carrying makes the swap's effect on any parent's count zero, so the per-parent rule never refuses in practice. The refusal is still mapped and tested | Information |

## Tests
- `tests/db/tl4App.test.ts`:
  - both schemas: without the TL-4 SQL (shared test DB) and with it (its own throw-away DB);
  - authorisation: unrelated parent, unlinked teacher, another family's teacher, a child account;
  - one open move; too soon; not movable;
  - the swap from both sides; decline and withdraw;
  - refusal mapping; AC-20; AC-25;
  - notices: carried requests send none;
  - DEF-TL4-07 pinned.
- `tests/real/lessonMoves.spec.ts`:
  - the "unavailable" path runs on every database;
  - the full journey runs only where the TL-4 SQL is applied, so CI skips it until the migration exists.
