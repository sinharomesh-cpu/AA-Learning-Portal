# AA Pro AI Teacher — Provider Feasibility Assessment

> **Update — OC-91 (owner, 18 Oct 2026, 00:42 IST): approved budget $0.** No paid AI service, API key, cloud billing or billable test may be set up until the owner approves the specific service and budget in writing. Every step below that needs a paid service is **Blocked — Owner Budget Approval Required**. Work continues with the simulated provider. See `docs/deployment/Billable_Dependency_Register.md`.


> **Update — OC-89 (owner, 17 Oct 2026, 23:41 IST).** These decisions supersede this document where it differs:
> - **Session length:** a single 15-minute session (10 minutes of explanation + 5 of Q&A), at most one per child in any rolling 24 hours. The 30-minute option is withdrawn.
> - **Classroom controls:** "Next Question" is removed; "Give Me a Hint" is kept, student-initiated.
> - **Gemini:** approved in principle **for evaluation only**. Provider eligibility for a children's service is a **release-blocking dependency** (see `AI_Provider_Eligibility_and_Legal_Review.md`).
> - **Test budget:** not yet approved; see `AI_Test_Environment_Cost_Controls.md`.
> - **Session rules:** see `AI_Teacher_Session_Rules.md`.


| | |
|---|---|
| Version | 1.0 (draft for owner review) |
| Date | 17 Oct 2026 |
| Branch | `ai-teacher-feasibility` (local only, not pushed) |
| Status | Assessment only. **Nothing has been connected to any provider.** No accounts, no keys, no paid usage. |

Companion documents: `AI_Teacher_Implementation_Plan.md`, `AI_Teacher_Cost_Estimate.md`, `AI_Teacher_PoC_Acceptance_Checklist.md` (same folder).

---

## 1. Summary for the owner

- **Recommended:** Google Gemini Live, **through Google Cloud (Vertex AI / "Gemini Enterprise Agent Platform")**, with AA Pro's own server sitting between the child's browser and Google.
- **Not the free Gemini Developer API.** Its terms forbid apps that are aimed at, or likely to be used by, people under 18. AA Pro is a children's portal. (Source G-7.)
- **AI-Tutor.ai is not recommended now.** Its public site does not show an API, an embeddable classroom, voice, or child-use terms. Its own blog says the product auto-generates quizzes, which is the opposite of the owner's Q&A rule. Almost everything is **Unverified**.
- **Most of the owner's rules are "custom development" on either provider.** No provider offers "10 minutes of teaching, then 5 minutes of Q&A, no quizzes" out of the box. AA Pro must enforce it on its own server. A small, tested controller that does this now exists in the repository (see §6).
- **Two important gaps:** (1) Google's Cloud terms for children could not be read from this session, so legal review is needed before any real child uses it. (2) A policy check can cut off a tutor that starts asking a quiz question, but with live voice the first words may already be heard. Instructions to the model reduce this; they do not make it impossible.
- **Before any build:** the owner must approve a change request, because the approved FRD v1.1 names ElevenLabs as the voice provider (§3).

---

## 2. What exists in the repository today (inspected 17 Oct 2026)

I opened each file listed below. Anything not listed was not inspected.

| Area | What exists | Files opened |
|---|---|---|
| AI Teacher / classroom | **Not built.** No classroom page, no voice code, no provider SDK in `package.json`. Only an illustration on the home page, labelled as an illustration. Brand labels "AA Pro AI Tutor" / "AI Tutor" are central. | `package.json`, `src/components/landing/TextbookPreview.tsx`, `src/config/brand.ts` |
| AI booking | **Demo only, nothing stored.** The wizard offers 15- or 30-minute slots on 15-minute boundaries, re-checks the choice on the server, and stores nothing. A real booking table does not exist yet (Phase 3). | `src/fixtures/aiBooking.ts`, `src/app/student/book/result/page.tsx`; `db/migrations/*.sql` (searched: no bookings table) |
| Join button | Always disabled; never shows a link. | `src/components/JoinButton.tsx`, `src/components/lessons/LessonStatus.tsx` |
| Textbook reader | **Not built.** "My library" is a "not ready yet" page. Reader designs R0–R8 are approved (OC-82); build is R2-2 onward. | `src/app/student/library/page.tsx` |
| Authentication / roles | Server-side role checks (`requireRole`). Real sessions from the `aa_session` cookie; parents get `childIds` from active `guardian_links`; students get grade and subjects. | `src/server/authz.ts`, `src/server/session.ts`, `src/lib/roles.ts` |
| Clock | `clockNow()` with a demo-only pinned clock. | `src/lib/clock.ts` |
| Classroom design reference | S15 (desktop) and S16 (phone) selected. S15 contains **End Class, Hint, Repeat, Next Question** controls. | `design-reference/stitch-selected/S15_ai_classroom_2.redacted.html` (searched for control labels), `docs/g1/G1-01_Canonical_Screen_Inventory.md` |

