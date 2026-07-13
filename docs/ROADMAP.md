# SettleUp — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are.
> Full epic/task detail with acceptance criteria lives in the Phase 1 plan doc
> (`SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`).

**Last updated:** 2026-07-16 (Phase 5 shipped: reports, Excel export, activity feed, receipts — milestone M4 'Complete v1')

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
      sender; magic-link sign-in works meanwhile. *(Decision now tracked inside
      Phase 6 → "Invite / joining flow comms rework".)*
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

## Phase 4 — Recurring & shopping list → M3 "Fair & automatic" ✅ (2026-07-13)
- [x] **Recurring rules** — recurring_expense table + RLS; Recurring screen
      (rule cards: payer, split, next-run/Paused; Pause/Resume · Add now ·
      delete) + New-recurring sheet (amount, description, payer pills,
      Equal/Proportional, day-of-month 1–28); Home "Upcoming" card
- [x] **Generation job** — process_due_recurring(): daily pg_cron
      ('settleup-recurring-daily', 04:15 UTC) + client catch-up on app open;
      splits computed in SQL (largest remainder, salary weights w/ equal
      fallback — mirrors domain). E2E live: backdated rule generated 2 missed
      months, each balanced R8 000/R4 000; next_run advanced; idempotent;
      run_recurring_now works
- [x] **Shared shopping list** — shopping_item table + RLS + realtime
      publication; List tab: add w/ optional estimate, tick into "In cart · N",
      Clear, remove; live updates across devices via Supabase Realtime
- [x] **List → expense** — "Turn cart into an expense · R<estimate>" prefills
      the Add-expense sheet (amount = summed estimates, items as note lines);
      saving clears the cart. Browser-verified end-to-end
