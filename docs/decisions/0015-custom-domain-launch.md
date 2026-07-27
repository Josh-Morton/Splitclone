# ADR-0015: Custom domain + custom auth email, staying on free tiers

**Status:** Accepted (2026-07-27) · **Source:** Josh (Phase 10 spec) · ROADMAP Phase 10

## Context
Tally has been running at `splitclone-joshprojects13.vercel.app` for a closed
household. Josh now wants to buy a real domain, retire that URL, and expect
"quite a few users" — strangers, not just his own household. Two facts,
confirmed live, drive the scope:

- **Every share link and auth redirect in the app is already built from
  `window.location.origin`** (`invite-sheet.tsx`, `split/[code]/page.tsx`,
  `welcome/page.tsx`, `verify/page.tsx`) — there is **no hardcoded domain
  anywhere in application code**. Moving domains is a configuration exercise,
  not a code migration.
- **Supabase's built-in auth mailer is capped at `rate_limit_email_sent: 2`**
  (confirmed via the live project config) — two emails per hour, project-
  wide. That's a testing limit. It already technically blocks Phase 1's E6
  trial at any real scale and would make signup/password-reset silently fail
  for anyone beyond the first couple of people per hour. This was flagged as
  optional/backlogged in Phase 0; it stops being optional here.

## Decision
- **Vercel custom domain, apex-primary, `www` redirects to apex.** Standard
  TLS-via-Let's-Encrypt, auto-renewed, no separate certificate work. The
  project's `*.vercel.app` fallback URL keeps existing (Vercel doesn't let you
  remove it) but is never surfaced to a user — nothing in the app links to it
  once the custom domain is attached and set primary.
- **Supabase Auth `site_url` and redirect allow-list move to the new domain**
  (currently `https://splitclone-joshprojects13.vercel.app` +
  `http://localhost:3000` — `*.vercel.app` gets dropped once cutover is
  confirmed working; `localhost` stays for local dev).
- **Custom SMTP via Resend, reusing the existing (currently dormant) Resend
  integration.** `notify-removed` (Phase 6) already has the sending code and
  a `RESEND_FROM` fallback — it just never got an API key, so it's never
  actually sent anything in production. Setting up Resend for auth email and
  for that feature is the same piece of work: verify the new domain with
  Resend (DNS records, same sitting as the domain's own DNS), then point
  Supabase Auth's SMTP settings and the `notify-removed` function secret at
  it. One domain verification, two features unblocked.
- **Stay on free tiers (Vercel Hobby, Supabase Free) for now** — Josh's call.
  This phase documents exactly which free-tier ceiling matters and what
  crossing it looks like, so upgrading later is a known, fast decision, not a
  scramble. No new recurring cost from this phase.
- **Rename "SettleUp" → "Tally" everywhere it still appears** — package name,
  READMEs, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md` — since the
  product itself already fully switched names in Phase 6 (manifest, title,
  icons) and only internal/dev-facing docs still say the old name. Historical
  records (`docs/decisions/`, `docs/phases/`, the original source `.docx`
  specs, the `design_handoff_settleup/` folder) are **not** touched — this
  repo's own convention is to never rewrite history, only supersede it, and
  that applies to old project-name references the same way it applies to old
  decisions.
- **"Tally-ho" stays the push-notification catchphrase, not the product
  name.** A fuller "Tally-ho" brand treatment (if wanted) is explicitly a
  later, separate redesign phase — not bundled into an infra migration.
- **No privacy policy / terms page, no CAPTCHA, no paid tier, no Supabase
  project migration in this phase** — each considered, each deliberately out
  (see the phase file's non-goals).

## Consequences
- The email rate-limit fix (custom SMTP) is now a **launch blocker**, not a
  nice-to-have — without it, real signups fail silently past ~2/hour. This
  reprioritizes what was a backlog item since Phase 0/6.
- Because nothing in the codebase hardcodes the old domain, there is **no
  code-change risk** in this migration — the risk is entirely in
  configuration sequencing (DNS propagation timing, getting the Supabase
  Auth allow-list updated before/alongside the domain going live, so nobody
  hits a broken redirect mid-cutover).
- The Supabase **project ref** (`zgoinuagmornkwgqomhq.supabase.co`) is not
  renamed or migrated — it's never user-facing (only appears in API calls a
  technical user could see in devtools, not a name or brand), and migrating
  it would mean a real data migration for zero user-visible benefit.
- Staying on free tiers means this phase produces a **documented watchlist**
  (Realtime concurrent connections, Gemini scan quota, Resend send volume,
  Vercel Hobby's non-commercial intent) rather than a resolved capacity plan
  — revisit when a specific limit is actually approached, not preemptively.