**Meaning for this project:** there is no existing classroom or reader to "preserve" in code yet. "Preserve" here means: build the AI Teacher inside the approved S15/S16 and R0–R8 designs, and do not change them.

---

## 3. Existing decisions that matter (and conflicts)

Checked in `docs/g1/G1-05_Decision_Register.md`, `docs/g1/G1-02_Requirements_Traceability_Matrix.md`, `docs/g1/G1-06_...`, `docs/phase2/P2-R2_...` and `docs/requirements/AA_Pro_FRD_v1.1.pdf` (text extracted).

| Ref | Decision | Fit with the new 15/30-minute rule | Action |
|---|---|---|---|
| OC-22 | AI lessons are 15 or 30 minutes, start on 15-minute boundaries, one at a time per child, enforced on the server. | **Consistent.** The new rule only splits each lesson into two phases. | None. |
| OC-60 | Max 30 minutes of AI lessons per child per day. | **Consistent.** One 30-minute or two 15-minute lessons a day. | None. |
| FRD v1.1 FR-010.1, §11; G1-02 T-AI-01; G1-06 env list (`ELEVENLABS_API_KEY`) | The **approved baseline names ElevenLabs** as the voice classroom. OC-02 says the FRD wins over other documents. | **Conflict.** Switching to Gemini (or AI-Tutor.ai) changes the baseline. | **Owner decision OD-1:** approve a change request replacing ElevenLabs. |
| S15 design; Master instructions §6 | Classroom controls include **Hint** and **Next Question**. | **Conflict.** "Next Question" and "Hint" are AI-led questioning. The new rule says no quizzes and no AI-initiated questions in Q&A. | **OD-2:** remove Next Question; remove or rename Hint; keep Repeat Explanation and End Class. |
| OC-44 | Join opens 10 minutes before start — **for teacher lessons**. | AI lessons have no decided join window. | **OD-3:** proposed: the AI lesson opens at the booked start (what the controller does now). |
| (new) | Late join | Not decided. | **OD-4:** controller keeps phase times fixed to the booked start (late join = shorter explanation, same end). |
| FR-016.2, OD-08, NFR-18; OC-43 | Raw audio **off** by default; avoid storing conversation content. | Compatible if AA Pro stores no audio and no transcript. | Relay must not log audio or transcripts. |
| D-24 (open) | Session summaries: source and retention. | The new "optional learning summaries" depend on it. | **OD-5:** decide D-24 (proposed: off by default; parent turns on; summary only, transcript discarded). |
| OC-74(5), OC-79 | In the textbook scope: **no AI-made study content and no paid AI services**. | An AI Teacher and AI summaries are paid AI services and AI-made content. | **OD-6:** confirm the AI Teacher is a separate, approved scope. |
| OC-03, OC-74(4) | No OCR. Text only from PDFs that already contain text. | Scanned chapters give the tutor **no text** to teach from. | **OD-7:** for scanned chapters either (a) not offered for AI lessons, or (b) send page images to the model (needs approval: cost, privacy). |
| D-28 (open) | Data residency and hosting region. | Provider region must be chosen. | Decide before real data. |
| OC-21 | Admins never see children's learning content. | Controller denies teachers and admins. | Done in controller. |

