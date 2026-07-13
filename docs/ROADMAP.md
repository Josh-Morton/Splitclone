# SettleUp — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are.
> Full epic/task detail with acceptance criteria lives in the Phase 1 plan doc
> (`SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`).

**Last updated:** 2026-07-13 (E3 invites + E4 edit shipped)

## Where we are

**Phase 0 is done and the backend is live.** Supabase project
`zgoinuagmornkwgqomhq` has the schema + RLS applied and verified end-to-end
(two-user RLS isolation test passed). E1 auth/onboarding screens and the
SupabaseRepo are built and verified. Remaining before M1 work continues:
Vercel deploy settings (root dir `settleup/` + env vars — needs Josh's
dashboard), optional SMTP for real 6-digit OTP codes (magic link works
meanwhile), then E3 invites and E4 expense-entry UI.

## Phase 0 — Foundations

- [x] Git repo initialized; project structure (`settleup/` app, `docs/`, `supabase/`)
- [x] Next.js (App Router, TS) scaffold with PWA manifest, icons, service worker
- [x] Design tokens in `globals.css` from the design handoff
- [x] Domain maths ported + 41 unit tests passing (splits, balances, simplify, money, auto-category)
- [x] Repo data-layer interface + in-memory demo implementation (ADR-0005)
- [x] Phase-1 schema migration + RLS written (`supabase/migrations/20260702000000_phase1_schema.sql`)
- [x] Keep-alive cron route (`/api/keepalive` + `vercel.json`)
- [x] ADRs 0001–0008 recorded
- [x] Supabase project created + migration applied via Management API (2026-07-09;
      port 5432 is blocked on this network — use the Management API `database/query`
      endpoint or the SQL editor, not `supabase db push`)
- [x] `.env.local` configured with anon key; REST + RLS connectivity verified
- [x] GitHub repo pushed: https://github.com/Josh-Morton/Splitclone
- [x] Vercel live: **https://splitclone-joshprojects13.vercel.app** (2026-07-10).
      Root Directory + framework set via API (token in macOS keychain, service
      "Vercel Token (SettleUp)", expires ~2026-10; project
      `prj_Pn9YOGxi6sgUcACgUU2glH0mBu02`, team `team_YTsxApEip0v1AllLCINb5CYy`).
      Env vars were already set by Josh. Pushes to main auto-deploy.
- [x] Supabase Auth `site_url` set to the Vercel URL; `*.vercel.app` +
      localhost in the redirect allow list
- [ ] **Manual (Josh, optional):** custom SMTP (e.g. free Resend) so OTP emails
      contain a real 6-digit code — free tier can't edit templates on the default
      sender; magic-link sign-in works meanwhile
- [ ] Verify PWA installs to an Android home screen from the deployed URL

## Phase 1 — Core ledger (MVP) → milestone M1 "It works for us"

- [x] **E1 Auth & onboarding** — email OTP sign-in (ADR-0006; code entry +
      magic-link fallback), onboarding (name → optional salary → create space),
      client-side session + route guards, demo mode. Join-space-by-code lands
      with E3. (2026-07-09, verified in browser)
- [x] **E2 Schema live** — migration + expense RPCs applied; RLS verified with
      two test users via REST (cross-tenant reads AND writes blocked; salary
      private; unbalanced expenses rejected by deferred triggers) (2026-07-09)
- [x] **E3 Groups & members** — invite codes + share links (`/join/<code>`),
      invite-accept screen with group/inviter preview (works signed-out; code
      remembered through auth), placeholder members addable from the
      Members & invite sheet, **upgrade-on-invite transfers the placeholder's
      history** (redeem_invite/invite_preview SECURITY DEFINER RPCs; E2E-tested
      live with two users incl. idempotent re-redeem, 2026-07-10). Join-by-code
      also on the onboarding space step.
- [ ] **E4 Expenses** — SupabaseRepo, Add-expense sheet, soft-delete + undo,
      **edit expense** (tap row → prefilled sheet) and **date picker** all done
      (browser-verified 2026-07-10). Remaining: multi-payer UI, dedicated
      Expenses tab + detail screen (currently list on Home + edit sheet)
- [x] **E5 Balances & settle up (basic)** — Home balance hero with live nets,
      settle-up sheet (fewest-payments list, record payment → balance clears;
      verified in browser 2026-07-09). Pairwise view for 3+ members comes with
      the full shell
- [ ] **E6 Verification** — balance scenario tests vs hand calcs; one-week
      real-data trial with both users

## Phase 2 — Offline-first → M2 "Works anywhere"
- [ ] Dexie local store behind the Repo · outbox + sync engine · SW precache +
      background sync · LWW conflict resolution · sync-state pill (synced /
      pending / offline per design)

## Phase 3 — Fair-share & richer splits
- [ ] Salary plumbing + privacy toggle · percentage & shares methods ·
      (salary-proportional maths already done in Phase 0 domain layer)

## Phase 4 — Recurring & shopping list → M3 "Fair & automatic"
- [ ] Recurring rules + pg_cron generation job + client catch-up · realtime
      shared shopping list · cart → expense conversion

## Phase 5 — Insight & export → M4 "Complete v1"
- [ ] Reports tab (trend chart, category breakdown, who-paid-what) · activity
      feed · Excel/CSV export · receipt photos · settle-up simplification UI for 3+

## Phase 6 — Polish & hardening
- [ ] Empty/error/loading states · a11y · security re-audit · performance pass

## Working agreements
- Ship the correct ledger before anything clever; offline is architectural and
  comes right after (scope doc §12.3).
- Every phase lands with tests; the ROADMAP checkbox flips only when the epic's
  "done when" criterion from the plan doc is met.
