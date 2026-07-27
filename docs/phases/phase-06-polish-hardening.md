*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 6 — Polish & hardening
- [ ] Empty/error/loading states · a11y · security re-audit · performance pass

## Added by Josh, 2026-07-16 (recorded for the backlog — flesh-outs below)

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

## Added by Josh, 2026-07-18 (researched + scoped; nice-to-haves)

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