---

## 4. Provider findings (verified facts with sources)

All sources accessed **17 Oct 2026**. "Unverified" means I could not confirm it from an official page in this session.

### 4.1 Google Gemini Live API

| # | Fact | Source |
|---|---|---|
| G-1 | Live API is a real-time voice API over WebSockets. Two patterns: **server-to-server** (our backend connects to Google and forwards audio) or **client-to-server** (browser connects directly). Features listed: voice activity detection, tool use and function calling, session management, ephemeral tokens. SDKs: Python `google-genai`, JavaScript `@google/genai`. The JS example warns: "Do not use API keys in client-side (browser based) applications." | https://ai.google.dev/gemini-api/docs/live |
| G-2 | Current models: **`gemini-3.8-live`** (Stable, default), `gemini-3.8-live-extended-thinking` (Stable), `gemini-3.1-flash-live-preview` (Preview, legacy). Page last updated 13 Oct 2026. | https://ai.google.dev/gemini-api/docs/models |
| G-3 | **Session limits:** "Without compression, audio-only sessions are limited to 15 minutes." Connection lifetime "around 10 minutes". **Context window compression** can extend sessions "to an unlimited amount of time". **Session resumption** tokens valid "2 hr after the last sessions termination". A **GoAway** message warns before a connection is closed. | https://ai.google.dev/gemini-api/docs/live-session |
| G-4 | Context window: "128k tokens for native audio output models", "32k tokens for other Live API models". Input audio 16-bit PCM 16 kHz; output 24 kHz. Input and output **transcription** available. Automatic voice detection can be **disabled** (client sends `activityStart`/`activityEnd`). | https://ai.google.dev/gemini-api/docs/live-guide |
| G-5 | **Ephemeral tokens**: short-lived tokens for browser connections; **Live API only**; default 1 minute to start, 30 minutes for messages; can be **locked** to a configuration (`liveConnectConstraints`); `v1beta` only. The page says they "can be extracted from client-side applications". | https://ai.google.dev/gemini-api/docs/ephemeral-tokens |
| G-6 | **Gemini Developer API prices** (per 1M tokens): `gemini-3.8-live` text in $0.75, audio in $3.00 (or $0.005/min), text out $4.50, audio out $12.00 (or $0.018/min). Free tier exists. **Free tier content is used to improve Google products: "Yes"; paid: "No".** | https://ai.google.dev/gemini-api/docs/pricing |
| G-7 | **Gemini API terms:** "You must be 18 years of age or older to use the APIs." The services may not be used in an app "that is directed towards or is likely to be accessed by individuals under the age of 18." Unpaid services: content used "to provide, improve, and develop", and "human reviewers may read" it. Paid services: Google doesn't use prompts or responses to improve products; logs kept "for a limited period of time" for abuse detection. EEA/Switzerland/UK: paid services only. Effective 23 Mar 2026. | https://ai.google.dev/terms |
| G-8 | **Google Cloud (Vertex AI / Agent Platform) prices for Gemini 3.8 Live** (non-global, per 1M tokens): text in $0.75, audio in $3.00, text out $4.50, audio out $12.00. Audio = **25 tokens per second**. **"Each turn is billed for all tokens in the context window, including re-processed tokens from earlier turns."** Transcription billed at the text output rate. Only HTTP 200 requests charged. | https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing |
| G-9 | Google Cloud documents a Gemini 3.8 Live model page and a migration guide from Gemini 2.5 Flash Live (navigation only; body not readable). | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-live |

**Unverified for Gemini (could not read the official page):**

| Item | Why unverified | Page tried |
|---|---|---|
| Google Cloud terms on **children / under-18 use** of generative AI | Page blocked in this session | https://cloud.google.com/terms/service-terms |
| Vertex AI data governance (training, caching, abuse logging, zero data retention) | Page blocked | https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance |
| Vertex Live API **session limits, concurrent-session quotas, regions** | Page body truncated (navigation only) | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session ; https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas ; https://docs.cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/live-api |
| Whether **ephemeral tokens work on Vertex** | Only documented for the Developer API (G-5) | as above |
| Developer API **rate limits / concurrent sessions** | Page blocked | https://ai.google.dev/gemini-api/docs/rate-limits |
| Function-calling details for Gemini 3.8 Live | Page blocked | https://ai.google.dev/gemini-api/docs/live-tools |

