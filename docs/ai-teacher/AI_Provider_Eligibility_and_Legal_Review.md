# AA Pro AI Teacher — Provider Eligibility and Legal Review

**Version:** 1.0 · 17 Oct 2026 · **Decisions:** OC-89(1) and OC-89(3)

> **RELEASE-BLOCKING DEPENDENCY (R-AI-1).** No live AI Teacher is available to real children until a provider is confirmed eligible for a child-facing education service, in writing. Gemini is **approved in principle for evaluation only**; its production integration is **not approved**.

## 1. Current position

| Item | Status |
|---|---|
| Gemini Developer API (ai.google.dev) | **Not eligible.** Its terms require users to be 18 or over, and prohibit apps "directed towards or likely to be accessed by individuals under the age of 18" (feasibility report, G-7). Parental consent does not change this. |
| Gemini on Google Cloud (Vertex AI) | **Unverified.** No age clause was found, but the AI/ML part of Google Cloud's Service Specific Terms could not be read, and Google staff declined to answer the question publicly. Written confirmation from Google is needed. |
| **ElevenLabs (FRD FR-010 baseline)** | **Likely blocked without written permission.** Its Terms of Use say "If you are under 18 years of age … you may not use our Services", and its Agents terms bar agents "directed to children under 13" (Reception Offering). So the original baseline has the same problem as Gemini. |
| OpenAI Realtime API | **Conditional, permitted in writing:** with parent or guardian consent, child-appropriate safeguards and **zero data retention turned on** for under-13 users. Real-time voice is built in. India and Singapore offer data storage only, not processing. |
| Anthropic Claude API | **Conditional, permitted in writing:** with safeguards, a public compliance statement, telling users they are talking to an AI, and periodic audits. **No built-in voice**, so separate speech-to-text and text-to-speech services that also allow children are needed. Data is processed in US or "global" regions. |
| Azure OpenAI / Azure Speech; AWS Nova 2.5 Sonic | **Unverified:** no age bar was found, but key terms pages could not be read. Written confirmation is needed. |

## 2. Rules until eligibility is confirmed (OC-89(3))

- **Testers:** synthetic student data and adult testers only.
- **No real child data:** no real child's personal information or learning records go to any AI service that is not approved.
- **No production access:** the AI Teacher stays switched off outside the test environment.
- **Minimum data to the provider:**
  - **Sent:** subject, grade, the chapter text the parent assigned, the session phase and the student's spoken or typed questions.
  - **Never sent:** the child's name, username, contact details, school, family details or other identifiers. The lesson is identified to the provider by a random session id only.
  - **Retention and training:** where offered, zero or limited data retention and no use of inputs for training.

## 3. Legal-review checklist (complete before any real child uses the AI Teacher)

| # | Check | Evidence needed | Owner | Status |
|---|---|---|---|---|
| L-1 | The exact service (product, tier, region) is identified | Service name and agreement | Claude | Open |
| L-2 | The provider's terms allow a service directed to, or likely used by, under-18s and under-13s | Clause text, plus written confirmation from the provider | Owner / legal adviser | Open |
| L-3 | Age, consent and parental-verification conditions are met (India DPDP Act 2023 and its rules, Singapore PDPA, and others where families live) | Legal adviser's note | Owner | Open |
| L-4 | A data processing agreement is signed. It covers the processing purpose, sub-processors, breach notice and deletion | Signed DPA | Owner | Open |
| L-5 | Prompts, audio and outputs are not used for training; retention is known and minimal | Contract or settings, with a screenshot | Claude / owner | Open |
| L-6 | Data region and international transfer are acceptable (D-28) | Region setting and legal note | Owner | Open |
| L-7 | The provider's content-safety settings are suitable for children; AA Pro's own policy checks are in place | Configuration, plus test results | Claude | Partly done (policy checks built) |
| L-8 | Privacy notice and parental consent text updated for the AI Teacher | Approved text | Owner | Open |
| L-9 | Incident and complaint route for AI output | Process document | Owner | Open |
| L-10 | Owner's written approval of the provider for production | Decision register entry | Owner | Open |

## 4. Alternatives (research of 17–18 Oct 2026; full quotes in `AI_Provider_Child_Eligibility_Research.md`)

This research is a reading of public terms, not legal advice. Pages that could not be read are marked "Unverified".

**Recommendation for the owner's decision (Claude's view, evidence-based):**
1. **Do not use the Gemini Developer API.** Its terms forbid this use.
2. **Ask Google in writing whether Gemini on Vertex AI may be used** for a children's education service (ages 6–12, with parental consent). This keeps the approved-in-principle option open without assuming the answer.
3. **Evaluate the OpenAI Realtime API in parallel as the alternative.** Its published terms allow apps for minors with conditions, and it has built-in real-time voice. This matches OC-89(1), which asks for an alternative whose terms allow child-facing education.
4. **Treat ElevenLabs (the FRD baseline) as blocked** unless ElevenLabs gives written permission.
5. **In every case:** a signed DPA, zero data retention, the processing region confirmed, and a legal review (India DPDP Act and rules, Singapore PDPA, and COPPA if US users are possible) before any real child uses it.

The provider-independent session controller and daily limit work with any of these providers. Only the server-side adapter changes.
