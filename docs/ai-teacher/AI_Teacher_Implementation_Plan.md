# AA Pro AI Teacher — Implementation Plan

> **Update — OC-89 (owner, 17 Oct 2026, 23:41 IST).** These decisions supersede this document where it differs:
> - **Session length:** a single 15-minute session (10 minutes of explanation + 5 of Q&A), at most one per child in any rolling 24 hours. The 30-minute option is withdrawn.
> - **Classroom controls:** "Next Question" is removed; "Give Me a Hint" is kept, student-initiated.
> - **Gemini:** approved in principle **for evaluation only**. Provider eligibility for a children's service is a **release-blocking dependency** (see `AI_Provider_Eligibility_and_Legal_Review.md`).
> - **Test budget:** not yet approved; see `AI_Test_Environment_Cost_Controls.md`.
> - **Session rules:** see `AI_Teacher_Session_Rules.md`.


| | |
|---|---|
| Version | 1.0 (draft) · 17 Oct 2026 |
| Recommended approach | Gemini 3.8 Live on Google Cloud, behind an AA Pro server relay, with the provider-independent session controller |
| Status | Plan only. Nothing beyond the tested controller has been built. Each phase needs owner approval. |

Effort is in **person-days** for one developer, as a range. Estimates are assumptions, not quotes.

---

## 1. Architecture (plain English)

```
Child's browser (AA Pro classroom, S15/S16 design, reader R0–R8)
   │  audio + "raise hand" + events, over AA Pro's own secure connection
   ▼
AA Pro relay server  ── checks sign-in and booking ──► AA Pro database
   │  holds the Google credentials (never sent to the browser)
   │  runs the session controller (phases, queue, policy, end time)
   ▼
Google Cloud Gemini 3.8 Live (voice in, voice out, transcripts)
```

- The browser never talks to Google directly, so the server can cut the lesson at the booked end and no key reaches the browser.
- The relay loads the chapter text only after checking the child may read that chapter.
- The relay keeps no audio and no transcript after the lesson.

---

## 2. Dependencies already on the roadmap

| Dependency | Why | Status |
|---|---|---|
| Real AI bookings in the database (Phase 3) | The controller needs a stored booking with start time, length, child and chapter | Demo only today (`src/fixtures/aiBooking.ts`) |
| Textbook upload, chapters and reader (R2-2 onward) | The tutor teaches the selected chapter; the reader sits beside it | Designs approved; not built |
| Owner decisions OD-1 to OD-12 | Scope, design, legal | Open (see feasibility report §9) |

The proof of concept (Phase A) does **not** wait for these: it uses a synthetic booking and a synthetic sample chapter.

---

## 3. Phases

### Phase 0 — Done in this branch
| Item | Effort | Status |
|---|---|---|
| Provider-independent session controller + 46 unit tests | 1–1.5 (spent) | **Implemented and tested** (fake provider only) |

### Phase A — Proof of concept (needs OD-8 legal check started, OD-10 budget cap)
| # | Work item | Effort |
|---|---|---|
| A1 | Google Cloud test project, budget cap and alerts, service account (owner creates account) | 0.5–1 |
| A2 | Minimal relay: AA Pro session check → controller → Gemini Live; resumption and GoAway handling | 4–6 |
| A3 | Gemini adapter implementing `TutorProvider` (open/resume, phase instructions, send question, interrupt, close) | 2–3 |
| A4 | Phase instructions for "explain only" and "answer only", Grade 5 language, synthetic sample chapter | 1.5–2 |
| A5 | Transcript-based policy check wired to interrupt | 1 |
| A6 | Developer-only test page (not the real classroom, hidden behind a dev flag) | 1.5–2 |
| A7 | Run scripted PoC sessions (15 and 30 min), record measurements, report | 2 |
| | **Phase A total** | **12.5–17** |

### Phase B — Production build (after PoC sign-off and Phase 3 bookings)
| # | Work item | Effort |
|---|---|---|
| B1 | `ai_sessions` table (status, phase, times, counts, no content), locking so one live lesson per booking | 2–3 |
| B2 | Classroom UI in the approved S15/S16 design: mic permission, audio playback, connection states (M-18), Raise hand, Repeat, End Class; Hint/Next Question per OD-2 | 6–8 |
| B3 | Reader integration: chapter beside the tutor; page-navigation tool with page allowlist (FR-011.2) | 3–4 |
| B4 | Chapter text loading with access checks; scanned-chapter handling per OD-7 | 2–3 |
| B5 | Relay hardening: rate limits, per-lesson token ceiling, reconnect UX, timeouts | 3–4 |
| B6 | Optional summaries (only if D-24 approved): generate after lesson, retention job, parent/child view | 3–4 |
| B7 | Tests: integration with fake provider, Playwright with mocked tutor, bundle scan for keys, cross-child access | 4–5 |
| B8 | Security and privacy review, logging without content, privacy notice text for review | 2–3 |
| B9 | Hosting for the relay, monitoring, cost dashboards | 2–3 |
| | **Phase B total** | **27–37** |

**Overall (Phase A + B): about 40–55 person-days**, excluding Phase 3 bookings and the textbook reader, which are already planned separately.

### Alternative: AI-Tutor.ai
Cannot be planned reliably: its API and embedding options are unverified. If the vendor confirms an API, allow **3–5 days** of vendor due diligence and a technical spike before any estimate. Phase control, quiz-free Q&A and booked-end enforcement would still need AA Pro's controller around it, and may be impossible if the vendor controls the session.

---

## 4. Order and gates

1. Owner decisions OD-1, OD-6, OD-8 (legal), OD-10 (budget) → start Phase A.
2. Phase A PoC report with measurements → owner go/no-go.
3. Phase 3 bookings and reader R2-2+ built → start Phase B.
4. Preview deployment only; production needs explicit owner approval (OC-09).
