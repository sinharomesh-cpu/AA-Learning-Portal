# AA Pro

AA Pro is a private learning portal for children, their parents, approved teachers and platform administrators. It brings together:
- AI Tutor lessons booked by the student or the parent;
- human-teacher meetings booked by the parent;
- the family's learning resources.

## Status

**Phase 1 in progress** (design system and role-separated UI shell with synthetic data; plan in `docs/g1/G1-10_Phase1_Implementation_Plan.md`). There is no real sign-in, database or external service yet, and nothing is deployed.

## Local development

Requirements: Node.js 22 (see `.nvmrc`) and npm 11.20.0 (`packageManager` in `package.json`).

```bash
npx -y npm@11.20.0 ci        # install exactly what the lockfile pins
npm run dev                  # http://localhost:3000
npm run lint                 # ESLint (no warnings allowed)
npm run typecheck            # route types + TypeScript strict
npm test                     # unit and component tests (Vitest)
npm run test:e2e             # end-to-end and accessibility tests (Playwright + axe)
npm run build                # production build
```

In this workspace the pre-installed Chromium is used for end-to-end tests: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e`.

## Where to start

| Document | Purpose |
|---|---|
| `docs/requirements/AA_Pro_FRD_v1.1.pdf` | Functional requirements, the baseline |
| `docs/g1/G1-05_Decision_Register.md` | Owner decisions and the decisions still open |
| `docs/g1/G1-02_Requirements_Traceability_Matrix.md` | Requirement → screen → test mapping |
| `docs/g1/G1-01_Canonical_Screen_Inventory.md` | Which design reference is used for each screen |
| `docs/design/missing-screens.md` | Design canvas link and the per-screen approval record |
| `design-reference/README.md` | What the design references are, and what is excluded |

## Rules for everyone working here

- **No secrets in Git.**
  - Never commit `.env` files, API keys, tokens, passwords or credentials.
  - `.env.example` lists variable names only.
- **No real personal data.**
  - Demo and test data are synthetic.
  - Never commit real children's names, school names, contact details, meeting links, recordings or uploaded learning material.
- **Approval gates.**
  - No commit to `main`, deployment, production connection or infrastructure change without the owner's explicit approval for that step.
  - Work goes through feature branches and pull requests.
- **Design references are read-only.**
  - The files in `design-reference/stitch-selected/` are redacted derivatives kept for reference.
  - They are not production code and are not edited.
- **CI must pass.** Every push and pull request runs `.github/workflows/repo-hygiene.yml` (identifying data, brand strings, forbidden files, secret scan) and `.github/workflows/ci.yml` (lint, type-check, unit tests, build, end-to-end and accessibility tests).
- **Dependencies** are pinned to exact versions, released at least 14 days before adoption (OC-29). Install scripts are blocked unless listed in `allowScripts`.