- Deferred within Phase 4: weekly frequency (schema supports; UI monthly-only),
      variable-amount bills (prompt-to-confirm, scope §14 #6), item qty input
      (schema + display support; no input field yet)

## Phase 5 — Insight & export → M4 "Complete v1" ✅ (2026-07-16)
- [x] **Reports tab** — 6-month trend bar chart (gradient bars, R-labels,
      current month highlighted), by-category breakdown with progress bars +
      % of month, who-paid-what per member (paid · share · net). Verified with
      hand-checked numbers (43/36/21% categories; paid R1 177,50 · share
      R1 038,25 → net +R139,25)
- [x] **Excel export** — one-tap .xlsx (SheetJS, dynamically imported):
      Expenses sheet (date, description, category, amount, payer(s), split
      method, per-member share columns, notes) + Summary sheet (category
      totals; per-person paid/share/settled/net). Amounts as Rand decimals
      for Excel-side sums
- [x] **Activity feed** — bell in header → date-grouped audit log (added /
      edited / deleted / settled / member joined / recurring generated) with
      actor + time; expense rows tap through to detail
- [x] **Receipt photos** — private `receipts` Storage bucket, RLS by group
      folder (E2E: outsider blocked from read AND write; member signs URLs);
      client-side compression (≤1280px JPEG); attach/view/remove on the
      expense detail screen. One image per expense (scope §14 #7)
- [x] Settle-up for 3+ members: the greedy fewest-payments list has handled
      n members since E5 — no extra UI needed

## Phase 2 — Offline-first → M2 "Works anywhere" (MOVED TO END — ADR-0009, Josh 2026-07-13)
- [ ] Dexie local store behind the Repo · outbox + sync engine · SW precache +
      background sync · LWW conflict resolution · sync-state pill (synced /
      pending / offline per design) · offline fallbacks for the server RPCs
      (expenses, invites, salary shares)

## Phase 6 — Polish & hardening
- [ ] Empty/error/loading states · a11y · security re-audit · performance pass

### Added by Josh, 2026-07-16 (recorded for the backlog — flesh-outs below)

- [ ] **Household (space) management** — users will realistically belong to
      multiple households (home, a trip, a shared project). Today the app
      silently uses the default/first group with no way to see or change it.
      Build the design's Spaces model end-to-end:
      - Header: the space name becomes tappable (chevron affordance per the
        design) → **Spaces switcher bottom sheet** listing every space the
        user belongs to, each with member subtitle and an active check;
        tapping switches the whole app (balances, expenses, list, recurring
        all re-scope) and persists as `profile.default_group_id`
      - **"Create a space"** from the switcher → new-space sheet (name →
        create → switch into it), so a trip/household can be spun up without
        signing out or touching onboarding
      - **Join a space** from the switcher via invite code (same
        `redeem_invite` path as onboarding), so joining a second household
        doesn't require a fresh account flow
      - Always-visible context: which space you're in must be obvious on
        every tab (name in header; consider it in the Expenses/List/Reports
        headers too) so entries never land in the wrong household
      - Done when: a user in 2+ spaces can tell at a glance which is active,
        switch in ≤2 taps, create a new space, and join one by code — and an
        expense added right after switching lands in the right space
      *(Data layer already supports multiple groups; this is UI + routing.
      Supersedes the "Spaces switcher" line in the fidelity backlog below.)*

- [ ] **Invite / joining flow comms rework** — the flow technically works but
      the communication around it fails a real user: the invite can be sent,
      yet the recipient hits a **code/PIN prompt that nothing ever sent
      them** (the sign-in email contains a magic *link*, not the 6-digit code
      the verify screen asks for, because the free-tier default sender can't
      customize templates — and the invite code itself is only visible on the
      inviter's screen). Revisit end-to-end as one journey:
      - Map the full recipient journey: receives share message → opens
        `/join/<code>` → signs in (email) → lands in the household; kill
        every step where the user is asked for something they were never
        given
      - Share payload must carry everything: the share/copy message includes
        the link (code embedded) AND spells out what will happen ("tap, sign
        in with your email, you're in") — recipient should never need to
        type the invite code manually when they came via link
      - Resolve the OTP mismatch decisively: either wire custom SMTP (free
        Resend) so the email really contains the 6-digit code, or embrace
        magic-link-only and rework the verify screen so it stops asking for
        a code it knows can't arrive (show "check your email and tap the
        link", with code entry only as a secondary affordance once SMTP
        exists)
      - Handle the edge cases: invite link opened on a phone where the
        inviter is signed in; expired/used codes get a friendly error +
        "ask for a new invite"; pending-invite survives the whole auth flow
        (exists — needs real-phone testing)
      - Done when: a non-technical partner can go from received message to
        seeing the shared balance without asking the inviter a single
        question — tested on two real phones
      *(Absorbs the Phase-0 "Manual: custom SMTP" item — decide it here.)*

- [ ] **Recurring payments from expense creation, with fixed split values** —
      today recurring bills live in their own screen and only store a split
      *method* (equal/proportional) that is re-computed at generation time.
      Josh wants: while creating an expense, mark it as repeating monthly
      with the **exact split locked in**:
      - Add-expense sheet gains a "**Repeats monthly**" toggle (radio/switch
        per Josh) → reveals day-of-month picker (defaults from the expense
        date); saving creates BOTH the expense and the recurring rule in one
        go
      - **Fixed split values**: whatever the sheet shows at save time
        (equal, exact amounts, or the proportional shares as computed that
        day) is stored on the rule as concrete per-member cents and reused
        verbatim every month — no re-computation drift when salaries change
        (schema: add a fixed-shares mode to `recurring_expense`, e.g.
        `split_method='fixed'` + stored shares jsonb/rows; generation
        validates the stored shares still sum to the amount and the members
        still exist, falling back to equal + a warning activity entry if not)
      - Existing separate Recurring screen stays (management: pause/edit/
        delete/add-now); rules created from the expense sheet appear there
        like any other; method-based (recomputed) rules remain supported
      - Done when: Josh can enter rent once — amount, exact R-values per
        person, "repeats monthly on the 1st" — and it generates identically
        every month with zero further input
      *(Builds on Phase 4's generation job; needs one migration + sheet UI.)*

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
  supports) → **Phase 6** *(now fully specced under Phase 6 → "Household
  (space) management")*
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