### 4.2 Gemini Developer API vs Google Cloud (Vertex AI)

| Topic | Gemini Developer API (ai.google.dev) | Google Cloud Vertex AI / Agent Platform |
|---|---|---|
| Use with under-18 users | **Not allowed** (G-7) | **Unverified** — needs legal review of Google Cloud terms |
| Data used for training | Free: yes. Paid: no (G-6, G-7) | Unverified in this session |
| Browser connection | Ephemeral tokens (G-5) | Unverified; assume **server relay** with a service account |
| Price for 3.8 Live | Same per-token list prices (G-6) | Same per-token list prices (G-8) |
| Regions / data residency | Paid only in EEA/UK/CH (G-7) | Regional ("non-global") pricing exists (G-8); regions unverified |

**Conclusion:** only the Google Cloud route can be considered for a children's product, and only after legal review.

### 4.3 AI-Tutor.ai (TutorAI) Enterprise

The site's main pages load their content in the browser, so the official pricing, terms and privacy pages showed **only titles** to my tools. What I could read:

| # | Fact | Source |
|---|---|---|
| T-1 | The site describes itself as "an AI-powered learning platform" to learn "anything, anytime, anywhere". Pricing meta text: "for as little as $10 per month", "generate as many Online Courses as you want", "Custom AI tutors in any language". | https://ai-tutor.ai/ ; https://ai-tutor.ai/pricing |
| T-2 | Company blog (1 Oct 2025): plans Free, Mentor ($16/month), Genius ($21/month) and **Enterprise** "for schools, organizations, or teams that need white-label solutions, API access, and bulk licensing", custom price, "Includes onboarding and training". Product features include "**Auto-generated quizzes after each topic**". "There's no pay-per-use option." Sales via Contact page. | https://ai-tutor.ai/blog/ai-tutor-ai-vs-chatgpt/ |
| T-3 | Company blog (21 Jan 2025): features "Quizzes, practice exercises", "24/7 access", gamification with quizzes and badges. No mention of voice, document upload, API or children. | https://ai-tutor.ai/blog/what-is-an-ai-tutor/ |
| T-4 | Terms and privacy pages exist but their text could not be read (page body not delivered; marked `noindex`). | https://ai-tutor.ai/terms-conditions ; https://ai-tutor.ai/privacy-policy |

**Unverified for AI-Tutor.ai:** API or SDK and its documentation; embedding in another site; real-time **voice**; uploading **our own chapter**; control over lesson phases; disabling quizzes; age limits and child consent; data use for training; sub-processors (which AI model it uses); data location; enterprise price; usage limits; uptime terms; legal entity.

---

## 5. Feasibility matrix

Key: **S** = Supported · **C** = Custom development required · **U** = Unsupported · **?** = Unverified.

