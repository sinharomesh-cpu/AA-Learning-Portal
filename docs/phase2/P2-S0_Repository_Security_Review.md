# AA Pro — P2-S0 Repository visibility, history and branch protection review

**Version:** 1.0 · 16 Oct 2026 · **Prepared by:** Claude (build team).
This is the build team's own check, requested in the owner's instructions of 16 Oct 2026 (§3). It is **not** the independent Phase 2 security review (OC-70) and **not** a human assessment.

## 1. What was checked and how

| Check | Method | Result |
|---|---|---|
| Repository visibility | GitHub API | **Public.** Anyone can read the code and its full history |
| Secrets in history | Every file version ever committed (454 file versions, all branches) extracted and scanned with detect-secrets 1.5.0 | **No real secrets found.** 9 hits, all false positives: words such as "password" in documentation, audit-label names, and the hashed entries inside `.secrets.baseline` |
| Test-site secrets | The actual `AUTH_SECRET` and access-password values searched across all history (`git log -S`) | **Never committed.** They exist only in Vercel and in a private file outside the repository |
| Secret-looking files | All file names in history checked for `.env`, keys, `.pem`, `id_rsa` | Only `.env.example` (names only, no values) and `.secrets.baseline` (hashes) |
| Identifying terms | Owner-provided term list (kept outside Git), scanned in CI on every pull request | Current files clean. **7 entries in an old version of the common-password list remain in history** (known; accepted by the owner as OC-56, revisit at A-08) |
| Personal data in commit metadata | `git log --format='%ae'` | **33 merge commits show the owner's personal email address as the author.** Merges are made through the owner's GitHub connection, so GitHub records that address. Visible to anyone because the repository is public |
| Branch protection | GitHub API | **None.** No ruleset and no classic protection on `main` |

## 2. Findings and recommendations

| # | Finding | Risk | Recommendation | Who |
|---|---|---|---|---|
| S0-1 | `main` has no protection | A change could reach `main` without CI. This hasn't happened: every merge went through a pull request with all checks passed | Turn on the ruleset in §3 | Owner (Claude's access can't change repository rules) |
| S0-2 | Owner's personal email in public commit metadata | Low–medium: spam, or targeting of the owner | (a) GitHub → Settings → Emails: tick **"Keep my email addresses private"** and **"Block command line pushes that expose my email"**. Future merges then show a `noreply` address. (b) Past commits: either make the repository private (A-08), or rewrite history — **not recommended** (breaks every link and needs a force-push) | Owner |
| S0-3 | Public repository | Code, documents and history are readable by anyone. No secrets or child data are in it | Make it private when GitHub Pro is active (A-08). Note: on the free plan, rulesets can't be enforced on private repositories, so keep it public **with** protection until then | Owner (A-08) |
| S0-4 | Test-site secrets were shared in this chat | The chat is private, but the values are long-lived | Rotate `AUTH_SECRET` and the access password before any real-user use (already planned). The production site will get its own values | Claude prepares new values when asked |
| S0-5 | Identifying terms in history (OC-56) | Known, accepted | Revisit at A-08 | Owner |

**No credentials need rotating today**: none were ever committed.

## 3. Owner steps: protect `main` (OC-69, A-03)

Claude tried to create this through the API. GitHub answered: *"Write access to this GitHub API path is not permitted through this proxy."* Please do it in the browser:

1. Open **github.com/sinharomesh-cpu/AA-Learning-Portal** → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name:** `Protect main`. **Enforcement status:** **Active**.
3. **Bypass list:** leave empty.
4. **Target branches:** **Add target** → **Include default branch**.
5. Tick these rules:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging**:
     - Required approvals: **0**. Claude merges after CI passes (OC-32).
   - **Require status checks to pass**, then **Add checks** and add each of these ten names exactly:
     - `privacy-and-brand`
     - `secret-scan`
     - `lint`
     - `typecheck`
     - `test`
     - `build`
     - `e2e`
     - `db`
     - `e2e-real`
     - `hosted-demo`

     Pick the ones labelled "GitHub Actions" if asked.
6. Click **Create**.
7. Tell Claude. Claude will confirm on the next pull request that a direct push to `main` is refused and that the ten checks appear as **Required**.
