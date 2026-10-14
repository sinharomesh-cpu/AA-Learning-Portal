# AA Pro — G1-06 Repository and Project Isolation Plan

**Version:** G1 v1.2 · 14 Oct 2026 · **Status:** PROPOSED. Nothing has been committed, pushed or created in the repository. v1.2 adds §6, the exact bootstrap plan, and re-verifies the repository state.

## 1. Repository of record (OC-08)

| Item | Value |
|---|---|
| Repository | `sinharomesh-cpu/AA-Learning-Portal` — https://github.com/sinharomesh-cpu/AA-Learning-Portal |
| Default branch | `main` |
| Use | AA Pro Learning Portal source code and approved project documentation **only** |

## 2. Repository inspection (performed 14 Oct 2026, read-only)

| Check | Method | Result [Verified] |
|---|---|---|
| Repository reachable | Attached with read access; `git clone --depth 1` | Cloned. Git reported "You appear to have cloned an empty repository". |
| Remote | `git remote -v` in the clone | `origin https://github.com/sinharomesh-cpu/aa-learning-portal` (fetch/push). It matches the repository of record; GitHub URLs are case-insensitive. |
| Refs / branches | `git ls-remote origin`; GitHub API `/branches` | **No refs; zero branches.** `main` is configured as default but does not exist yet. |
| Commits / history | `git status`; `git rev-parse HEAD` | **No commits.** There is no history to preserve. |
| Files (README, config, licence, .gitignore) | `ls -A` in the clone | **None.** Only the local `.git` folder. |
| Metadata | GitHub API | Private: yes · Archived: no · Size: 0 · Created 2026-10-12 14:49 UTC · Description: "A learning portal made for Kids" |

**Conclusion.** The repository is empty, so there is nothing to audit or preserve. As your instruction requires, I am proposing a structure (§4) for approval before the implementation milestone. **No files have been written to the repository.**

The read-only clone sits at `/home/claude/aa-learning-portal` in this session's workspace. It is used for nothing else. The G1 documents were written outside it and are stored in the AA Pro project.

## 3. Isolation rules (OC-07, OC-09)

1. AA Pro and **P4Bpay.com** are independent brands and projects. There is no shared branding, logos, links, product names, content, design assets, code, configuration, environment variables, database schemas, secrets, deployment settings, requirements or documents without your explicit approval. This applies in both directions.
2. The AA Pro working directory is a clone of `AA-Learning-Portal` only. No other repository is used as, or nested inside, the working directory.
3. Third-party tools (e.g. Next.js, Postgres, Playwright) may be chosen independently on AA Pro's own merits. Choosing them for AA Pro creates no link to P4Bpay.com.
4. AA Pro has no payment functionality (FRD OD-09). The isolation rule reinforces that nothing payment-related is imported from P4Bpay.com.
5. Secrets, `.env` files, credentials, tokens and any real student data are never committed. Demo data is synthetic only (OC-04).
6. No production service connection, infrastructure change or deployment without explicit approval.
7. The Stitch exports stay read-only references.

## 4. Proposed repository structure (for approval, not created)

```
AA-Learning-Portal/
├─ README.md                 # AA Pro overview, setup, scripts, links to docs
├─ .gitignore                # node, Next.js, coverage, .env*, *.pem, local data, OS files
├─ .env.example              # placeholder variable NAMES only, no values
├─ .editorconfig / .nvmrc    # tooling consistency
├─ package.json              # single app (no monorepo until needed)
├─ docs/
│  ├─ requirements/          # FRD v1.1 reference (a link or a copy, per your choice)
│  ├─ g1/                    # G1-00…G1-06 once approved
│  ├─ decisions/             # decision register (ADR-style)
│  └─ design/                # design-inventory, deviation log, token docs
├─ design-reference/
│  └─ stitch-export/         # read-only Stitch exports + checksums (see D-30)
├─ src/
│  ├─ app/                   # Next.js App Router: (student) (parent) (teacher) (admin) (auth) route groups
│  ├─ components/            # CMP-* components (G1-02 Appendix A)
│  ├─ config/brand.ts        # single source for "AA Pro" and "AA Pro AI Tutor"
│  ├─ styles/                # tokens from DESIGN.md front-matter
│  ├─ server/                # authz, booking, slot engine, provider adapters (mocked first)
│  └─ fixtures/              # synthetic demo data only
├─ tests/                    # unit, integration, e2e (Playwright), visual, a11y
└─ .github/
   ├─ workflows/ci.yml       # lint, type-check, test, build, secret scan, banned-brand-string check
   ├─ pull_request_template.md
   └─ CODEOWNERS (optional)
```

**Proposed working practices**
- Work happens on feature branches (`feat/…`, `docs/…`), merged to `main` by pull request with a milestone report. No direct pushes to `main` after the first approved bootstrap commit.
- Branch protection on `main` (you enable it in GitHub settings; I cannot do this without admin rights).
- CI includes a secret scan and a check that fails the build if banned brand strings ("Lumina", "Lumi", "P4Bpay") appear in source.

## 5. Decisions (updated G1 v1.2)