| # | Requirement | Gemini Live (Google Cloud) | Evidence | AI-Tutor.ai Enterprise | Evidence |
|---|---|---|---|---|---|
| R1 | Inside the AA Pro classroom, no redirect to a separate chatbot | **S** (we build the UI; API is audio over WebSocket) | G-1 | **?** "white-label … API access" mentioned only in a blog; no API docs | T-2 |
| R2 | Teach from the authorised chapter selected in AA Pro | **C** — server loads the chapter text and puts it in the instructions; 128k context fits a chapter. Scanned chapters need OD-7. | G-4 | **?** No evidence of using our own files | T-1–T-3 |
| R3 | 15 min = 10 explanation + 5 Q&A | **C** — our controller times phases. Audio sessions cap at 15 min uncompressed and connections at ~10 min, so **resumption + compression are required** even for 15 min. | G-3; §6 | **?** / likely **U** for control | T-2 |
| R4 | 30 min = 20 + 10 | **C** — same, with compression and 2–3 resumptions. | G-3 | **?** | — |
| R5 | Defer student questions during explanation | **C** — controller queues them; voice detection disabled or mic muted ("raise hand") during explanation. | G-4; §6 | **?** | — |
| R6 | Q&A: answer only, no quizzes, no AI questions | **C** — instructions + transcript check + interrupt. Cannot be fully guaranteed (first words may be heard). | G-4; §6 | **Conflict risk** — product advertises auto-generated quizzes | T-2, T-3 |
| R7 | Server enforces booked end | **C** — server relay closes the connection at the booked end. (With direct browser connections the server could not force-close; not recommended.) | G-1; §6 | **?** — we can only stop showing it | — |
| R8 | Keep the reader and classroom design | **S** — AA Pro owns all screens | G-1 | **?** — embedded vendor UI would likely bring its own design | — |
| R9 | Optional summaries, by privacy/retention settings | **C** — use transcripts in memory, generate a short summary after the lesson, discard transcript; off unless D-24 allows. | G-4, G-8 | **?** | — |
| R10 | No provider keys in browser; protect child data and textbook access | **C** — keys stay on the server relay; AA Pro checks access before any chapter text leaves the server. **Legal: Developer API is U for under-18 (G-7); Google Cloud terms ?** | G-1, G-5, G-7 | **?** | T-4 |

---

## 6. Session controller built for this assessment (provider-independent)

Location: `src/server/aiSession/` (`types.ts`, `policy.ts`, `controller.ts`, `controller.test.ts`). Server-only. **Not connected to any provider and not used by any page.**

What it does:
- Works out the phase from the clock only: not started → explanation → Q&A → ended. 15 = 10 + 5; 30 = 20 + 10. Phase times are fixed to the **booked** start.
- Student questions during the explanation are **queued** (max 10, max 500 characters) and passed on, in order, when Q&A starts.
- Every tutor turn can be checked. Quiz wording is blocked in both phases; any question from the tutor is blocked in Q&A. A blocked turn interrupts the tutor.
- Hard cut-off: every action re-checks the clock, so the lesson ends at the booked end even if a timer is late. A slow connection that completes after the end is closed at once.
- Only the booked student, or a parent linked to that child, can open or end it. Teachers and admins cannot.
- Reconnect within the window resumes the right phase with the remaining time, using the provider's resume handle. Lost time is never given back.
- Stores no audio and no transcript. A summary is allowed only after the end and only if the child's setting allows it.

### Actual test results (run 17 Oct 2026 in the worktree)

| Command | Result |
|---|---|
| `npx vitest run src/server/aiSession/controller.test.ts` | **46 passed, 0 failed** (1 file) |
| `npx vitest run` (whole unit suite, for regressions) | **212 passed** in 21 files |
| `npx tsc --noEmit` | **Passed** (exit 0, no errors) |
| `npx eslint --max-warnings=0 src/server/aiSession/` | **Passed** (exit 0) |
| `npx prettier --check src/server/aiSession/` | **Passed** |

Tests use a fake clock and a fake provider. **No real provider was called.** These tests show the AA Pro rules are enforceable on our side; they do **not** show that Gemini follows instructions well.

---

## 7. Key risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| K-1 | Google Cloud terms do not allow, or add conditions for, under-18 users | Unknown | Blocks the plan | Legal review before any real child data (OD-8) |
| K-2 | The tutor asks a question or starts a quiz despite instructions; first words heard | Medium | Rule broken briefly | Strong instructions; transcript check + interrupt; PoC measures the rate |
| K-3 | Context re-billing makes 30-minute lessons cost much more than expected | Medium | Cost | Compression window, push-to-talk input, cost cap per lesson (see cost estimate) |
| K-4 | 10-minute connection limit causes audible gaps at reconnect | Medium | Experience | Resumption tokens; reconnect on GoAway before the cut |
| K-5 | Hosting: a long-lived WebSocket relay may not run on the current Vercel setup | Unverified | Architecture | Plan a small separate relay service; confirm hosting in PoC |
| K-6 | Scanned chapters have no text; no OCR allowed | High for scanned books | Tutor cannot teach that chapter | OD-7 |
| K-7 | Model and pricing change (3.1 Flash Live already "legacy") | Medium | Rework | Adapter interface keeps the provider swappable |
| K-8 | Voice quality, accent and child speech recognition (Grade 5) | Unknown | Experience | PoC with adult testers reading synthetic child questions only |
| K-9 | Copyright: textbook text sent to a third party | Medium | Legal | OC-79 parent attestation covers upload; confirm it covers sending to an AI provider (OD-9) |
| K-10 | AI-Tutor.ai: closed product, quizzes built in, unknown child terms | High | Requirements not met | Not recommended; ask vendor questions in §9 if still of interest |

