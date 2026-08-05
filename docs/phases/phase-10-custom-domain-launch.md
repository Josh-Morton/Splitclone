*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 10 — Custom domain & public launch prep 📝 SPEC ONLY — NOT BUILT (2026-07-27)

> **Effort:** S · **Credits:** ~5–12 — small in code (env vars, a redirect,
> Resend keys) but gated on Josh buying the domain and on DNS propagation, so
> elapsed time far exceeds the work. See
> [Estimating scale](../ROADMAP.md#estimating-scale).

> **Status: fully specced, zero changes made.** Same convention as Phases 8/9:
> exhaustive enough to execute from this document alone. This is a
> **planning** phase per Josh's request — nothing below has been done yet.
> See **[ADR-0015](../decisions/0015-custom-domain-launch.md)** for the
> decisions this spec implements — read it first.

## Goal
Move Tally off `splitclone-joshprojects13.vercel.app` onto a real domain Josh
buys, with clean URLs that carry no trace of "Josh," "splitclone," or
"vercel" anywhere a user would see — "like a normal app." Prepare for **real
strangers** to sign up, not just the household, which surfaces one concrete
launch-blocker (auth email rate limiting) alongside the domain move itself.

## The good news first: the app needs zero code changes to move domains
Confirmed by grep across the whole client: every share link
(`invite-sheet.tsx`, `split/[code]/page.tsx`) and every auth redirect
(`welcome/page.tsx`, `verify/page.tsx`) is built from
**`window.location.origin`** at runtime — nothing hardcodes the current
domain anywhere in application code. The PWA manifest's `start_url`/`scope`
are relative too. **This entire phase is configuration, not development** —
Vercel, Supabase, and DNS settings, plus a handful of doc/package renames.
The app's internal URL paths (`/`, `/welcome`, `/join/[code]`, `/split/[code]`,
etc.) are already clean, human-readable, and carry no personal info — nothing
to fix there either. What actually needs to change is the **origin** those
paths hang off.

## What Josh needs to do (his accounts only — Claude can't do these)
**Registrar: Afrihost** (confirmed 2026-07-27). What that means concretely:
1. **Buy the domain at Afrihost.** Recommend apex-primary (e.g. `tally.co.za`
   or `.app`/`.com` if preferred, not `app.tally.co.za`) with `www`
   redirecting to apex — simplest, most conventional for a PWA that *is* the
   whole product (no separate marketing site).
2. **Add DNS records in Afrihost's DNS Zone Editor** (client portal → the
   domain → DNS management — no nameserver change needed, Afrihost stays the
   DNS host, records just get added/edited there):
   - The `A`/`CNAME` records Vercel gives you in step 1 of the checklist
     below.
   - The SPF/DKIM `TXT` records Resend gives you when you add the domain
     there (step 2 below).
   - **Check for a pre-existing `@` A record first** — Afrihost domains
     sometimes ship with one pointing at a parking page or their own
     hosting; it needs to be replaced, not left alongside Vercel's.
3. **Create a Resend account** (free tier: 3,000 emails/mo, 100/day — not
   an Afrihost product, separate free signup) and add the new domain there —
   Resend hands back the DNS records for step 2 above.
4. **Decide the sender address** for auth + notification email, e.g.
   `noreply@yourdomain` or `hello@yourdomain`. (Afrihost also sells its own
   mailboxes on the domain — fine if Josh wants a personal inbox like
   `admin@yourdomain`, but not what sends the app's automated email; that's
   Resend, for deliverability and rate limits.)
5. **Optional, cosmetic:** pick a new GitHub repo name if you want
   `Josh-Morton/Splitclone` renamed (GitHub auto-redirects the old URL after
   a rename, so this is low-risk, but Claude has no GitHub token in this
   environment to do it — needs to happen in GitHub's own UI, or hand Claude
   a token). Same for renaming the Vercel project (cosmetic — only changes
   the unused `*.vercel.app` fallback slug, not required for the custom
   domain to work).

Once the domain + Resend account exist, the rest is executable by Claude in
one sitting (Vercel domain attach, Supabase Auth reconfiguration, SMTP setup,
doc/package renames) — DNS propagation is the only real wait.

## Execution checklist (for when this is actually built)

