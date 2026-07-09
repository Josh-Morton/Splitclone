# SettleUp — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are.
> Full epic/task detail with acceptance criteria lives in the Phase 1 plan doc
> (`SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`).

**Last updated:** 2026-07-02 (session: project bootstrap)

## Where we are

**Phase 0 (Foundations) is code-complete locally.** The two manual steps that
need Josh's accounts — creating the Supabase project and the Vercel deploy —
are documented in [SETUP.md](SETUP.md) and are the next actions. After that,
Phase 1 epic E1 (auth) is the next coding work.

## Phase 0 — Foundations

- [x] Git repo initialized; project structure (`settleup/` app, `docs/`, `supabase/`)
- [x] Next.js (App Router, TS) scaffold with PWA manifest, icons, service worker
- [x] Design tokens in `globals.css` from the design handoff
- [x] Domain maths ported + 41 unit tests passing (splits, balances, simplify, money, auto-category)
- [x] Repo data-layer interface + in-memory demo implementation (ADR-0005)
- [x] Phase-1 schema migration + RLS written (`supabase/migrations/20260702000000_phase1_schema.sql`)
- [x] Keep-alive cron route (`/api/keepalive` + `vercel.json`)
- [x] ADRs 0001–0008 recorded
- [ ] **Manual:** create Supabase project, run migration, set env vars ([SETUP.md](SETUP.md))
- [ ] **Manual:** create GitHub repo + Vercel project, first deploy ([SETUP.md](SETUP.md))
- [ ] Verify PWA installs to an Android home screen from the deployed URL

## Phase 1 — Core ledger (MVP) → milestone M1 "It works for us"

- [ ] **E1 Auth & onboarding** — email OTP sign-in (ADR-0006), onboarding
      (name → optional salary → create/join space) per the designed screens,
      session persistence, route protection
- [ ] **E2 Schema live** — migration applied; RLS verified with two test users
      (one cannot read the other's group via the REST API)
- [ ] **E3 Groups & members** — create/rename household, invite link/code flow,
      placeholder ("Sam") members, upgrade-on-invite
- [ ] **E4 Expenses** — `SupabaseRepo` implementation of the Repo contract;
      Add/Edit sheet (equal · exact · proportional, defaulting proportional),
      multi-payer, auto-category, soft-delete + undo; Expenses tab + detail
      screen per design
- [ ] **E5 Balances & settle up** — Home balance hero, settle-up sheet with
      recorded payments
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
