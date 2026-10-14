# AA Pro — Hosted demo preview (OC-34)

**Approved:** owner, 14 Oct 2026, 19:01 IST ("Approve the preview"). This replaces the "local and CI only" limit of OC-28 for the demo preview only.

## What it is

A private-link web address where the owner can click through the Phase 1 prototype with the sample accounts. It is the same code as `main`, built as a normal production build with two settings:

| Setting | Value | Meaning |
|---|---|---|
| `AA_DEMO_MODE` | `true` | Sample sign-in with the demo accounts |
| `AA_HOSTED_DEMO` | `true` | Allows sample sign-in in a hosted build (approved preview only) |

## Safety rules (enforced in code, `src/config/demoGate.ts`)

- A production build with `AA_DEMO_MODE=true` **fails** unless `AA_HOSTED_DEMO=true` is also set.
- A demo build **fails** if any real-service setting is filled in (database, sign-in secret, storage, ElevenLabs, Zoom, email, WhatsApp). The demo can never run next to real data or providers.
- Every page shows a "Demo preview. Sample data only." banner.
- Every response carries `X-Robots-Tag: noindex, nofollow`, and pages carry `robots: noindex`, so search engines do not list it.
- The sample session cookie is `HttpOnly` and `Secure`.
- CI job `hosted-demo` builds exactly like the preview and checks all of the above on every change.

What it is **not**: it is not the production launch. No real accounts, children's data, bookings, meetings or messages exist. Production deployment still needs separate explicit approval (Phase 8).

## Hosting

Recommended host: Vercel (made by the authors of Next.js; connects to GitHub and updates automatically when `main` changes).

Plan note (checked 14 Oct 2026): Vercel's free Hobby plan is for "non-commercial personal use only". Commercial use, defined to include a project built for anyone's financial gain, needs the Pro plan ($20/month, free trial offered). AA Pro is a business product, so the owner should choose the plan; Claude does not decide this. Source: https://vercel.com/docs/limits/fair-use-guidelines

## Owner steps (about 5 minutes)

1. Go to https://vercel.com/signup and choose **Continue with GitHub**. Sign in with the GitHub account that owns `AA-Learning-Portal`.
2. Choose the plan (see the plan note above).
3. Go to https://vercel.com/new, find **AA-Learning-Portal** in the list and click **Import**. If it is not listed, click the option to adjust GitHub app permissions and allow this repository.
4. On the next screen, leave the framework as **Next.js** and the other build settings as they are.
5. Open **Environment Variables** on the same screen and add two entries:
   - Name `AA_DEMO_MODE`, value `true`
   - Name `AA_HOSTED_DEMO`, value `true`
   Do not add anything else.
6. Click **Deploy** and wait about 2 minutes. Vercel shows the web address (ending in `.vercel.app`).
7. Send the address to Claude, who checks it and confirms it works.

After this, every change merged to `main` updates the preview automatically.

## Who can see it

Anyone who has the web address can open it. It holds only made-up sample data, and the code is already public. Do not put real names, real children's details or real school material into it.

## Switching it off

In Vercel: project → Settings → scroll to the bottom → **Delete Project**. The code on GitHub is not affected.