---

## 8. Recommendation

Use **Gemini 3.8 Live on Google Cloud (Vertex AI / Agent Platform), behind an AA Pro server relay**, with the provider-independent session controller enforcing the phases, question deferral, Q&A policy and booked end time. This is the only option where every requirement is at least achievable with our own development, the classroom and reader stay fully AA Pro, and keys stay on the server. The free Gemini Developer API must not be used because its terms exclude under-18 apps. AI-Tutor.ai cannot be recommended on current evidence: no public API, voice or child-use terms could be confirmed, and quizzes are part of its product. Proceed only to a **paid-usage-capped proof of concept** after legal review and the owner decisions below.

---

## 9. Unresolved questions and owner decisions

| ID | Decision needed | Proposed default |
|---|---|---|
| OD-1 | Approve a change request replacing ElevenLabs (FRD FR-010) with the chosen provider | Gemini Live on Google Cloud, PoC first |
| OD-2 | Classroom controls: remove **Next Question**; remove or rename **Hint** | Keep Repeat Explanation and End Class only; add "Raise hand" for queued questions |
| OD-3 | When can an AI lesson be opened? | At the booked start; no early lobby |
| OD-4 | Late join: keep fixed phase times, or squeeze both phases into the time left? | Fixed to booked start (built) |
| OD-5 | D-24 summaries: allowed? who turns them on? how long kept? | Off by default; parent opt-in; summary kept 12 months; transcript never stored |
| OD-6 | Confirm the AI Teacher is approved paid AI scope, separate from OC-74(5) | — |
| OD-7 | Scanned chapters (no text): exclude, or send page images? | Exclude from AI lessons for now |
| OD-8 | Legal review of Google Cloud terms for a children's service, consent text, privacy notice | Required before any real child data |
| OD-9 | Does the parent's upload attestation cover sending chapter text to an AI provider? | Add explicit wording at upload |
| OD-10 | Approve a Google Cloud test project with a hard budget cap for the PoC | e.g. USD 25 cap, synthetic data only |
| OD-11 | May the tutor ask one clarifying question in Q&A ("Did you mean…?")? | No (current policy blocks it) |
| OD-12 | Region / data residency (D-28) | Decide before real data |

**Questions for AI-Tutor.ai (only if the owner still wants it considered):** Is there an API or embeddable classroom? Can it teach strictly from a file we supply? Can quizzes and AI questions be turned off? Real-time voice? Minimum age and parental consent model? Which AI model and sub-processors? Is customer data used for training? Data location? Enterprise price per session or per seat? Session limits and uptime commitment?

---

## 10. Sources that could not be reached

| URL | Problem |
|---|---|
| https://ai.google.dev/gemini-api/docs/rate-limits | Blocked in this session |
| https://ai.google.dev/gemini-api/docs/live-tools | Blocked |
| https://ai.google.dev/gemini-api/terms | Blocked (same terms read at https://ai.google.dev/terms) |
| https://cloud.google.com/terms/service-terms | Blocked |
| https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance | Blocked |
| https://cloud.google.com/vertex-ai/generative-ai/docs/live-api | Returned "not found" (page moved) |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session ; …/docs/quotas ; …/provisioned-throughput/live-api ; https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live | Only navigation text delivered |
| https://ai-tutor.ai/pricing ; /terms-conditions ; /privacy-policy ; /ai-for-educators | Only page titles delivered (content loads in the browser) |