| ID | Status |
|---|---|
| D-29 Repository structure and practices | **Approved** (OC-16). The exact bootstrap tree is shown in §6 before any commit. |
| D-30 GitHub contents | **Approved** (OC-17): FRD plus the selected Stitch HTML/screenshots with checksums; no ZIPs. **But see D-33:** the selected files themselves contain the demo child names. |
| D-31 Local directory | **Approved** (OC-18): `AA-Learning-Portal` |
| D-33 How Stitch references enter Git | **Open — blocks the bootstrap commit** |
| D-34 Approve the exact bootstrap commit (§6) | **Open — blocks the bootstrap commit** |

## 6. Bootstrap plan (proposed — nothing has been created, committed or pushed)

### 6.1 Repository state re-verified (14 Oct 2026, 05:48 UTC)

| Check | Result [Verified] |
|---|---|
| `git remote -v` | `origin https://github.com/sinharomesh-cpu/aa-learning-portal` (matches the repository of record) |
| `git ls-remote origin` | No refs |
| `git status` in the local clone | "No commits yet on main"; working tree contains only `.git` |
| GitHub API: repository | private: true · default_branch: main · size: 0 · last push 2026-10-12 14:49 UTC (creation) |
| GitHub API: branches / commits | 0 branches · "Git Repository is empty" (HTTP 409) |

The repository is in the expected empty state. I will re-run these checks immediately before the bootstrap commit and stop if anything has changed.

### 6.2 Local directory (D-31)

The read-only inspection clone currently sits at `/home/claude/aa-learning-portal`, the lower-case name the session tool chose. At bootstrap I will clone again into `/home/claude/AA-Learning-Portal`, confirm the remote, and remove the inspection clone only after confirming it is still empty. No other repository will be used.

### 6.3 Exact bootstrap file tree (first commit — documentation and configuration only; no application code)

```
AA-Learning-Portal/
├── README.md                          # AA Pro overview, status "Phase 1 not started", links to docs/, rules (no secrets, synthetic data)
├── .gitignore                         # node_modules, .next, out, coverage, .env, .env.*, !.env.example, *.pem, *.key, .DS_Store, *.log, playwright-report, test-results
├── .gitattributes                     # text=auto eol=lf; *.png *.pdf binary
├── .editorconfig                      # utf-8, lf, 2-space indent, final newline
├── .env.example                       # variable NAMES only, empty values, grouped by phase (see 6.4)
├── .github/
│   └── pull_request_template.md       # scope, files changed, tests run, risks, screenshots, "no secrets / real child data" checklist
├── docs/
│   ├── README.md                      # index of all documents
│   ├── requirements/
│   │   ├── AA_Pro_FRD_v1.1.pdf        # baseline, unchanged
│   │   └── CHECKSUMS.sha256
│   ├── g1/
│   │   ├── AA_Pro_Phase0_Audit_Report.md
│   │   ├── G1-00_Completion_Report.md
│   │   ├── G1-01_Canonical_Screen_Inventory.md
│   │   ├── G1-02_Requirements_Traceability_Matrix.md
│   │   ├── G1-03_Missing_Screen_Design_Briefs.md
│   │   ├── G1-04_Design_Change_and_Accessibility_Log.md
│   │   ├── G1-05_Decision_Register.md
│   │   └── G1-06_Repository_and_Project_Isolation_Plan.md
│   └── design/
│       └── missing-screens.md         # link to the approved design canvas + approval record (D-32)
└── design-reference/
    ├── README.md                      # read-only notice, provenance, what is excluded and why
    ├── ORIGINAL_CHECKSUMS.sha256       # SHA-256 of both original ZIPs (kept outside Git)
    └── stitch-selected/                # contents depend on D-33 (see 6.5)
```

**Not in the bootstrap commit:** `package.json`, any `src/` code, CI workflows (added in Phase 1 with the app scaffold, when there is something to lint and test), the original Stitch ZIPs, and any secret or `.env` file.

### 6.4 `.env.example` (names only)

`APP_BASE_URL` · `DATABASE_URL` · `AUTH_SECRET` · `STORAGE_BUCKET` · `STORAGE_ACCESS_KEY_ID` · `STORAGE_SECRET_ACCESS_KEY` · `ELEVENLABS_API_KEY` · `ELEVENLABS_AGENT_ID` · `ZOOM_ACCOUNT_ID` · `ZOOM_CLIENT_ID` · `ZOOM_CLIENT_SECRET` · `EMAIL_PROVIDER_API_KEY` · `EMAIL_FROM_ADDRESS` · `WHATSAPP_PROVIDER_API_KEY` (later) · `APP_TIMEZONE_DEFAULT`. All values are empty. Provider names stay generic until providers are chosen.

### 6.5 `design-reference/stitch-selected/` under each D-33 option

| Option | Contents committed |
|---|---|
| **B (recommended)** | 13 derived screen HTML files (S1, S9, S11–S21) plus `DESIGN.md` (which contains no names), with demo names replaced by synthetic names and the real school replaced by "Sample Primary School". Each file has a header comment marking it as a redacted derivative, with the SHA-256 of its original. No screenshots. |
| A | The 13 original HTML files and 13 screenshots, unmodified, with checksums |
| C | Nothing; only `ORIGINAL_CHECKSUMS.sha256` and the G1-01 inventory |

### 6.6 Commit and push

- **One commit** on `main`: `docs: bootstrap AA Pro repository (G1 documentation, references, config)`, with the session attribution lines.
- Push to `origin main` only after you approve D-33 and D-34. I will then report the commit SHA, the file list and `git ls-remote` output as evidence.
- After that, you enable branch protection (A-03). All later work goes through feature branches and pull requests.
