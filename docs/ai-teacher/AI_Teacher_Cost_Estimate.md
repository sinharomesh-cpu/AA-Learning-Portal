# AA Pro AI Teacher — Operating Cost Estimate

| | |
|---|---|
| Version | 1.0 (draft) · 17 Oct 2026 |
| Status | Estimate from published list prices. **No paid usage was incurred.** Real costs must be measured in the PoC. |
| Currency | USD, before tax. No currency conversion applied. |

---

## 1. Price source (verified)

Gemini 3.8 Live on Google Cloud (Agent Platform / Vertex AI), non-global, per 1 million tokens. Source: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing (accessed 17 Oct 2026).

| Item | Price per 1M tokens |
|---|---|
| Audio input | $3.00 |
| Audio output | $12.00 |
| Text input | $0.75 |
| Text output (also used for transcription) | $4.50 |

Same page: audio is **25 tokens per second** (1,500 per minute), and **"each turn is billed for all tokens in the context window, including re-processed tokens from earlier turns"**.

The Gemini Developer API lists the same per-token prices for `gemini-3.8-live` (https://ai.google.dev/gemini-api/docs/pricing, accessed 17 Oct 2026), but it cannot be used for under-18 users (see the feasibility report, G-7).

---

## 2. Assumptions (not verified — to be measured in the PoC)

| ID | Assumption | Value |
|---|---|---|
| A-1 | Share of the explanation the tutor is speaking | 80% |
| A-2 | Share of Q&A the tutor is speaking | 50% |
| A-3 | Student audio sent to Google with "raise hand"/push-to-talk | 5% of explanation + 40% of Q&A |
| A-4 | Student audio with an always-open microphone | Whole lesson |
| A-5 | Chapter text placed in the instructions | 6,000 text tokens (sample chapter of about 10 pages) |
| A-6 | Transcription text | 200 tokens per spoken minute |
| A-7 | Tutor turns | 1 per minute |
| A-8 | Re-processed context billed at the audio input rate | Average context = half of all audio so far + chapter text |

Three scenarios:
- **A — Lean (lower bound):** push-to-talk, no re-processing charge. Unrealistically low; shown as a floor.
- **B — Central:** push-to-talk, re-processing charged every turn.
- **C — High:** always-open microphone, re-processing charged every turn.

---

## 3. Formula

```
audio_in_tokens  = student_audio_minutes × 1,500
audio_out_tokens = tutor_speaking_minutes × 1,500
fresh_cost       = audio_in_tokens × $3/1M + audio_out_tokens × $12/1M
                 + chapter_tokens × $0.75/1M
                 + (tutor + student speaking minutes) × 200 × $4.50/1M
reprocess_cost   = turns × [ (audio_in_tokens + audio_out_tokens)/2 × $3/1M + chapter_tokens × $0.75/1M ]
session_cost     = fresh_cost (+ reprocess_cost in B and C)
per_1000         = session_cost × 1,000
```

Worked example — 15 minutes, scenario A: tutor speaks 0.8×10 + 0.5×5 = 10.5 min → 15,750 tokens × $12/1M = $0.189. Student 0.05×10 + 0.4×5 = 2.5 min → 3,750 × $3/1M = $0.011. Chapter 6,000 × $0.75/1M = $0.0045. Transcripts 13 min × 200 × $4.50/1M = $0.0117. **Total ≈ $0.22.**

The figures below were computed with a short script that applies exactly this formula (not hand-typed). Anyone can recheck them with a calculator.

---

## 4. Results (provider usage only)

| Lesson | Scenario | Tutor speaks | Student audio | Per lesson | Per 1,000 lessons |
|---|---|---|---|---|---|
| 15 min | A Lean | 10.5 min | 2.5 min | **$0.22** | $216 |
| 15 min | B Central | 10.5 min | 2.5 min | **$0.72** | $723 |
| 15 min | C High | 10.5 min | 15 min | **$1.20** | $1,201 |
| 30 min | A Lean | 21 min | 5 min | **$0.43** | $428 |
| 30 min | B Central | 21 min | 5 min | **$2.32** | $2,318 |
| 30 min | C High | 21 min | 30 min | **$4.12** | $4,118 |

**What this means:**
- Re-processing earlier conversation is the biggest cost driver. It grows faster than the lesson length, so a 30-minute lesson costs about **three times** a 15-minute one in the central case, not twice.
- **Push-to-talk / "raise hand"** saves real money and also fits the rule "questions wait until Q&A".
- **Context window compression** (a Google feature, required anyway for sessions over 15 minutes) caps how much is re-processed. It may bring scenario B well below the figure shown. The PoC must measure this.

Example monthly view (central case B): 1,000 × 15-min + 1,000 × 30-min lessons ≈ $723 + $2,318 = **≈ $3,041 per month** in provider usage.

---

## 5. Costs not included (unverified or not yet quoted)

| Item | Status |
|---|---|
| Relay server hosting (long-lived WebSocket service) | Not priced. Hosting choice is open (risk K-5). |
| Optional summaries (one short text request after the lesson) | Small; not priced until D-24 is decided. |
| Google Cloud support plan, logging, network egress | Not priced. |
| Discounts, committed use, provisioned throughput | Not checked. |
| Taxes and currency conversion (INR/SGD) | Not applied. |
| AI-Tutor.ai | **Unverified.** Blog lists consumer plans at $16 and $21 per month and a custom-priced Enterprise plan; "no pay-per-use option" (https://ai-tutor.ai/blog/ai-tutor-ai-vs-chatgpt/, accessed 17 Oct 2026). No per-session price available, so no comparison is possible. |

---

## 6. Cost controls proposed

1. Hard budget cap and alerts on the Google Cloud project (owner sets the amount).
2. Push-to-talk during explanation; microphone only on when the student presses "Raise hand" or during Q&A.
3. Context compression with a modest sliding window.
4. Server-side per-lesson token ceiling: the relay ends the lesson gracefully if exceeded.
5. OC-60 daily limit (30 minutes per child) already caps usage per child: at most about 30 × $2.32 ≈ $70 per child per month in the central case if a child uses the full limit every day.