### 1. Attach the domain
- Vercel → Project → Domains → add the new domain. Vercel returns the exact
  DNS records to add — for a domain kept at Afrihost (not delegated to
  Vercel's nameservers), that's an **`A` record** at the root (`@`) to
  Vercel's apex IP (`76.76.21.21`) and a **`CNAME`** for `www` to
  `cname.vercel-dns.com`. Add both in Afrihost's DNS Zone Editor.
- Set the new domain **primary** in Vercel; keep `www` as a redirect to apex
  (one checkbox in Vercel's domain settings).
- TLS is automatic (Let's Encrypt) once DNS resolves — no separate cert step.
- **Sequencing note:** DNS can take minutes to ~48h to propagate (Afrihost's
  default TTLs are usually modest, but don't assume instant). Don't drop the
  old `*.vercel.app` from Supabase's redirect allow-list (below) until the
  new domain is confirmed serving traffic and auth works end-to-end on it —
  otherwise anyone mid-propagation hits a broken magic-link redirect.

### 2. Reconfigure Supabase Auth (breaks auth if missed)
Current live values (confirmed via the Management API):
```
site_url        = https://splitclone-joshprojects13.vercel.app
uri_allow_list  = http://localhost:3000/**, https://*.vercel.app/**
```
Change to:
```
site_url        = https://<new-domain>
uri_allow_list  = http://localhost:3000/**, https://<new-domain>/**
```
(Drop the `*.vercel.app` entry once the new domain is verified working end
to end — see Verification below. Keep `localhost` for local dev.)

### 3. Custom SMTP — the actual launch blocker
Current live values (confirmed): `smtp_host = None`,
`rate_limit_email_sent = 2`. Supabase's default mailer sends **at most two
emails an hour, project-wide** — every signup confirmation, magic link, and
password reset shares that cap. This already borderline-blocks Phase 1's E6
trial and will silently break onboarding the moment more than ~2 people/hour
try to sign up.

Fix: Supabase dashboard → Auth → SMTP Settings → point at Resend
(`smtp.resend.dev`, port 465/587, API key as the SMTP password, from-address
= the one Josh picked above, on the newly-verified domain). This removes the
rate cap entirely (subject to Resend's own 100/day free-tier limit — see
Watchlist below).

**Bonus unblock:** `notify-removed` (Phase 6 — "you were removed from a
space" email) has working send code but **no `RESEND_API_KEY` secret was
ever set** (confirmed absent from the function secrets list) — it's been a
silent no-op in production since it shipped. Setting `RESEND_API_KEY` +
`RESEND_FROM` as Supabase Function secrets during this same Resend setup
switches that feature on for free, same domain verification covers both.

### 4. Rename "SettleUp" → "Tally" in the files that still say it
The product itself already fully renamed in Phase 6 (manifest, page title,
icons). What's left is internal/dev-facing docs and package metadata —
confirmed via grep, exactly these files:
- `settleup/package.json` — `"name": "settleup"` → `"name": "tally"`
- `README.md` (root)
- `settleup/README.md`
- `CLAUDE.md` (currently titled "SettleUp — guide for LLMs...")
- `docs/ARCHITECTURE.md` (currently titled "SettleUp — Architecture")
- `docs/SETUP.md` (one reference: "the SettleUp icon")

**Deliberately not touched** — this repo's own convention is to never rewrite
history: `docs/decisions/*.md`, `docs/phases/*.md`, the two source `.docx`
specs, the `design_handoff_settleup/` folder (including its internal
`SettleUp.dc.html` prototype and its README), and the doc-comment in
`src/lib/domain/types.ts` referencing the original spec doc's title.

### 5. Update the docs that reference the old URL
Once the new domain is live, update the plain-text URL references (not code)
in: `docs/ROADMAP.md` ("Where we are"), `CLAUDE.md` ("Production:" line),
`docs/phases/phase-00-foundations.md`, `docs/phases/phase-02-offline-first.md`.
These are status notes, not links that break anything — just stale after
cutover.

### 6. Nice-to-have while touching `layout.tsx` anyway
No `metadataBase` or Open Graph tags exist today, so sharing the app link in
WhatsApp/iMessage shows a bare URL with no preview card. Cheap to add
alongside this move:
```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://<new-domain>"),
  title: "Tally",
  description: "Shared expenses for your home — always know who owes whom.",
  openGraph: { title: "Tally", description: "…", url: "/", siteName: "Tally" },
  // ...existing manifest/icons/appleWebApp fields unchanged
};
```
Not required for the domain move to work — purely a "looks like a normal
app when shared" polish item, matching the spirit of the ask.

## Verification (once executed)
- Full auth loop on the new domain: sign up → confirmation/magic-link email
  arrives (via Resend, not the old 2/hour mailer) → link redirects to the new
  domain, not the old one → lands signed in.
- Password reset loop, same domain check.
- Splitty share link and invite share link both resolve to
  `https://<new-domain>/split/<code>` / `/join/<code>` — confirms the
  origin-relative link code needed no changes.
- Install the PWA fresh from the new domain on a real phone (Android per
  Phase 9's precedent) — confirms manifest `start_url`/`scope` behave.
- Old `*.vercel.app` URL still loads (Vercel never removes it) but nothing in
  the app links to it — spot check there's no stray reference left after the
  doc updates in step 5.
- `notify-removed` actually sends now — trigger a real removal in a test
  space and confirm the email arrives.

## Free-tier watchlist (documented, not acted on — Josh's call this phase)
Staying on Vercel Hobby + Supabase Free. What to watch, and what crossing it
means:

| Limit | Free-tier cap | What crossing it looks like | Fix when it happens |
|---|---|---|---|
| Supabase auth mailer | 2 emails/hour (fixed by custom SMTP above) | N/A once Resend is wired up | — |
| Resend sending | 100/day, 3,000/mo | Auth emails + removal notices start bouncing/queuing | Resend paid tier (~$20/mo) or a second provider |
| Supabase Realtime | 200 concurrent connections | Splitty bills + shopping list stop live-updating for some users under heavy simultaneous use | Supabase Pro (~$25/mo) raises the cap substantially |
| Supabase DB/storage | 500MB DB, 1GB storage, 5GB bandwidth/mo | Slow queries / write failures as data grows | Supabase Pro |
| Supabase project pause | Auto-pauses after 7 days idle | Already mitigated — `/api/keepalive` cron pings daily | No action needed |
| Gemini receipt scanning | 10 req/min, 1,500/day (shared across all users, one central key — ADR-0012) | Scans start failing with a rate-limit error during busy periods | Paid Gemini key (still cheap) or reconsider the "one central key" model |
| Vercel Hobby | 100GB bandwidth/mo; **Hobby is licensed for non-commercial use** | Approaching real traffic/cost, or wanting commercial terms | Vercel Pro (~$20/mo) |

None of these are urgent today. Revisit whichever one is actually being
approached, not preemptively.

## Explicit non-goals for this phase
- **No paid-tier upgrade** — Josh's call, stay free-tier; the table above is
  the trigger list for later.
- **No privacy policy / terms page** — deferred, Josh's call. Worth
  remembering once real strangers' financial data (salaries, expenses) is
  genuinely at stake — tracked in [`docs/BACKLOG.md`](../BACKLOG.md), not
  built here.
- **No CAPTCHA / bot-signup prevention** — `security_captcha_enabled` stays
  off. Only worth doing if bot signups become an observed problem, not
  preemptively; would need an hCaptcha account if/when revisited.
- **No deeper "Tally-ho" rebrand** — Josh confirmed this is a later, separate
  redesign phase, not part of an infra migration.
- **No Supabase project rename/migration** — the project ref is never
  user-facing; migrating it is real data-migration risk for zero visible
  benefit (see ADR-0015).
- **No changes to Splitty's anon-writable RPCs** — already reviewed and
  accepted under ADR-0013; wider public exposure doesn't change that
  analysis, just widens who could theoretically reach it (still scoped to a
  specific bill's share code + token per request).

## Build order (when this gets picked up)
1. Josh: buy the domain, create the Resend account, verify the domain there.
2. Attach + verify the domain in Vercel (primary, www→apex redirect).
3. Update Supabase Auth `site_url` + redirect allow-list (Management API,
   this project's usual path).
4. Configure Supabase Auth custom SMTP with Resend; set `RESEND_API_KEY` +
   `RESEND_FROM` Function secrets (unblocks `notify-removed` too).
5. Rename SettleUp → Tally in the five files listed above; update stale URL
   references in the docs listed above.
6. Add `metadataBase` + basic OG tags to `layout.tsx` (optional polish).
7. Run the full verification list above, including a real-device PWA
   install from the new domain.
8. Once confirmed stable, drop `*.vercel.app` from the Supabase redirect
   allow-list.
9. Optional cosmetic cleanup: rename the GitHub repo and/or Vercel project.
10. Update this file's status line to "✅ SHIPPED", verify + ship per
    CLAUDE.md.
