# AA Pro AI Teacher — Test-Environment Cost Controls

**Version:** 2.0 · 18 Oct 2026 · **Decisions:** OC-89(5), **OC-91 (approved budget $0)**

> **No budget is approved: the approved amount is $0.** No billable AI testing, no paid API key, no cloud project with billing and no paid usage of any kind is authorised. The "about $12 a day" figure in version 1.0 was only an illustration of possible exposure, **never** a budget. It is withdrawn as a planning figure. Status of live AI testing: **Blocked — Owner Budget Approval Required.**

## 1. What continues at no cost

- The session rules (15 minutes, one a day, one active, no duplicates) and the controller (phases, hints, quiz blocking, cut-off, recovery) are built and tested with a simulated clock and a simulated AI provider.
- The classroom page, the textbook reader and the server relay can be built against the same simulated provider: a scripted tutor that "speaks" captions. This tests the screens, timing and error handling, but not real voice or teaching quality.
- Provider research and a cost model, with no accounts created.
- The CI guard (`src/config/paidServices.test.ts`) fails the build if a paid AI SDK or API host is added before approval.

## 2. Controls Claude will propose with any future budget request (none are active, and none may be set up without approval)

| # | Control | Guaranteed? |
|---|---|---|
| C-1 | A separate test project, with only the AI API enabled | Yes, as separation |
| C-2 | **AA Pro hard caps before any request leaves the server:** `AI_TEACHER_ENABLED` off by default; a total daily cap across all testers (for example, 10 sessions); 15 minutes per session; one session per child per day | Yes, for calls made through AA Pro |
| C-3 | Provider quotas: low requests per minute and per day, and low concurrent sessions | Enforced by the provider. Changes can take time to apply |
| C-4 | API key or service account restricted to the AI API and AA Pro's server, and rotated after testing | Reduces the risk from a leaked key; does not remove it |
| C-5 | Automatic shut-off: a budget event turns billing off for the test project | **Not guaranteed to cap spend:** billing data arrives late, so charges in that window still apply |
| C-6 | Budget alerts | **Not spending protection** (OC-91 rule 5); information only |
| C-7 | A daily usage report (sessions, minutes, tokens, estimated cost) | Visibility only |

**Maximum exposure.** With every control in place, the documented maximum is: daily session cap × 15 minutes × the highest measured cost per session × the number of days, plus a stated allowance for billing lag. This figure is calculated from the provider's current prices **at the time of the request**, presented for approval, and is not assumed now.

## 3. Status
| Item | Status |
|---|---|
| Live AI voice tests | **Blocked — Owner Budget Approval Required** (and R-AI-1, provider eligibility) |
| Simulated-provider classroom work | Allowed (no cost) |
| Provider eligibility questions to Google and others | Allowed only if free and with no account or commitment; owner to decide who sends them |
