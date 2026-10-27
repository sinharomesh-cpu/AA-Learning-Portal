# CR-18 — Student subject cards open subject content in the Library

**Version:** 0.1 · 27 Oct 2026
**Status: Analysed. Implementation not authorised.** BA review: investigation and preferred approach accepted (Mateusz, 27 Oct 2026, 21:35 IST). Owner decisions SL-D1 to SL-D5 are **pending**. Recording this entry does not approve the feature for implementation.
**Area:** Student portal, Child Dashboard (S1 desktop, S9 phone) and Learning Library (S17, S18).
**Baseline inspected:** `main` @ `3defe306c1302b14e43c3433e8715ac87631ea4b`.

**Source documents** (owner's project documents, not stored in this repository):
- `claude/Student_Subject_Card_vs_Library_Gap_Analysis.md` (27 Oct 2026) holds the full evidence, gap register, Gherkin acceptance criteria, test matrix, options and traceability.
- `Student_Subject_Card_Library_Addendum_A1.md` (27 Oct 2026, with §11 history) holds the decisions, invalid-value handling, chip rule and CI evidence rule.
- Where this entry and the sources differ, the sources are the detail and this entry is the summary.

Labels used below: **[F]** verified from source code; **[I]** inference; **[R]** recommendation; **[O]** owner decision.

## 1. Current gap ([F], at `3defe30`)

| ID | Gap | Location |
|---|---|---|
| G-1 | Every subject card on the student dashboard links to the general Library | `src/app/student/page.tsx:141` (`href="/student/library"`) |
| G-2 | The Library cannot be narrowed by subject. FRD FR-014 ("browse authorised resources by subject/chapter/type/source") and the S17/S18 subject chips are not delivered for parent books | `src/app/student/library/page.tsx:16` (no `searchParams`) |
| G-3 | Real-account subject cards always say "No book assigned yet", even when books are assigned | `src/app/student/page.tsx:36` |
| G-4 | No subject-specific empty state | `src/app/student/library/page.tsx:35–38` |
| G-5 | The RTM marks FR-014.1 "Merged", but subject filtering of parent books is absent. A correction is proposed (A1 §7); the RTM is **not** edited by this entry | project RTM, 24 Oct 2026, row FR-014.1 |
| G-6 | No test covers subject navigation or filtering (T-LIB-02 has no test) | `tests/` |

Related items that stay **outside** this change: L-1 to L-3 and N-1 to N-4 (gap analysis §3), and SQ-1 (§6 below).

## 2. Requirement

**Preferred approach** (BA-accepted in principle; formal owner decision SL-D3 pending): **Option 1**. Filter the existing Library by subject, at `/student/library?subject=<id>`.

| ID | Requirement | Basis |
|---|---|---|
| FR-SL-1 | A dashboard subject card opens the Library filtered to that subject | [I] implied by S1/S9 and P2-R2 US-04; **SL-D1 pending** |
| FR-SL-2 | The Library shows "All" plus subject chips by the rule in SL-D4 | FR-014; S17/S18 |
| FR-SL-3 | With a subject chosen, only that subject's books and chapters are listed; they open in the existing reader unchanged | FR-014 |
| FR-SL-4 | "All" (the default, and the Library menu item) keeps showing every resource the child is authorised to see, exactly as today | FR-014; BA 27 Oct |
| FR-SL-5 | A chosen subject with no books shows a subject empty state and a way back to All | P2-R2 US-04 |
| FR-SL-6 | Missing or invalid subject values show All (rule in SL-D5) | SL-D5 pending |
| FR-SL-7 | Real-account card text comes from real data, never invented | `SubjectCard.tsx:8`; FRD §7; **SL-D2 pending** |
| FR-SL-8 | Demo mode behaves the same with sample books | — |

**Security** (SEC-SL-1 to SEC-SL-6, gap analysis §5):
- The child comes from the session only.
- Filtering applies **after** the existing server authorisation (`listBooksForStudent`), so it can only **narrow** the authorised list.
- The subject value is allowlisted against the catalogue ids and never reaches SQL or the page unchecked.
- Draft, archived, unassigned and other children's books stay invisible.
- **No change to the existing reader access rules** (`getBookForViewer`).
- Chips: at least 48 px, `aria-current`, keyboard reachable, no horizontal scrolling on phones.

**Constraints:**
- **No database migration is expected.**
- No change to `src/server/books.ts` access rules or to the shared reader page `src/app/books/[bookId]`.
- Reader return defaults to the general Library (SL-D6); browser Back must be verified in testing (T-SL-9).

## 3. Acceptance criteria (summary)

The full Gherkin text is in the gap analysis §6.

| ID | Criterion |
|---|---|
| AC-SL-1 | Selecting the Maths card opens the Library with Maths selected: Maths books and chapters only |
| AC-SL-2 | Library from the menu shows "All": every authorised book |
| AC-SL-3 | A chapter opened from a subject view opens in the existing reader at that chapter |
| AC-SL-4 | A configured subject with no books shows a subject empty state and a link to All |
| AC-SL-5 | Unknown, empty, repeated, wrong-case or malicious subject values show All |
| AC-SL-6 | In every subject view, draft books and a sibling's books are never listed; a direct reader URL for them is refused ("not found") and audited |
| AC-SL-7 | (If SL-D2 approved) card text reflects real assigned books |
| AC-SL-8 | Chips: at least 48 px, keyboard reachable, current chip announced, no horizontal scrolling, no serious axe issue |
| AC-SL-9 | From a subject view, open a book, press browser Back: the same subject is still selected (desktop and phone) |

## 4. Test and release evidence required before any merge

**Tests to add** (T-SL-1 to T-SL-9, gap analysis §7 and A1 §11):
- **Unit:** the subject allowlist, including every invalid case.
- **Component:** the card `href`.
- **Demo e2e:** card to filtered view, invalid value to All, chips accessibility, browser Back.
- **Real-account e2e:**
  - two subjects;
  - a sibling's book and a draft book never shown;
  - direct reader URL refused.
- **Existing DB suite:** unchanged; it proves no access-rule change.

**Negative control:** the new filter tests fail on the current `main` and pass with the change.

**CI** (A1 §8.1):
- `main` has no GitHub branch protection or required checks. "Required" is the project rule.
- Every one of the **10 GitHub Actions jobs** (lint, typecheck, test, build, hosted-demo, db, e2e, e2e-real, privacy-and-brand, secret-scan) **and** the Vercel Preview Comments check must conclude `success`.
- **A job concluding `skipped` or `cancelled` fails the target.** This is separate from the **52 test cases** e2e-real skips by design; that count must match `main` and be reported separately.
- Flaky tests are named.

**Also required:**
- Local and CI results reported separately.
- The exact diff (no migration).
- Screenshots: desktop and phone, light and dark.
- The owner's post-merge test-site check.

## 5. Traceability

| Gap | Requirement | Code | Acceptance | Tests (existing → new) |
|---|---|---|---|---|
| G-1 | FR-SL-1; FR-003.2 (S1 cards); FR-014.1 | `src/app/student/page.tsx:141` | AC-SL-1 | `tests/e2e/shells.spec.ts` (card count only) → T-SL-1 |
| G-2 | FR-SL-2/3/4/6; FR-014.1; S17/S18 | `src/app/student/library/page.tsx:16–28` | AC-SL-1, 2, 5 | none → T-SL-2, T-SL-5 |
| G-3 | FR-SL-7; FRD §7 | `src/app/student/page.tsx:36` | AC-SL-7 | none → T-SL-7 |
| G-4 | FR-SL-5; P2-R2 US-04 | `src/app/student/library/page.tsx:35–38` | AC-SL-4 | none → T-SL-4 |
| G-5 | FR-014.1 (RTM status) | project RTM | — | documentation (SL-D9) |
| G-6 | G1-02 T-LIB-02 | `tests/` | all | → T-SL-1 to T-SL-9 |
| Security | SEC-SL-1 to 5; FR-002.2; OC-79 | `src/server/books.ts:697–748` | AC-SL-6 | `tests/db/books.test.ts` → T-SL-6 |
| Accessibility | SEC-SL-6; OC-121 (48 px chips) | new chips | AC-SL-8, AC-SL-9 | `tests/real/books.spec.ts` axe → T-SL-8, T-SL-9 |

## 6. Decisions

IDs are prefixed `SL-` so they don't clash with the decision register's `D-` numbers. The gap analysis and A1 call them D-1 to D-10.

| ID (report ID) | Decision | Recommendation [R] | Status |
|---|---|---|---|
| **SL-D1** (D-1) | A subject card opens the Library filtered to that subject | Confirm | **[O] Pending owner approval** |
| **SL-D2** (D-2) | Card text | Book title; "and N more" when several; "No book assigned yet" when none. No "current chapter" (no progress data exists, so it would be invented) | **[O] Pending owner approval** |
| **SL-D3** (D-3) | Option 1 (filter in the existing Library) vs Option 2 (new route) | Option 1 (BA-accepted in principle) | **[O] Pending owner approval** |
| **SL-D4** (D-4) | Chip rule | Catalogue order; subjects that are configured **or** have authorised books; a configured subject with no books gets a chip and an empty state; row shown at ≥2 subjects or when one is selected | **[O] Pending owner approval** |
| **SL-D5** (D-5) | Invalid values | Missing, empty, repeated, wrong-case, unknown, non-catalogue or not-allowed values all show All silently; filter only narrows | **[O] Pending owner approval** |
| SL-D6 (D-6) | Return from the reader | General Library (no reader change); browser Back verified by T-SL-9 | BA-accepted as default |
| SQ-1 (D-7) | Books from a parent whose guardian link was revoked stay visible to the child | Separate safeguarding/security question; **no access-rule change here** | Separate, tracked |
| SL-D8 (D-8) | Library label for a chapter-files book whose chapters are all archived (L-1) | Separate small fix | Open, outside this change |
| SL-D9 (D-9) | RTM FR-014.1 status "Merged" → "Partial" (wording in A1 §7) | Approve | Open; RTM not edited |
| SL-D10 (D-10) | GitHub branch protection with required checks | Separate owner decision | Open, outside this change |

## 7. Change history

| Date (IST) | Version | Change | By |
|---|---|---|---|
| 27 Oct 2026, 20:37 | — | Read-only gap analysis requested | Mateusz (BA) |
| 27 Oct 2026 | — | Gap analysis and Addendum A1 delivered | Claude |
| 27 Oct 2026, 21:35 | — | BA review: investigation and Option 1 accepted in principle; SL-D1 to SL-D5 left to the owner; implementation not authorised | Mateusz (BA) |
| 27 Oct 2026, 21:43 | 0.1 | Requirement recorded in the repository as CR-18 (documentation only; no code, RTM, migration or phase-order change) | Claude, on BA request |
