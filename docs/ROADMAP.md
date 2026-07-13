# SettleUp — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are.
> Full epic/task detail with acceptance criteria lives in the Phase 1 plan doc
> (`SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`).

**Last updated:** 2026-07-13 (audit done; Phase 3 fair-share shipped; offline moved to end per ADR-0009)

## Where we are

**The app is live and couple-ready:** https://splitclone-joshprojects13.vercel.app.
Auth, onboarding, invites (with placeholder-history transfer), the full tabbed
shell with Expenses tab + detail screen, add/edit/delete with multi-payer, and
settle-up all work against the live Supabase backend. **All Phase-1 build epics
(E0–E5) are done** — remaining for M1 is E6: the week-long real-data trial by
Josh + partner. SMTP for real OTP codes is backlogged (Josh,
2026-07-13) — magic-link sign-in is the flow for now. After M1: Phase 2
offline-first.

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
- [x] PWA installs to a phone home screen from the deployed URL (Josh, 2026-07-13)

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
- [x] **E4 Expenses — complete** — SupabaseRepo, Add/Edit sheet (equal · exact ·
      proportional, auto-category, date picker), **multi-payer** with per-payer
      amounts + remaining validation, soft-delete + undo, **bottom tab bar**
      (Home/Expenses/List/Reports; List & Reports are Phase 4/5 placeholders),
      **Expenses tab** (date-grouped, category tiles, "your share %",
      lent/borrowed nets), **expense detail screen** (paid-by + split cards
      with % pills and member nets, edit/delete). Browser-verified incl.
      hand-checked balances (2026-07-13)
- [x] **E5 Balances & settle up (basic)** — Home balance hero with live nets,
      settle-up sheet (fewest-payments list, record payment → balance clears;
      verified in browser 2026-07-09). Pairwise view for 3+ members comes with
      the full shell
- [ ] **E6 Verification** — balance scenario tests vs hand calcs; one-week
      real-data trial with both users

## Phase 3 — Fair-share & richer splits (execution order is 1 → 3 → 4 → 5 → 2 → 6 per ADR-0009)
- [x] **Salary-proportional splits work for real couples** — `salary_split_shares`
      SECURITY DEFINER RPC computes shares server-side so salaries never leave
      the database (ADR-0010); expense sheet fetches shares debounced; falls
      back to equal with a warning when any participant (incl. placeholders)
      lacks a salary. E2E-verified live: flagship R12 000 @ 40k/20k →
      R8 000/R4 000, cent-exact awkward totals, partner cannot read salary,
      outsiders rejected (2026-07-13)
- [x] **Settings sheet** — edit display name + monthly salary post-onboarding,
      salary-visibility opt-in toggle (off by default), sign out moved in;
      header now Invite · Settings (2026-07-13)
- [x] Member display names hydrated from `profile_public` — partner's real
      name now shows everywhere (was "Member"/placeholder only)
- [x] Percentage & shares methods: in the domain layer + tests; deliberately
      not surfaced — final design has exactly three split options (see
      Design-fidelity backlog)

## Phase 4 — Recurring & shopping list → M3 "Fair & automatic"
- [ ] Recurring rules + pg_cron generation job + client catch-up · realtime
      shared shopping list · cart → expense conversion

## Phase 5 — Insight & export → M4 "Complete v1"
- [ ] Reports tab (trend chart, category breakdown, who-paid-what) · activity
      feed · Excel/CSV export · receipt photos · settle-up simplification UI for 3+

## Phase 2 — Offline-first → M2 "Works anywhere" (MOVED TO END — ADR-0009, Josh 2026-07-13)
- [ ] Dexie local store behind the Repo · outbox + sync engine · SW precache +
      background sync · LWW conflict resolution · sync-state pill (synced /
      pending / offline per design) · offline fallbacks for the server RPCs
      (expenses, invites, salary shares)

## Phase 6 — Polish & hardening
- [ ] Empty/error/loading states · a11y · security re-audit · performance pass

## Design-fidelity backlog (audit vs design handoff, 2026-07-13)
Gaps between the built app and `design_handoff_settleup/README.md`, each with
its target phase. The audit confirmed all iron rules hold and Phase-1 exit
criteria are met (bar the E6 trial); these are the visible deltas:

- ~~Salary-proportional split doesn't work for a real couple~~ → **fixed in
  Phase 3** (privacy-preserving server RPC, ADR-0010)
- ~~Partner's real display name never shown~~ → **fixed in Phase 3**
- ~~Settings (editable name/salary, privacy toggle)~~ → **basic sheet shipped
  in Phase 3**; simplify-debts toggle + full-screen fidelity in Phase 6
- Header per design: tappable space name → Spaces switcher sheet, notification
  bell → Activity, avatar → Settings (currently Invite/Sign-out pills) →
  **Phase 5/6**
- Spaces switcher + create-space sheet (multi-space UI; data layer already
  supports) → **Phase 6**
- Sync-state pill (synced/syncing/offline) → moves with **Phase 2 (end)**
- Upcoming-recurring card on Home → **Phase 4**
- Note input on Add/Edit sheet (schema + detail view support notes already) →
  **Phase 4**
- Avatar photos (add-photo affordance in onboarding/settings) → **Phase 5**
  (needs Storage)
- Group rename UI; member-leave-with-zero-balance rule → **Phase 6**
- Percentage/shares split methods: implemented + tested in the domain layer but
  deliberately **not surfaced** — the final design's segmented control has
  exactly three options (Equal · Exact · Proportional); design supersedes scope
  §6.5 here. Revisit only if a real need appears.

## Working agreements
- Ship the correct ledger before anything clever; offline is architectural and
  comes right after (scope doc §12.3).
- Every phase lands with tests; the ROADMAP checkbox flips only when the epic's
  "done when" criterion from the plan doc is met.
