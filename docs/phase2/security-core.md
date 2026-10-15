# AA Pro — Phase 2 security core (WP2-2)

Code: `src/server/auth/`. Tests: `src/server/auth/password.test.ts`, `tests/db/auth-core.test.ts`.

| Area | Rule | Source |
|---|---|---|
| Hashing | Argon2id, 19 MiB, 2 iterations, parallelism 1; salted; verified in constant work even for unknown accounts | OC-35, G1-08 §3.1 |
| Password policy | Adults ≥ 12, children ≥ 8, all ≤ 64 characters (counted as characters); passphrases allowed; no composition rules; common and leaked passwords refused using an offline list of 17,943 entries | OC-35 (D-37) |
| Sessions | Random 32-byte token in an HttpOnly cookie; only its SHA-256 is stored; revocable; invalid after a password change or when the account is not active | G1-08 §3.2 |
| Session lifetimes | Children: 60 min idle, 12 h maximum (OC-35). Parents and teachers: 120 min idle, 12 h maximum. Super Admin and Admins: 30 min idle, 8 h maximum. | Children approved; adult and admin values are Claude's technical defaults, changeable |
| Step-up | Re-entering the password counts for 5 minutes | G1-08 §3.4 |
| Lockout | 5 consecutive failures lock a username or email for 15 minutes, whether or not it exists; attempts during a lock are not counted and do not extend it; success clears it; the parent can unlock early | OC-35, G1-08 §3.2–3.3 |
| Address limit | More than 20 failures from one address within 15 minutes are refused for the rest of that window | G1-08 §3.2 |
| Stored identifiers | Throttle keys are HMAC-SHA-256 with `AUTH_SECRET`; no username, email or IP is stored in readable form | G1-08 §3.2 |
| Audit | Append-only; details refuse keys that look like passwords, tokens, codes or secrets | OC-21, G1-08 §3.5 |

**Client address.** Throttling uses the first `X-Forwarded-For` entry. Vercel sets this header from the real
client address; any other host must sit behind a proxy that does the same, or the per-address limits can be
bypassed.

**Request limits (WP2-3).** Sign-up, password-reset and new-confirmation requests are limited to 10 per hour
per address, and each account gets at most one reset or confirmation email per 15 minutes.

Not in this package: sign-in pages, registration, recovery and MFA (WP2-3 to WP2-5).

**Known limit:** the leaked-password list is a fixed offline list. A larger, always-current list
(for example the Have I Been Pwned range API) would need an outside service and separate approval.
