# AA Pro — Billable Dependency Register and Zero-Budget Rules

**Version:** 1.0 · 18 Oct 2026 · **Decision:** OC-91 (owner, 18 Oct 2026, 00:42 IST)

> **Approved budget: $0.** No expenditure, paid integration or billable test activity is authorised until the owner explicitly approves that specific service and budget in writing. Silence, approval of the project, a feature, an architecture or a technical recommendation is **not** consent to spend. Budget alerts are not spending protection.

## 1. Rules Claude follows (OC-91)

1. **No billable integration without prior written approval:** no activating, configuring for paid use or calling any service that may charge.
2. **Approval of a feature or design is not approval of its cost.**
3. **Free first:** existing infrastructure, free tiers, local development, mocks, stubs and synthetic data. The limits of each are stated.
4. **Paid options stay separate:** they may be researched, estimated and designed, but never activated or made a required dependency.
5. **Preventive controls before any paid test:** quotas, usage limits and a documented maximum exposure, with plain statements of what cannot be guaranteed.
6. **Existing dependencies are reviewed and flagged** (section 2), without triggering paid usage while checking.
7. **Every new cost commitment needs a written request** (section 5) and explicit written consent.

A requirement that cannot be finished without a paid service is marked **Blocked — Owner Budget Approval Required**, and work continues elsewhere.

**Enforced in code:** `src/config/paidServices.ts` lists every paid service, all with `approvedBy: null`. The test `src/config/paidServices.test.ts` fails CI if any of the following happens before an approval is recorded there:
- a paid service is marked approved;
- one of its SDKs is added to `package.json`;
- one of its API hosts appears in the code.

## 2. Existing dependencies (reviewed 18 Oct 2026, read-only)

| # | Dependency | Used for | Charges today? | Could it start charging? | Safe measure / owner check |
|---|---|---|---|---|---|
| E-1 | **GitHub repository and Actions** (11 CI checks per pull request) | Code and checks | **No.** The repository is public, and standard runners are free for public repositories (GitHub docs) | **Yes, if the repository is made private** (open item A-08). Private repositories get a limited free quota, and "any usage beyond the included amounts is billed". This project uses an estimated 2,000–4,000 CI minutes a month | Keep it public until a CI budget is approved, or before making it private: set the Actions spending limit to $0 and reduce the checks. **Owner check:** GitHub → Settings → Billing → spending limit is $0 |
| E-2 | **Vercel** projects `aa-learning-portal` (sample-data preview) and `aa-pro-test` (test environment) | Hosting | **No,** if on the free Hobby plan (Claude cannot see the account's plan) | Hobby does not bill. Usage over its limits pauses features for up to 30 days. **But Vercel says Hobby is for "non-commercial, personal use only".** Commercial use, including production, needs Pro ($20 per developer seat per month, plus usage) | **Owner check:** confirm both projects are on Hobby with no card or Pro trial. Before any commercial or production use, a budget request for Pro (or a free alternative) is needed. **Blocked — Owner Budget Approval Required** for production hosting |
| E-3 | **Neon Postgres** (free plan), connected to `aa-pro-test` | Test database | **No** | Neon: "Neon does not bill overages on the Free plan". Over its limits, compute suspends; data is not deleted | **Owner check:** the Neon project is on the Free plan with no payment method |
| E-4 | Vercel **"Preview Comments"** check | Part of Vercel | No | As E-2 | — |
| E-5 | npm packages (Next.js, React, sharp, postgres, argon2, otplib, qrcode, zod, fonts, test tools) | Open-source code | No | No (licences only) | Licences recorded in `THIRD_PARTY_NOTICES.md` where needed |
| E-6 | Material Symbols icons, Inter, Outfit and Plus Jakarta Sans fonts | Embedded in the app | No | No | — |
| E-7 | Email (`email_outbox`) | Queued messages | No: **nothing is sent**; the test mailbox only | Only if a provider key is added | `EMAIL_PROVIDER_API_KEY` must stay empty (OC-65). Guarded by the paid-services test |
| E-8 | Placeholders for `ELEVENLABS_*`, `ZOOM_*`, `STORAGE_*`, `EMAIL_PROVIDER_API_KEY` and `WHATSAPP_PROVIDER_API_KEY` in `.env.example` | Names only | No | Only if filled in on Vercel | **Owner check:** none of these is set in either Vercel project. A demo build already refuses to start if any is set |
| E-9 | Claude (this assistant) | Development | The owner's own Claude plan | — | Outside the AA Pro budget |

No API key, cloud resource or paid SDK was found in the repository. None of the paid API hosts in section 3 appear in the code (checked by the new test).

## 3. Planned paid services: all Blocked — Owner Budget Approval Required

| Service | Needed for | Free alternative used now | Limits of the free alternative |
|---|---|---|---|
| AI Teacher voice (Gemini on Google Cloud, OpenAI Realtime, ElevenLabs, Anthropic plus speech, or AWS) | Live AI lessons | A provider-independent controller with a fake provider; the session rules and limits are fully tested | No real voice, no real teaching quality, no real latency or cost measurement |
| Real email (OC-65) | Confirmations, invitations, reminders | The email outbox plus the test mailbox | No real delivery; addresses can't be verified |
| WhatsApp | Reminders | Not built | — |
| Zoom | Human-teacher lessons | "Zoom meeting not created yet" | No real meetings or links |
| Object storage (C-5) | Large files at scale | **Files in AA Pro's database (OC-87)** on Neon's free plan | 1 GB per Neon project: fine for small synthetic files, not for real families' scans |
| Production hosting (Vercel Pro or another host) | Commercial launch | The Hobby test projects (non-commercial) | Hobby's terms exclude commercial use |
| Payments | — | Not planned (OC-79: survey question only) | — |

**Free items that need no budget**, but still follow the normal approvals:
- the Google Classroom API (no usage charge; needs an OAuth app and the school's admin consent);
- open-source libraries, such as a HEIC decoder (licence checked in its PR).

## 4. Maximum exposure today

**$0 from AA Pro's own code**, because no paid service is integrated.

The only accounts that could charge are E-1 (if the repository is made private), E-2 (if upgraded) and E-3 (if upgraded). Each needs an action in the owner's own account, and the owner checks above confirm none has been taken.

## 5. Approval request template (rule 7)

For each new cost, Claude provides the following and waits for written consent:

| Field | Content |
|---|---|
| Service and plan | Exact product, tier and region |
| Business purpose | Requirement and decision ids |
| Expected cost | Test phase, and monthly at the planned scale, with the price source and date |
| Worst-case exposure | Under the proposed controls, and what is **not** guaranteed (billing delays, provider behaviour) |
| Free alternatives | And their limits |
| Preventive controls | Quotas, hard caps in AA Pro (kill switch, daily caps), key restrictions, automatic shut-off, and who can raise limits |
| Data and legal | Child-data eligibility (R-AI-1 where relevant), DPA, region |
| Exit plan | How to switch it off and what stops working |
