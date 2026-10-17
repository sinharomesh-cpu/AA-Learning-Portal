# AA Pro AI Teacher — Test-Environment Cost Controls

**Version:** 1.0 · 17 Oct 2026 · **Decision:** OC-89(5). **No test budget is approved yet. No billable testing has started.**

## 1. What is prepared now (no cost)

- The session controller and the daily-limit rules are tested with a simulated clock and a simulated AI provider.
- The application has its own limits, which work whatever the provider:
  - one 15-minute session per child per 24 hours;
  - one active session per child;
  - at most 5 hints per session;
  - questions held during the explanation (at most 10).

## 2. Controls to set up before any billable test (each needs the owner's budget approval)

| # | Control | Effect | Limits |
|---|---|---|---|
| C-1 | A separate test billing project, with only the AI API enabled | Keeps test spend separate and easy to switch off | — |
| C-2 | A budget with alerts at 50%, 90% and 100% of the approved amount | Email alerts | **Alerts do not stop spending.** Billing data can lag by hours |
| C-3 | API quotas: requests per minute and per day, and concurrent sessions, set low (for example, 2 concurrent sessions) | Hard limit, enforced by the provider | Changes can take time to apply |
| C-4 | An AA Pro switch `AI_TEACHER_ENABLED` (off by default) and a cap `AI_TEST_MAX_SESSIONS_PER_DAY` across all testers (for example, 10) | Hard limit, enforced by AA Pro, before any request leaves the server | Only protects calls made through AA Pro |
| C-5 | Automatic shut-off: the budget alert triggers a small function that turns billing off for the test project | Stops further charges | Charges already incurred, and those in the lag window, still apply. Turning billing off can delete or stop resources |
| C-6 | The API key or service account is restricted to the AI API and to the AA Pro server's network, and rotated after testing | Limits misuse if a key leaks | — |
| C-7 | Usage monitoring dashboard: sessions, minutes, tokens and estimated cost per day | Visibility | — |

## 3. Remaining cost exposure (stated plainly)

- **Alerts alone do not cap spending.** The provider's billing reports arrive late, so a fault or misuse can overspend before an alert is seen.
- **Within AA Pro's own caps,** the worst case per day is the per-day session cap × 15 minutes × the highest per-session estimate. With 10 sessions and about $1.20 each (cost estimate, high case), that is about $12 a day.
- **Outside those caps:** a leaked key or misconfigured quota could exceed this. C-3, C-5 and C-6 reduce that risk but do not remove it.
- **Per child:** at most 30 sessions a month. That is about $6.60–$36 a month per active child at the estimate's low and high cases, before tax. Prices must be checked again before any approval.
