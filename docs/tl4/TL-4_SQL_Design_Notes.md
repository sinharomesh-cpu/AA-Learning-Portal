# TL-4 (moving a confirmed lesson): SQL design notes, for review before the migration is written

**Status:** a local working note, 31 Oct 2026. It is the first step of the TL-4 SQL task.
- **Not pushed.** There is no migration file yet.
- **Base:** `main` `379701a`. The migration number is to be confirmed at review (recommended 0036, after TL-5's 0035).
- **Sources:**
  - Decision Pack §5: D-TLS-4 option A and sub-points 1–8, approved in principle;
  - Clarification Notes §B.1–§B.4: B.1–B.3 approved in principle, plus the owner's condition that the commit-time check is two-way.

## 1. How a change is represented (reusing TL-3, not a new lesson type)
- **A change is a lesson row with `replaces_lesson_id`,** pointing at exactly one confirmed lesson. It is never a separate booking:
  - **a parent's change** is a row with status `requested` and `requested_by` = the parent. Request rules apply: the teacher's usual times, the 30-minute grid, and the teacher accepts;
  - **a teacher's change** is a row with status `proposed`. Proposal rules apply: any 5-minute start, and a parent accepts.
- **The new column `replaces_lesson_id`** (uuid, references lessons, nullable) is set only at insert and never changes. The replacement must have the same teacher, child and subject as the original.
- **One open change per lesson:** a unique partial index on `replaces_lesson_id` for open statuses (`requested`, `proposed`), and a unique partial index on `replaces_lesson_id` for `confirmed`, so an original has at most one replacement.
- **Valid only on a confirmed, future original:** the original must be `confirmed`, without an outcome, and at least 30 minutes before its start. That is checked at insert and again at acceptance.

## 2. Time rules (B.1)
- **New time:** at least 24 hours after the change is proposed, and at most 4 weeks ahead. Never over another confirmed lesson. The **original itself is excluded** from the overlap check, so moving a lesson to a nearby time is possible.
- **Reply deadline:** the earliest of the proposal time + 48 hours, the new start − 2 hours, and **the original start − 30 minutes**.
  - 0029's `lessons_deadline` CHECK sets the deadline to an exact formula, so it is widened **only for change rows** (`replaces_lesson_id IS NOT NULL`) to allow the earlier time. The trigger sets the exact value.
  - Every existing row keeps the exact 0029 rule.
- **Expiry:** an unanswered change expires through the existing sweep, and **the original stays confirmed.**

## 3. Price (B.2)
- **A new snapshot for the new time,** worked out exactly as for a request or proposal (`lessons_price_for`), and never changed afterwards.
- **The original keeps its own price** as history.
- **The application** shows both prices when the change is reviewed and accepted. That is UI work, not part of this migration.

## 4. The swap at acceptance (B.3), in one transaction
- **When a change row becomes `confirmed`**, the same BEFORE UPDATE trigger:
  1. takes the time locks (teacher, then child; as 0034);
  2. locks the original row (`FOR UPDATE`);
  3. checks the original is still `confirmed`, has no outcome, and is at least 30 minutes away;
  4. **closes the original as `cancelled`, `closed_by = 'aa_pro'`, `close_reason = 'rescheduled'`.**
- **Ordering:** because the original is closed before the replacement row is written, 0029's no-overlap rules see the original as cancelled. The replacement is then checked against every other confirmed lesson.
- **Side effects that already exist:**
  - **0030's** `lessons_drop_link_on_cancel` deletes the original's meeting link (D3A-8);
  - **0033's** `lessons_close_material_requests` closes the original's open material requests as "no longer needed".
- **The status-fields rule** gains one branch: a `cancelled` lesson with `close_reason = 'rescheduled'`, `closed_by = 'aa_pro'`, and `closed_at` at least 30 minutes before its start.

## 5. The commit-time two-way rule (the owner's condition)
A `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `lessons` refuses to commit unless:
- **for every lesson closed as `rescheduled` in this transaction:**
  - exactly one row has `replaces_lesson_id` = that lesson;
  - that row is `confirmed`, was confirmed **in this transaction** (`confirmed_at = now()`), and has the same teacher, child and subject;
- **for every row confirmed in this transaction with `replaces_lesson_id` set:**
  - the lesson it points at is `cancelled` with `close_reason = 'rescheduled'`;
  - it was closed **in this transaction** (`closed_at = now()`), with the same teacher, child and subject.

**It follows only the explicit link.** An unrelated confirmed lesson can never satisfy it, and a half-done swap in either direction can't commit.

## 6. Chapters and material requests (sub-point 5, approved in principle)
- **Approved rule:** copied to the new lesson at acceptance, labels unchanged; the originals stay with the old lesson as history.
- **What the SQL needs:**
  - 0032 and 0034 allow chapter rows only in the transaction that creates a request or proposal, or when a teacher accepts a request. So this migration needs **one new, narrow path:** a copy of the original's chapter rows, with the **same source, label and intent**, made only by the swap, in the same transaction.
  - The original's **open** material requests are closed by 0033's trigger. **The proposal for the SQL** is that the swap recreates each open request on the new lesson with the same content, so it stays open. Answered requests stay with the original as history.
- **Two sub-decisions** are listed in §8 so they aren't decided silently.

## 7. Tests to write (on throw-away databases)
- **Fault injection:** a forced error after the original closes; a forced error after the replacement confirms. In both, the original is still confirmed and nothing is half-changed.
- **The two-way rule:**
  - a hand-written "rescheduled" without a replacement is refused at commit;
  - a replacement confirmed without its original closed is refused;
  - an **unrelated** confirmed lesson with the same teacher and child does not satisfy the rule;
  - a replacement pointing at an original closed for another reason is refused;
  - a second replacement for one original is refused.
- **Races:**
  - swap against cancellation of the original;
  - swap against acceptance of another overlapping lesson;
  - two parents accepting at once;
  - accept against withdraw;
  - swap against a TL-5 or other sweep.
  
  Each must show the second party really waited (the method used for TL-5).
- **Boundaries:** the 30-minute cut-off against the original (database clock); the 24-hour and 4-week rules; the 48-hour, 2-hour and 30-minute deadline.
- **Unchanged rules:** every TL-3 and 0029 test still passes. The new branches don't alter existing rows or functions beyond the documented additions.

## 8. Points to confirm (proposed defaults; the SQL will follow them unless changed)
1. **Open material requests at a swap:** recreate them as open on the new lesson (proposed), or let them close as "no longer needed" and let the teacher ask again.
2. **Counting changes against the open limits** (10 open requests per parent; 10 open proposals per teacher and child): proposed **yes**, counted like any request or proposal, so there is no new loophole.
3. **The child's view of the original after a move:** the original disappears from the child's schedule (cancelled lessons aren't shown today), and only the new lesson appears. No change to child screens.
4. **Rollback policy for this migration:** proposed **the same as TL3-6 Option D** (forward-fix and restore point, no rollback script), because a rollback would remove move history. **This needs your choice;** the alternative is a guarded rollback script, as for 0035.
