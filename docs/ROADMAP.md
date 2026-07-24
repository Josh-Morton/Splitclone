# SettleUp — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are.
> Full epic/task detail with acceptance criteria lives in the Phase 1 plan doc
> (`SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`).

**Last updated:** 2026-07-23 (Phase 8 "Splitty" shipped — guest bill-splitting via a shared link)

## Where we are

**Tally is live and couple-ready:** https://splitclone-joshprojects13.vercel.app.
Auth, onboarding, invites (with placeholder-history transfer), the full tabbed
shell with Expenses tab + detail screen, add/edit/delete with multi-payer, and
settle-up all work against the live Supabase backend. **All Phase-1 build epics
(E0–E5) are done** — remaining for M1 is E6: the week-long real-data trial by
Josh + partner. SMTP for real OTP codes is backlogged (Josh,
2026-07-13) — magic-link sign-in is the flow for now. After M1: Phase 2
offline-first. **Phase 8 "Splitty"** (standalone bill-splitting via a
WhatsApp-shared link, no guest account required) is **shipped** — see the
Phase 8 section below.

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

### Post-launch tweaks (Josh, 2026-07-19)
- [x] **Categories reworked to 7 intuitive parents** (Groceries · Eating out ·
      Bills & rent · Transport · Household · Leisure · Other) with a much larger
      grocery/ingredient keyword database ("cheese"→Groceries) and word-token
      matching to avoid false positives. Legacy slugs resolve, no migration.
      (ADR-0011 revision.)
- [x] **Recurring supports weekly OR monthly** with a day picker (weekday pills
      for weekly, day-of-month for monthly) — in both the Add-expense "Repeating
      expense" toggle and the New-recurring sheet. Rule cards show "Every Wed" /
      "Monthly on day N". Server generator already handled weekly advance.

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

### Tally rebrand + polish batch (Josh, 2026-07-22)
- [x] **Rebrand SettleUp → Tally** — provided hexagon-T icons processed into
      192/512/maskable (full-bleed dark) + favicon + apple-touch-icon; manifest,
      metadata, Logo (now the real icon), welcome/invite/export strings. Same
      colour scheme. URL unchanged (splitclone-…vercel.app still serves).
- [x] **Settle-up reworked → "Clear the tally"** — you can only record a payment
      for money YOU owe (clearing your own debt); amounts owed *to* you are
      info-only (the other person clears on their side). 3+ members: Home hero
      shows the total net + a per-person breakdown, and the sheet lists
      "X owes you" per person.
- [x] **Spaces management** — the switcher is now a full manager (switch,
      rename, delete with guards: ≥1 space must remain, deleting the active one
      switches first) reachable from the header ▾ AND Settings → Manage.
      `repo.deleteGroup` (soft delete) in both repos.
- [x] **Settings gains Manage → Spaces + Recurring bills**; the separate Home
      "Upcoming/recurring" card is removed (recurring is set up during Add
      expense and managed from Settings).
- Notifications/activity kept (already shows who added each item).

## Phase 6 — Polish & hardening
- [ ] Empty/error/loading states · a11y · security re-audit · performance pass

### Added by Josh, 2026-07-16 (recorded for the backlog — flesh-outs below)

- [x] **Household (space) management** ✅ (2026-07-18) — shipped: tappable
      header space name (chevron) → Spaces switcher sheet with active check;
      switching persists as default and re-scopes the whole app (works in demo
      too); Create-a-space and Join-with-a-code inside the sheet; space name
      now shown on Expenses/List/Reports headers + "N spaces" subtitle.
      Browser-verified: create "Cape Town trip" → switch → empty ledger →
      switch back → balances restored. Deferred: per-space member subtitle in
      the switcher rows. Original spec follows:
      users will realistically belong to
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

- [x] **Space membership management (remove / leave / reinvite)** ✅
      (2026-07-23) — the space **owner** can now remove another member
      (Invite sheet → each non-owner row gets a **Remove** button with an
      inline confirm), and any **non-owner** member can **leave** a space
      (Spaces switcher → ⋯ → the manage panel shows **Leave this space**
      instead of rename/delete for spaces you don't own). Guards: the owner
      **cannot** remove themselves or another owner and **cannot leave** — they
      must **delete** the space; removal/leave both require the member's
      balance to be **zero** ("Settle up … before removing them"), keeping the
      ledger consistent. Migration `20260724000000_space_membership.sql`:
      `remove_group_member(member_id)` (owner-only, returns the removed
      user_id), `leave_group(group_id)` (non-owner self), a `_member_net_cents`
      helper for the zero-balance check, and `redeem_invite` updated to
      **reactivate** a soft-deleted membership row so a removed/left person can
      be **reinvited** with the same code path (no duplicate row; their history
      is preserved). Removal is soft (`status='left'`, `deleted_at` set).
      **Email on removal:** `notify-removed` Edge Function (service-role email
      lookup — the client never sees other members' addresses; verifies the
      caller is the owner) sends a "you've been removed from <space>" mail via
      **Resend**, and **no-ops gracefully** (`{sent:false}`) until a
      `RESEND_API_KEY` secret + verified domain are configured, so removal
      works regardless. ⚠️ **Needs Josh:** set the `RESEND_API_KEY` (and
      `RESEND_FROM`) Function secret to actually send those emails. Verified:
      migration RPCs E2E against live Supabase (owner-only, zero-balance,
      reinvite reactivation); in-browser demo (owner sees Remove; zero-balance
      guard blocks Sam who owes R139,25; owner manage panel shows
      rename+delete, not Leave). `npm test` (53) + build + lint green.

- [x] **Invite / joining flow comms rework** ✅ client-side journey (2026-07-18) —
      shipped: verify screen is magic-link-first ("Open the email and tap the
      link" card; 6-digit entry demoted behind "Got a code instead?"), welcome
      button says "sign-in link", the invite share payload is a full
      instruction message (link + 3 steps + code as fallback) with native
      Share on mobile + copy, and a verify tab left open auto-advances when
      the link is tapped (cross-tab session broadcast). Remaining: optional
      SMTP (Resend) if real codes are ever wanted; two-real-phones test folds
      into the E6 trial. Original spec follows:
      the flow technically works but
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

- [x] **Recurring payments from expense creation, with fixed split values** ✅
      (2026-07-18) — "Repeats monthly" toggle in the Add-expense sheet (new,
      single-payer expenses) + day-of-month field; saving creates the expense
      AND a recurring rule with the split shown at save time locked in as
      concrete per-member cents. New `split_method='exact'` + `fixed_shares`
      jsonb on recurring_expense; generation reuses stored shares verbatim,
      falling back to equal (still cent-exact) if they no longer reconcile.
      E2E-verified live: 700/300 generates verbatim; non-reconciling shares
      fall back to equal. Method-based rules unchanged; management screen
      unchanged. Original spec follows:
      today recurring bills live in their own screen and only store a split
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

### Added by Josh, 2026-07-18 (researched + scoped; nice-to-haves)

- [x] **Detailed expense categorisation (two-level taxonomy, auto + override)** ✅
      (2026-07-18, ADR-0011) — 8 parents (unchanged colours/icons) over ~40
      curated subcategories incl. SA-specific (prepaid electricity, DSTV,
      airtime, e-tolls, domestic help, armed response, medical aid, municipal
      rates). autoCategory returns a subcategory slug (order-sensitive); the
      detected chip in Add/Edit is tappable → grouped category picker (manual
      override). Reports roll up by parent with tap-to-drill-down; report
      category filter is parent-level; export carries parent + subcategory
      columns. No DB migration (category is text; legacy bare slugs resolve).
      47 tests; browser-verified auto→override→reports drill-down. Original
      spec follows:
      replace the flat 8-category list with a researched two-level taxonomy.
      replace the flat 8-category list with a researched two-level taxonomy.
      Research: Splitwise itself uses parent categories with subcategories
      (expenses must carry a subcategory); the industry-standard reference is
      Plaid's Personal Finance Category taxonomy (16 primary / 104 detailed,
      refined from 600+ down to what PFM users actually want). For a household
      app, full PFC is overkill — curate ~35–45 subcategories under our 8
      existing groups (which become parents, keeping their accent colors), e.g.
      Groceries → {Supermarket, Butcher/deli, Liquor, Household consumables};
      Utilities → {Electricity/prepaid, Water & municipal, Internet/fibre,
      Mobile/airtime, TV/streaming}; Household → {Cleaning & domestic help,
      Maintenance/hardware, Furniture & decor, Garden}; plus SA-specific
      entries (municipal rates, DSTV, medical aid, security/armed response).
      Behaviour per Josh: **system auto-assigns** (extend the ADR-0008 keyword
      map to subcategory level, order-sensitive) **but the category is always
      changeable at creation/edit** — the auto-detected chip in the sheet
      becomes tappable → a grouped category-picker sheet. Storage: category
      column stays text (already is); values become subcategory slugs with a
      parent lookup in `CATEGORY_META`; existing 8 old values map to sensible
      defaults, no data migration needed. Reports roll up by parent with
      tap-to-drill-down into subcategories. Amend ADR-0008 when built (auto
      stays the default; manual override is new).
      Done when: "Woolworths groceries" auto-lands on Supermarket, Josh can
      flip it to Liquor in two taps, and Reports shows both levels.

- [x] **Report filters: date range · person · category** ✅ (2026-07-18) —
      filter pill + sheet on Reports: date presets (This/Last month, Last 3
      months, This year, All time, Custom from–to), person (paid OR share in),
      multi-select category. Filters combine (AND), shown in the header +
      pill, and the **Excel export respects them** (filename gains the label).
      All sections (trend, category breakdown, who-paid-what) recompute
      client-side. Browser-verified: "All time · Groceries" → 1 expense;
      person + export while filtered. Original spec follows:
      a filter pill row
      on the Reports tab (and reusable on Expenses later): date range presets
      (This month · Last month · Last 3 months · This year · All time ·
      Custom from–to), person (any member — filters to expenses they paid OR
      share in, with paid/share figures re-scoped), category (multi-select,
      parent or subcategory once the taxonomy lands). Filters combine (AND),
      are reflected in the header ("Jun · Groceries · Sam"), and **the Excel
      export respects the active filters** (filename gains the range). Charts,
      category breakdown and who-paid-what all recompute client-side from the
      already-loaded ledger — no backend work needed.
      Done when: "what did Sam pay for groceries between March and May" is
      three taps + an export.

- [x] **Remove the date field when adding an expense (assume today)** ✅
      (2026-07-18) — Add-expense sheet stamps `now`; the date field remains in
      **edit** mode for backdating. Recurring generation and cart→expense set
      their own dates — unaffected. Browser-verified both modes.

## Phase 7 — Receipt line-item scanning ✅ SHIPPED (2026-07-22) → M5 "Scan the slip"

**Live:** scan-receipt Edge Function (Gemini `gemini-flash-latest`, central key
as a Function secret, auth-gated) + in-flow client (capture → item checklist →
tick → total copied into the editable amount → normal split/space flow; image
never stored). ADR-0012. E2E-verified live (synthetic Checkers slip → 7 items
exact to the cent, total matches; anon rejected 401) and in-browser (untick 2
items → R374,44 → R211,46 → saved with only the ticked items in the note).
MemoryRepo returns a canned slip for the demo. Offline: capture yes, extraction
no (online-only, per the spec below).

**Update (2026-07-23) — cumulative-quantity line items.** Restaurant/bar slips
list a quantity in the left column (e.g. `5  Jack Black  R175,00`). The Edge
Function now reasons about that column: it decides whether the printed price is
the **line total** (5 × R35) or a mis-printed **unit price** (using the grand
total as the tie-breaker), then **expands the row into one line item per unit**
(`Jack Black (1 of 5)` … `(5 of 5)`), dividing the line total across them with
largest-remainder so the units sum **exactly** to the line total. So the
checklist shows every drink/dish individually and you can tick only the ones
that were yours. Qty is clamped to 50; a missing/`1` qty stays a single row.
Expansion is server-side, so the client checklist is unchanged.

---

### Original spec (2026-07-18)

**Goal (Josh's words):** while creating an expense, optionally **scan a
receipt**; the app extracts a **checklist of items with prices**; the user
**ticks the items relevant to this expense** (a 15-item slip where only 10
belong → tick those 10); the **selected total is copied into the expense
amount** (editable, in case of a misscan); then the **normal expense flow**
continues (split method, participants, and the currently-active space). The
unticked items are simply dropped. **Receipts are NOT stored** — the image is
used only for extraction, then discarded.

### The flow (exact)
1. In the **Add-expense sheet**, a new **"Scan a receipt"** entry point
   (alongside typing the amount). Capture options:
   - **In-app camera** via `getUserMedia` (or `<input type="file"
     accept="image/*" capture="environment">` which opens the camera on
     Android/iOS PWAs). If live camera isn't feasible on a given device, the
     file/capture input is the guaranteed fallback — acceptable per Josh.
   - Compress client-side (reuse `lib/image.ts`) before sending.
2. The image goes to the extractor (see architecture) → returns line items
   `[{name, qty, unit_price_cents, line_total_cents}]` + a detected total.
3. **Item checklist (review screen):** every line as a **ticked-by-default
   checkbox row** (name · price). User unticks the irrelevant ones. A live
   running total of the ticked items shows at the bottom.
4. **"Add to expense"** → the ticked items' total is written into the amount
   field; the item names go into the expense note (so the detail screen shows
   what was bought). **Amount stays editable** — if a price scanned wrong the
   user just fixes it, or edits an item's price in the checklist first.
5. Continue the **normal expense flow already built**: category auto-detects
   from the merchant/first item (overridable, ADR-0011), the split segmented
   control (equal/exact/proportional), participants, and it saves into
   **whatever space is currently active** (couple, apartment, trip — the
   spaces switcher already scopes everything). No special-casing per space.
6. Nothing about the receipt is persisted — no Storage upload, no
   `receipt_url`. (The separate Phase-5 "attach a receipt photo" feature still
   exists for anyone who *does* want to keep the image; scanning is its own,
   storage-free path.)

### Can this be offline / on-device? (Josh's "prize number one")
Short answer: **capture works offline, but accurate extraction does not — for
free.** Findings:
- **On-device OCR (Tesseract.js, WASM):** runs fully offline and free, but
  produces raw text, not structured line items. Turning a Checkers/PnP/Woolies
  slip into clean name+price pairs from that text needs bespoke per-retailer
  parsing and is unreliable across layouts. Also a multi-MB WASM download.
- **On-device vision LLM (WebLLM / Transformers.js / Chrome's built-in Gemini
  Nano "Prompt API"):** either multi-GB model downloads that are impractical
  on a phone PWA, or (Gemini Nano) experimental, Chrome-only, flag-gated, and
  not dependable on Android PWAs as of mid-2026.
- **Conclusion:** structured line-item extraction that actually works needs a
  server call. Since the whole app is online-first anyway (offline is the
  deferred Phase 2), **scanning is online-only**, and that's consistent.
  Graceful degradation when offline: the amount/expense flow still works by
  hand; scanning shows "you're offline — snap it and scan when you're back, or
  enter the amount manually." We do **not** queue the image (that would mean
  storing it, which Josh doesn't want). Revisit on-device extraction only if a
  genuinely good free on-device model ships later.

### Architecture (no per-user Google account; one central key)
- **Central key, server-side.** A single Gemini API key (Josh's personal
  Google account — low user count, so one key's free quota covers everyone)
  lives **only** as a Supabase **Edge Function secret**. Users never link
  their own Google/Gmail account; they never see the key. Every user's scan is
  piped through this one function. This is exactly the "run it through my
  personal account" model Josh asked for.
- **Edge Function `scan-receipt`** (Deno, Supabase, free-tier included):
  authenticated request (verifies the caller's JWT + that they belong to the
  active group) carries the **compressed image bytes in the request body**
  (not a stored path — nothing is persisted). The function calls Gemini Flash
  with a strict JSON-schema prompt and returns
  `{ items: [{name, qty, unit_price_cents, line_total_cents}], total_cents,
  merchant? }`. Cents are integers end-to-end; the function rounds/validates.
  The image is discarded when the request ends.
- **Model:** Gemini Flash free tier — 10 req/min, 1,500 req/day *including
  vision*, R0, no credit card. A household does ~30 scans/month, so the daily
  cap is a non-issue. Anthropic has no free API tier and OpenAI vision is paid,
  so Gemini is the only R0 fit. **Fallback if SA-slip quality disappoints:**
  Google Document AI (1,000 free pages/month) behind the same Edge Function —
  swap the call, keep the interface.
- **Privacy note to confirm with Josh:** Gemini's *free* tier allows Google to
  use submitted content to improve their products. Grocery slips are low
  sensitivity, but flagging it. A paid key (or Document AI) avoids this if ever
  wanted.

### Build order (when Josh provides the key)
1. Edge Function + versioned prompt; test harness against ~10 real SA slips
   (Checkers, PnP, Woolworths, Spar) to tune accuracy.
2. In-app capture (camera + file fallback) wired into the Add-expense sheet.
3. Item checklist review UI (tick/untick, editable price, running total).
4. "Add to expense" → amount + note; then the existing expense flow/split/space.
5. E2E + real-phone testing; graceful offline + rate-limit handling.

**What Josh needs to provide:** one free Gemini API key from Google AI Studio
(aistudio.google.com → "Get API key" → free, no card), pasted to Claude like
the Vercel token; Claude sets it as the `GEMINI_API_KEY` Edge Function secret.
Nothing else — no per-user setup, no Google linking, no billing.

## Phase 8 — Splitty ✅ SHIPPED (2026-07-23) → M6 "Split with anyone"

> **Live:** the Splitty tab (5th bottom-nav tab) → scan a bill → items expand
> per-unit (Phase-7 qty work) → "Create split" → share a `/split/<code>` link
> on WhatsApp → guests join with just a name (no account), tick their items,
> add their own tip %, and lock in (editable until the host closes the bill).
> Host sees a live "who's in / covered of total" overview + Close bill. Fully
> standalone from the expense ledger (ADR-0013). Migration
> `20260726000000_splitty.sql` applied live (4 tables + 7 token-gated RPCs;
> the guest token lives in `split_guest_secret` with RLS-deny **and** the
> default anon/authenticated grants revoked — both layers deny). Repo methods
> in both implementations; `MemoryRepo` seeds a "Mzoli's braai" demo bill.
> Verified: live E2E of the deployed RPCs (join / claim / atomic double-claim
> guard / tip / lock / bad-token reject / owner-only close, then cascade
> cleanup); in-browser demo (join as a guest, claim 2 items, 15% tip →
> R138,00 exact, live overview); `npm test` (53) + build + lint green.
> **Admin-recovery fix (2026-07-24):** the admin's guest identity was only
> cached in localStorage, so returning to your own split from another device or
> after storage was cleared showed the join screen instead of admin controls.
> Migration `20260728000000_splitty_admin_identity.sql` adds
> `splitty_admin_identity(share_code)` (authenticated-only; returns the admin
> guest id+token when `auth.uid() = created_by`), and the `/split` page now
> recovers admin identity server-side when it doesn't recognize the visitor —
> so the creator is always remembered as admin. (Bonus: the demo's seeded bill
> now opens as its host, since the demo user created it.)
> **Realtime fix (2026-07-23):** the initial migration created the tables but
> forgot to add them to the `supabase_realtime` publication, so cross-user
> updates only appeared when the receiving client next acted. Migration
> `20260727000000_splitty_realtime.sql` adds `split_bill`/`split_guest`/
> `split_item` to the publication (free — same mechanism `shopping_item` uses),
> and `subscribeSplitBill` now also watches `split_bill` so "Close bill"
> propagates live. Claims/tips/locks now push to everyone in ~real time.
> **Not in v1 (by design):** no Expense row created, no shared-item cost-split
> (qty-expansion covers it), no payment collection, no link expiry, no reopen.
> Original spec (kept for reference):

> **Status: fully specced.** This section is deliberately exhaustive so any LLM
> (or human) can implement it from this document alone, without re-deriving the
> design decisions.

### Goal (Josh's words, condensed)
A **standalone bill-splitting module**, separate from the expense ledger,
reachable from a **5th bottom-nav tab called "Splitty"**. One person (the
**admin**) photographs a receipt, reviews/edits the scanned line items, and
shares a link on WhatsApp. Anyone who taps that link lands on a page **inside
the Tally web app but requires no account** — they type a display name,
tick the items that were theirs from a shared checklist, add their own tip
percentage (auto-calculated), and tap **"Lock in."** The admin (who goes
through the exact same claim screen for their own items, immediately after
creating the split) watches a **live overview**: who's locked in, who hasn't,
and the running total covered vs. the bill total. **Nothing here writes to
the expense ledger in v1** — no `Expense`, no `group_id`, no `Repo` balance
math involved. That's an explicit non-goal, not an oversight.

### Why this is architecturally different from everything else in the app
Every existing feature requires a signed-in Supabase session; RLS keyed on
`auth.uid()` is the security boundary (ADR-0005). Splitty **guests have no
session at all** — no signup, no magic link, nothing. This is a deliberate,
scoped exception, recorded in **[ADR-0013](decisions/0013-splitty-guest-access.md)**:
guest writes go through `SECURITY DEFINER` RPCs that check a bearer-style
`guest_token` themselves (the function is the boundary), and the `anon` role
is granted execute on those RPCs directly — extending the precedent already
set by `invite_preview` (granted to `anon` today, but only for a *read*;
Splitty is the first *write* path `anon` can reach). **Read ADR-0013 in full
before writing the migration** — it explains exactly why the guest token
lives in its own unreadable table (`split_guest_secret`), not as a column on
`split_guest`, and why that specifically avoids a Realtime payload leak.

### The two user journeys, exact steps

**Admin (signed in, inside the main app):**
1. Taps the **Splitty** tab → sees a list of bills they've created (via
   `splittyListMyBills()`), each with a status pill (open/closed) and a live
   "R430 of R650 covered" line. Empty state: "Split a bill" button.
2. Taps **"+ New split"** → capture flow: **reuses the exact same
   camera/file-capture + `repo.scanReceipt()` call already built for the
   expense receipt scanner** (`src/components/receipt-scan-sheet.tsx` is the
   reference implementation — same `compressImage` → `blobToBase64` →
   `repo.scanReceipt(base64, "image/jpeg")` call, same `ScanResult`/`ScanItem`
   types from `repo.ts`). This already includes the qty-expansion work from
   earlier this session, so "5× Jack Black" arrives as 5 separate rows —
   important, because it's *why* Splitty doesn't need any shared-item /
   split-a-single-row-between-people logic (see "Item claiming" below).
3. **Review/edit checklist** — same UI pattern as `ReceiptScanSheet`'s review
   phase (tick/untick... actually no ticking here, every row becomes a real
   line item; the admin can rename a row, fix a price, or delete a row
   entirely before creating the split). Sees the running total.
4. Taps **"Create split"** → calls
   `repo.splittyCreateBill(merchant, receiptTotalCents, items)`. This:
   - creates the `split_bill` row + a `share_code`
   - auto-creates the admin's **own** `split_guest` row (`is_admin = true`,
     `display_name` pulled from their `profile.display_name`)
   - returns `{ shareCode, guestId, guestToken }`
   - the client immediately writes `{guestId, guestToken}` to
     `localStorage["splitty_guest_" + shareCode]` — **the same storage key
     scheme guests use** (see below), so the admin can be routed to
     `/split/<shareCode>` in their own browser and land on **the identical
     page component** everyone else uses, already recognized (no name prompt,
     because their token is already in local storage).
5. Client navigates to `/split/<shareCode>`. Because `is_admin` is true for
   this guest, that page additionally renders:
   - a **share panel** — reuses the WhatsApp-share pattern verbatim from
     `src/components/invite-sheet.tsx` (`navigator.share` when available,
     "Copy invite message" fallback, `canNativeShare` check) pointed at
     `${window.location.origin}/split/${shareCode}` instead of
     `/join/${code}`.
   - a **live overview** section: every guest (from `split_guest`, updated in
     realtime), their locked/unlocked badge, their contribution total
     (computed client-side — see "Money math" below), and unclaimed items
     called out separately.
   - a **"Close bill"** button → `repo.splittyCloseBill(shareCode)`. Freezes
     everything (guests can still view, not edit).
6. Below all that, the admin sees **the same claim checklist guests see** (own
   items to tick, own tip %, own Lock in) — because, per the data model, the
   admin *is* a `split_guest` row like anyone else.

**Guest (taps the WhatsApp link, no account):**
1. Lands on `/split/<shareCode>` — a **public route**, not gated behind
   `useSessionState()` the way `/join/[code]` is (that page redirects
   signed-out visitors to `/welcome`; **this page must not** — it has to work
   for someone who has never opened Tally before and never will sign up).
2. Page checks `localStorage["splitty_guest_" + shareCode]`:
   - **absent** → show a one-field form: "What's your name?" → on submit,
     `repo.splittyJoin(shareCode, name)` → save the returned
     `{guestId, guestToken}` to that localStorage key → proceed to step 3.
   - **present** → skip straight to step 3 (this is what makes reopening the
     link later, or the admin's own redirect in step 5 above, "just work").
3. Renders the **item checklist**: every `split_item` for the bill, live via
   Realtime. Unclaimed rows are tappable (claims them via
   `repo.splittyClaimItem`); rows claimed by someone else render disabled +
   greyed with that person's name; rows claimed by *this* guest show a
   filled checkmark and are tappable to release
   (`repo.splittyUnclaimItem`) — but **only while this guest is unlocked**
   (see "Locking" below).
4. **Tip selector**: segmented buttons (0% / 10% / 15% / 20% / custom input),
   calls `repo.splittySetTip(shareCode, guestToken, percent)` on change. A
   running total shows live: `sum(their claimed items) × (1 + tip/100)`.
5. **"Lock in"** button → `repo.splittySetLocked(shareCode, guestToken, true)`.
   Once locked, item rows and the tip selector become read-only for that
   guest, replaced by an **"Edit"** link that calls
   `splittySetLocked(..., false)` to unlock and resume changing things —
   **this stays possible for as long as `split_bill.status === "open"`**; once
   the admin closes the bill, editing is impossible for anyone, locked or not
   (confirmed decision: editable-until-admin-closes, not one-shot).
6. A small **shared overview** (same data the admin sees) is visible to every
   guest too, not just the admin — "see who else has paid" was part of the
   ask ("reflect on the main person's home page" — guests benefit from the
   same visibility, and RLS already makes these rows publicly readable, so
   there's no reason to hide it from them).

### Item claiming: exclusive, one claimant per row — confirmed decision
Per your answer: because the scan-receipt qty-expansion (already shipped)
turns "5× Jack Black — R175" into 5 separate `split_item` rows, two people
each grab their own "Jack Black" row without any need for a shared/split-cost
claim. **`split_item.claimed_by_guest_id` is a single nullable FK, not a join
table.** Claiming is enforced atomically in SQL (`update ... where
claimed_by_guest_id is null`) so two simultaneous taps can't both "win" the
same row — the loser gets `'Someone already grabbed that one'`.

### Money math — deliberately outside the strict expense-ledger invariant
`lib/domain/split.ts`'s "every split sums exactly to the total" rule and the
DB's deferred `validate_expense_totals` trigger apply to real `Expense`
rows — **Splitty touches neither**, so that invariant does not apply here.
A guest's contribution total is **derived, never stored** (consistent with
the spirit of ADR-0004's "balances are derived" even though this isn't the
balance system): `Math.round(sum(claimed item line_total_cents) * (1 +
tipPercent / 100))`, computed client-side every render from live `split_item`
+ `split_guest` data. Still integer cents throughout for storage/display
(the iron rule from CLAUDE.md), just not required to reconcile against
`receipt_total_cents` — unclaimed items and differing tip percentages mean
the sum of all guests' totals will *not* generally equal the receipt total,
and that's fine; the overview screen shows both numbers side by side so
humans can eyeball the gap, it doesn't try to force them equal.

### Data model — full migration SQL
New file: `supabase/migrations/20260726000000_splitty.sql`. Entirely new
tables, no FKs to `group`/`expense`/`group_member` — Splitty is intentionally
outside the group model (see ADR-0013's consequences section for why).

```sql
-- ============================================================================
-- Splitty (Phase 8): standalone bill-splitting, no account required for
-- guests. See ADR-0013 for the security model (function-boundary, not RLS).
-- ============================================================================

create table split_bill (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  created_by uuid not null references auth.users (id),
  merchant text,
  receipt_total_cents bigint not null check (receipt_total_cents >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table split_guest (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references split_bill (id) on delete cascade,
  display_name text not null,
  tip_percent numeric not null default 0 check (tip_percent >= 0 and tip_percent <= 100),
  locked_in boolean not null default false,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now()
);

-- The guest's bearer token, in its OWN table with no SELECT policy at all —
-- never exposed to any client, including the guest who owns it (they already
-- have it, returned once at join time and cached in localStorage). This is
-- what stops Realtime from ever broadcasting it (see ADR-0013).
create table split_guest_secret (
  guest_id uuid primary key references split_guest (id) on delete cascade,
  token uuid not null default gen_random_uuid()
);

create table split_item (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references split_bill (id) on delete cascade,
  name text not null,
  line_total_cents bigint not null check (line_total_cents > 0),
  position int not null default 0,
  claimed_by_guest_id uuid references split_guest (id) on delete set null
);

create index split_guest_bill_idx on split_guest (bill_id);
create index split_item_bill_idx on split_item (bill_id);

-- ---------------------------------------------------------------------------
-- RLS: reads are public-with-obscurity (same accepted tradeoff as
-- invite_select using(true) — see ADR-0013). Writes have NO policies at all;
-- they only happen through the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------
alter table split_bill enable row level security;
alter table split_guest enable row level security;
alter table split_guest_secret enable row level security;
alter table split_item enable row level security;

create policy split_bill_select on split_bill for select using (true);
create policy split_guest_select on split_guest for select using (true);
create policy split_item_select on split_item for select using (true);
-- split_guest_secret: deliberately NO policies of any kind (default-deny),
-- not even a "using (false)" — this table is invisible to every client role.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Admin creates a bill from the (possibly hand-edited) scan-receipt output.
-- p_items shape: [{ "name": text, "line_total_cents": bigint }, ...] in
-- display order. Requires a signed-in user.
create or replace function splitty_create_bill(
  p_merchant text,
  p_receipt_total_cents bigint,
  p_items jsonb
) returns table (bill_id uuid, share_code text, guest_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bill_id uuid;
  v_code text;
  v_guest_id uuid;
  v_token uuid;
  v_name text;
  item jsonb;
  i int := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to create a split';
  end if;

  v_code := left(replace(gen_random_uuid()::text, '-', ''), 16);
  select coalesce(display_name, 'You') into v_name from profile where user_id = v_uid;

  insert into split_bill (share_code, created_by, merchant, receipt_total_cents)
  values (v_code, v_uid, nullif(trim(p_merchant), ''), greatest(p_receipt_total_cents, 0))
  returning id into v_bill_id;

  insert into split_guest (bill_id, display_name, is_admin)
  values (v_bill_id, coalesce(v_name, 'You'), true)
  returning id into v_guest_id;

  v_token := gen_random_uuid();
  insert into split_guest_secret (guest_id, token) values (v_guest_id, v_token);

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if (item ->> 'name') is not null and trim(item ->> 'name') <> ''
       and (item ->> 'line_total_cents')::bigint > 0 then
      insert into split_item (bill_id, name, line_total_cents, position)
      values (v_bill_id, trim(item ->> 'name'), (item ->> 'line_total_cents')::bigint, i);
      i := i + 1;
    end if;
  end loop;

  if i = 0 then
    raise exception 'A split needs at least one item';
  end if;

  return query select v_bill_id, v_code, v_guest_id, v_token;
end $$;

-- Guest joins with just a name. No auth required.
create or replace function splitty_join(p_share_code text, p_display_name text)
returns table (guest_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_bill record;
  v_guest_id uuid;
  v_token uuid;
  v_name text := left(trim(coalesce(p_display_name, '')), 40);
begin
  if v_name = '' then
    raise exception 'Enter your name';
  end if;

  select * into v_bill from split_bill where share_code = p_share_code;
  if not found then
    raise exception 'Split not found';
  end if;
  if v_bill.status = 'closed' then
    raise exception 'This split is closed';
  end if;

  insert into split_guest (bill_id, display_name) values (v_bill.id, v_name)
  returning id into v_guest_id;

  v_token := gen_random_uuid();
  insert into split_guest_secret (guest_id, token) values (v_guest_id, v_token);

  return query select v_guest_id, v_token;
end $$;

-- Shared helper: resolve + validate a (share_code, guest_token) pair.
-- Raises on any mismatch — deliberately doesn't distinguish "wrong code" from
-- "wrong token" in the error message (no information leak either way).
create or replace function _splitty_guest(p_share_code text, p_guest_token uuid)
returns table (bill_id uuid, bill_status text, guest_id uuid, locked_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select b.id as bill_id, b.status as bill_status, g.id as guest_id, g.locked_in
  into r
  from split_bill b
  join split_guest g on g.bill_id = b.id
  join split_guest_secret s on s.guest_id = g.id
  where b.share_code = p_share_code and s.token = p_guest_token;

  if not found then
    raise exception 'Not recognized — rejoin the split';
  end if;

  return query select r.bill_id, r.bill_status, r.guest_id, r.locked_in;
end $$;

create or replace function splitty_claim_item(p_share_code text, p_guest_token uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your items'; end if;

  update split_item set claimed_by_guest_id = g.guest_id
    where id = p_item_id and bill_id = g.bill_id and claimed_by_guest_id is null;
  if not found then
    raise exception 'Someone already grabbed that one';
  end if;
end $$;

create or replace function splitty_unclaim_item(p_share_code text, p_guest_token uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your items'; end if;

  update split_item set claimed_by_guest_id = null
    where id = p_item_id and bill_id = g.bill_id and claimed_by_guest_id = g.guest_id;
  if not found then
    raise exception 'That item is not yours to release';
  end if;
end $$;

create or replace function splitty_set_tip(p_share_code text, p_guest_token uuid, p_tip_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your tip'; end if;

  update split_guest set tip_percent = greatest(0, least(100, p_tip_percent))
    where id = g.guest_id;
end $$;

create or replace function splitty_set_locked(p_share_code text, p_guest_token uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;

  update split_guest set locked_in = p_locked where id = g.guest_id;
end $$;

-- Admin-only. Requires the signed-in creator.
create or replace function splitty_close_bill(p_share_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from split_bill where share_code = p_share_code and created_by = auth.uid()
  ) then
    raise exception 'Only the creator can close this split';
  end if;

  update split_bill set status = 'closed', closed_at = now() where share_code = p_share_code;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — anon gets the guest-facing writes (extends the invite_preview
-- precedent from a read to real writes; see ADR-0013).
-- ---------------------------------------------------------------------------
revoke execute on function splitty_create_bill(text, bigint, jsonb) from public;
revoke execute on function splitty_join(text, text) from public;
revoke execute on function _splitty_guest(text, uuid) from public;
revoke execute on function splitty_claim_item(text, uuid, uuid) from public;
revoke execute on function splitty_unclaim_item(text, uuid, uuid) from public;
revoke execute on function splitty_set_tip(text, uuid, numeric) from public;
revoke execute on function splitty_set_locked(text, uuid, boolean) from public;
revoke execute on function splitty_close_bill(text) from public;

grant execute on function splitty_create_bill(text, bigint, jsonb) to authenticated;
grant execute on function splitty_close_bill(text) to authenticated;

grant execute on function splitty_join(text, text) to anon, authenticated;
grant execute on function splitty_claim_item(text, uuid, uuid) to anon, authenticated;
grant execute on function splitty_unclaim_item(text, uuid, uuid) to anon, authenticated;
grant execute on function splitty_set_tip(text, uuid, numeric) to anon, authenticated;
grant execute on function splitty_set_locked(text, uuid, boolean) to anon, authenticated;
-- _splitty_guest is an internal helper only ever called by the RPCs above
-- (which run as the function owner) — it does NOT need a grant to anon/
-- authenticated, and should not get one.
```

**Apply exactly like every other migration in this project**: port 5432 is
blocked on this network, so use the Supabase Management API
`database/query` endpoint (`POST /v1/projects/zgoinuagmornkwgqomhq/database/query`,
`User-Agent: SupabaseCLI/2.109.1`), then record the version in
`supabase_migrations.schema_migrations` — see the notes on earlier migrations
in this file for the exact working incantation.

### Repo interface additions (`src/lib/data/repo.ts`)
New types, alongside the existing `ScanResult`/`ScanItem`:

```ts
export interface SplitBillItemInput {
  name: string;
  lineTotalCents: Cents;
}

export interface SplitBillGuest {
  id: string;
  displayName: string;
  tipPercent: number;
  lockedIn: boolean;
  isAdmin: boolean;
}

export interface SplitBillItem {
  id: string;
  name: string;
  lineTotalCents: Cents;
  claimedByGuestId: string | null;
}

export interface SplitBill {
  billId: string;
  shareCode: string;
  merchant: string | null;
  receiptTotalCents: Cents;
  status: "open" | "closed";
  items: SplitBillItem[];
  guests: SplitBillGuest[];
}
```

New `Repo` methods (append to the interface, own section like `// --- receipt
scanning ---` already has):

```ts
// --- Splitty (Phase 8; standalone from the expense ledger — ADR-0013) ---
/** Admin only (signed in). Creates the bill + the admin's own guest row. */
splittyCreateBill(
  merchant: string | null,
  receiptTotalCents: Cents,
  items: SplitBillItemInput[]
): Promise<{ shareCode: string; guestId: string; guestToken: string }>;
/** No auth required. */
splittyJoin(shareCode: string, displayName: string): Promise<{ guestId: string; guestToken: string }>;
/** No auth required. Null if the code doesn't exist. */
splittyGetBill(shareCode: string): Promise<SplitBill | null>;
splittyClaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
splittyUnclaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
splittySetTip(shareCode: string, guestToken: string, tipPercent: number): Promise<void>;
splittySetLocked(shareCode: string, guestToken: string, locked: boolean): Promise<void>;
/** Admin only (signed in, must be the creator). */
splittyCloseBill(shareCode: string): Promise<void>;
/** Admin only — bills the signed-in user created, newest first. */
splittyListMyBills(): Promise<
  { shareCode: string; merchant: string | null; status: "open" | "closed"; createdAt: string }[]
>;
/** Realtime: invoke cb when items/guests change on this bill. Returns unsubscribe. */
subscribeSplitBill(shareCode: string, cb: () => void): () => void;
```

**`SupabaseRepo` implementation notes:**
- `splittyCreateBill` / `splittyJoin` / `splittyClaimItem` / etc. are thin
  `this.sb.rpc("splitty_...", {...})` wrappers, same shape as
  `redeemInvite`/`removeMember` already in this file — surface the RPC's
  `error.message` via `ValidationError`, matching the existing `this.fail()`
  helper pattern.
- `splittyGetBill` is **not** an RPC — it's three plain `.from().select()`
  calls (bill by `share_code`, items by `bill_id`, guests by `bill_id`, each
  ordered sensibly — items by `position`, guests by `joined_at`) then
  assembled client-side into one `SplitBill` object. This works unauthenticated
  because of the `select using (true)` policies above. Return `null` if the
  bill query comes back empty (`maybeSingle()`).
- `subscribeSplitBill` mirrors `subscribeShoppingItems` exactly — two
  `postgres_changes` listeners on one channel (`split_item` and `split_guest`,
  both `filter: bill_id=eq.<id>` — note this needs the bill's `id`, not its
  `share_code`, resolved via one extra lookup or passed in from the caller,
  who already has it from `splittyGetBill`).
- **Crucially**, none of these calls should go through `this.uid()` (the
  helper that throws if signed out) except `splittyCreateBill`,
  `splittyCloseBill`, and `splittyListMyBills` — the rest must work with no
  session at all. Double-check `SupabaseRepo`'s constructor/`this.sb` doesn't
  assume a session exists anywhere in the call path for the guest methods.

**`MemoryRepo` (demo) notes:** every feature in this app has a demo story
(ADR-0005's `getDemoRepo()`). Splitty's multi-device magic obviously can't be
demoed in a single in-memory session, so keep it simple: seed one canned open
bill ("Demo braai", 4 items, one fake already-locked-in guest "Sam" who's
claimed 2 of them) so the Splitty tab isn't empty in demo mode, and make
`splittyCreateBill`/`splittyJoin`/etc. mutate that same in-memory bill (same
spirit as the rest of `MemoryRepo` — real behavior, just not persisted or
cross-device). Document in a comment that the guest link literally cannot be
opened on a second device in demo mode (there's no server), same caveat
pattern already used for `scanReceipt`'s canned response.

### New/changed UI files
- **`src/app/split/[code]/page.tsx`** (new, public route) — the guest/admin
  claim page. Structurally similar to `src/app/join/[code]/page.tsx` but
  **must not** gate on `useSessionState()` — it has to render for a visitor
  with zero Tally history. Owns: localStorage read/write for
  `splitty_guest_<code>`, the name-entry form, the item checklist, tip
  selector, lock/unlock, and (conditionally, when `isAdmin` on the resolved
  guest) the share panel + overview + close-bill button.
- **`src/components/splitty-tab.tsx`** (new) — the 5th tab's content: list
  from `splittyListMyBills()`, a live coverage line per bill (needs its own
  `splittyGetBill` + `subscribeSplitBill` per visible row, or a lighter
  bulk-status RPC if that turns out to be too chatty — start simple, revisit
  if it's slow), "+ New split" entry point into the capture flow.
- **Capture flow** — strongly prefer **extending `receipt-scan-sheet.tsx`**
  with a `mode: "expense" | "splitty"` prop (it already has the exact capture
  → scan → editable-checklist UI needed) over duplicating it. In `"splitty"`
  mode, the terminal action is "Create split" → `repo.splittyCreateBill(...)`
  → write `localStorage["splitty_guest_" + shareCode]` → `router.push`
  to `/split/<shareCode>`, instead of `"expense"` mode's `onAdd(...)` callback
  into the Add-expense sheet.
- **Share panel** — reuse `invite-sheet.tsx`'s share block (lines ~219–258:
  the code display, `canNativeShare` branch, `shareInvite`/`copyMessage`
  functions) as the template; swap the message copy and the `/join/` → `/split/`
  path.
- **`src/components/tab-bar.tsx`** — add `"splitty"` to the `Tab` union, an
  icon path, and a label. Five `flex: 1` buttons in the existing bar will fit
  (confirmed acceptable per Josh — narrower per-tab but not broken); no other
  layout change needed.
- **`src/app/page.tsx`** — wire the new tab case to render `<SplittyTab
  repo={...} />`, following the existing tab-switch pattern already there for
  home/expenses/list/reports.

### Explicit non-goals for v1 (confirmed)
- **No `Expense` row, ever, in v1.** Splitty is fully outside the
  group/expense/balance system. (A later "convert a closed split into a real
  expense" phase is plausible future work, not part of this spec — it would
  need its own design pass, likely an authenticated RPC run by the bill's
  creator since only they have a real session and group membership.)
- **No splitting a single item's cost across multiple guests** — the
  qty-expansion from Phase 7 already produces one row per unit, so this
  isn't needed (confirmed decision).
- **No payment collection/money movement** — Splitty only tracks who claimed
  what and their tip; it never charges or transfers anything.
- **No share-link expiry** — closed bills just go read-only forever; no
  cleanup job.
- **No re-opening a closed bill** in v1 (plausible stretch RPC
  `splitty_reopen_bill`, same auth shape as `splitty_close_bill` — not built
  now, don't add it unless asked).
- **No requirement that per-guest totals reconcile to the receipt total** —
  see "Money math" above.

### Build order (when this gets picked up)
1. Migration `20260726000000_splitty.sql` (SQL above, verbatim) — apply via
   the Management API, record in `schema_migrations`.
2. `Repo` interface additions + `SupabaseRepo` implementation +
   `MemoryRepo` canned demo bill.
3. `receipt-scan-sheet.tsx` `mode` prop + "Create split" terminal action.
4. `/split/[code]/page.tsx` — name-entry → checklist → tip → lock, guest-only
   first (get the core loop working end-to-end with two real browser tabs
   before adding admin-only UI).
5. Admin-only additions to the same page: share panel, overview, close-bill.
6. `SplittyTab` + tab-bar + `page.tsx` wiring.
7. E2E-verify with **two real browser sessions** (not just one tab) — this is
   the first feature in the app where two genuinely different, unauthenticated
   parties interact live, so test claim races (`splitty_claim_item`'s atomic
   `update ... where claimed_by_guest_id is null` in particular) deliberately,
   not just the happy path.
8. Update this ROADMAP section's status line, write the "✅ SHIPPED" note
   (matching every other phase's convention), verify + ship per CLAUDE.md.

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
