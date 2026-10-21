*(Part of the [Tally roadmap](ROADMAP.md).)*

# Backlog

Cross-cutting loose ends that aren't worth a phase of their own — either too
small, or waiting on something outside this repo (an account, a real need
arising). Add new items here rather than letting them accumulate inside
`ROADMAP.md` or a phase file.

**Every open item carries an effort size and a rough Claude-credits band**, so
the cost is visible before anything starts. Scale, calibration and the two
things that reliably blow an estimate (debugging, and manual/external steps)
are in [ROADMAP.md → Estimating scale](ROADMAP.md#estimating-scale). Sizes are
inferred from work volume, not measured spend.

## Other open items
- ~~**Formal a11y pass (WCAG)**~~ → **done** 2026-10-21, against WCAG 2.2 AA.
  Measured first, then fixed at the source so it holds for future screens:
  - **Contrast (1.4.3).** Only body text passed. White on the teal buttons and
    balance card was **2.57:1**, teal links 2.43:1, meta grey 2.85:1, the
    money colours ~4.1:1. All 20 text-bearing palette tokens were darkened by
    the *minimum* needed (hue and saturation kept) to reach 4.5:1 on every
    background each one actually sits on — page, cards, `--s2`, its own pale
    tint — so every pairing now measures ≥4.59:1. **The visible result is a
    deeper teal** (`#2fb3ac` → `#1d6e6a`): white button text is what forces
    it, since it needs the teal at least 12 lightness points darker whatever
    else changes. The values and the reasoning are in the LAYER 1 comment in
    `globals.css`; reverting is one block.
  - **Names (1.3.1 / 4.1.2).** A live audit of every form control found 25
    `Input`s named only by placeholder (`Label` is visual, not a `<label>`).
    `Input` now takes a `label` (falling back to the placeholder, so nothing
    can ship unnamed) and every call site passes the words on screen. Audit
    re-run: zero unnamed controls.
  - **Keyboard (2.1.1).** Activity rows, Splitty cards and claim rows were
    `<div role="button">` with no focus or key handling; `pressable()` adds
    both.
  - **Focus visible (2.4.7).** There was no focus style anywhere — the shared
    `Input` set `outline: none`. Now a global `:focus-visible` ring, a border
    colour on focused fields, and an underline on the borderless ones.
  - **Zoom (1.4.4).** `maximum-scale=1` blocked pinch-zoom on Android; removed.
    Every text field is now ≥16px, which is what actually stops iOS zooming in
    on focus.
  - **Target size (2.5.8).** The list's ✕ Remove was 15×23px (and it deletes),
    the list checkbox 22×22, "See all"/"Clear" 17px tall. A `.hit` utility
    grows the tappable area to ≥34px without changing the look; checked that
    no target steals a neighbour's taps.
  - **Not verifiable from this environment:** the focus styles themselves —
    the dev browser pane has no window focus, so `:focus` never matches there.
    The rules are present and correct by inspection.
- ~~**Performance — cut the reload chain**~~ → **shipped** as
  [Phase 16](phases/phase-16-performance.md) (2026-07-31). Kept as the record
  of where it came from: the cause turned out to be a network auth call before
  every write plus a duplicated load chain, cut from ~7 serial round trips
  to ~2.
- **Custom SMTP for real auth emails** (Resend) — was backlogged since Phase
  0/1; now scoped as an actual launch blocker inside
  [Phase 10](phases/phase-10-custom-domain-launch.md) (Supabase's default
  mailer caps at 2 emails/hour project-wide). Magic-link/password sign-in is
  the flow until Phase 10 ships.
  **Effort:** S · **Credits:** ~4–10 *(bundled into Phase 10; mostly account
  setup and DNS, so the wall-clock is waiting, not work.)*
- **App-wide multi-currency support** — the *Tally's ledger currency* is
  ZAR-only today: `fmt()`/`fmtR()` (`src/lib/domain/money.ts`), the
  `group.currency` check constraint, and push-notification copy
  (`_push_fmt()`) all hardcode Rand. Flagged by Josh while reviewing Phase 9,
  not a near-term priority — revisit only if a real need appears (e.g. a
  non-South-African household). Full note in
  [Phase 9](phases/phase-09-push-notifications.md#backlog-multi-currency-not-part-of-this-phase).
  **Distinct from [Phase 14](phases/phase-14-multi-currency-expenses.md)**,
  which is a narrower, now-scoped feature: a single *expense* entered in a
  foreign currency, converted and locked to ZAR at save time — the Tally's
  own ledger currency stays ZAR either way (ADR-0017).
  **Effort:** XL · **Credits:** ~50–95 *(every money display, the `group`
  currency constraint, the SQL `_push_fmt()` mirror, settlements, reports and
  export — plus a per-Tally currency choice and its migration. The largest
  unbuilt item on file.)*
- **Privacy policy / terms page** — deferred by Josh while scoping Phase 10,
  despite real strangers' financial data (salaries, expenses) being stored
  once that phase ships. Not a law-firm document needed, just a short,
  plain-language page (what's stored, salary private-by-default, no data
  sold, a contact for deletion requests). Revisit before or shortly after
  Phase 10 goes live publicly.
  **Effort:** S · **Credits:** ~4–9 *(one static route plus footer links — the
  cost is deciding the wording, not building it.)*
  ⚠️ **[Phase 18](phases/phase-18-learning-categorisation.md) raises this from
  "should" to "must".** That phase introduces the project's first
  cross-tenant table — category corrections shared between unrelated
  households — and the policy has to name it. Ship the policy with or before
  Phase 18, not after.
- **CAPTCHA / bot-signup prevention** — Supabase's `security_captcha_enabled`
  is off; signup is fully open. Only worth doing if bot signups become an
  observed problem post-launch (Phase 10), not preemptively — would need an
  hCaptcha account if/when revisited.
  **Effort:** S · **Credits:** ~3–8 *(a Supabase setting plus a client widget —
  but only worth spending anything on if bot signups actually appear.)*
- **Deeper "Tally-ho" brand treatment** — Josh confirmed while scoping
  Phase 10 that "Tally-ho" should be incorporated more fully into the brand
  at some point (beyond its current role as the push-notification
  catchphrase) — explicitly a **later, separate redesign phase**, not bundled
  into the Phase 10 domain migration.
  **Effort:** M · **Credits:** ~10–25 *(copy, icon and empty-state work across
  the app; rises to L if it lands alongside
  [Phase 11](phases/phase-11-visual-reskin.md)'s reskin — do them together.)*

## Animation & interaction polish (survey 2026-07-28)
Josh asked for a sweep of animation opportunities beyond those in the Phase 11
design. Survey finding: **15 of 18 components have no `transition` or
`animation` at all** (only `add-expense-sheet`, `settings-sheet` and `ui.tsx`
have any), the app has just 3 keyframes (`sheetUp`, `spin`, `toastPop`), and
**nothing anywhere honours `prefers-reduced-motion`**.

Already scoped into [Phase 11](phases/phase-11-visual-reskin.md), not repeated
here: wave drift, staggered rise-in, scroll-collapsing headers, sheet
drag-to-dismiss, and the reduced-motion guard (that one is a correctness fix,
not polish — it should not slip).

**Whole section as one pass: Effort L · Credits ~25–50.** Cheaper together
than piecemeal — one reduced-motion guard, one easing vocabulary, one review.
Per-item sizes below are for cherry-picking; they don't sum to the section
figure because each would re-pay the same setup.

**Status 2026-10-21: every item in this section is done.**

Candidates for a later pass, roughly highest value first:
- ~~**Tab switching is an instant swap**~~ → **done** in Phase 11 (`tabIn`:
  each tab fades and rises in). 2026-10-21: its fill mode changed to
  `backwards` so the wrapper no longer holds a transform (BUG-018).
- ~~**List rows appear all at once**~~ → **done**: Expenses and List in
  Phase 11; Activity rows and Splitty bill cards added 2026-10-21, same capped
  cross-group stagger.
- ~~**No press feedback**~~ → **done**: tab bar, pills, buttons and list rows
  in Phase 11 (`.press`); the FAB, Activity rows, Splitty cards, Splitty claim
  rows, toast Undo and "+ Add a note" added 2026-10-21.
- ~~**Checkbox ticks are instant**~~ → **done**: shopping list in Phase 11;
  Splitty claim 2026-10-21 (colour transition + tick pop, and the row is now
  keyboard-operable with `aria-pressed`).
- ~~**Balance figure snaps**~~ → **done** 2026-10-21: `useCountUp` counts the
  signed balance from old to new (so owed→owing passes through zero), whole
  cents every frame, tabular digits, instant under reduced motion; the pop
  still plays.
- ~~**Loading is a bare spinner**~~ → **done** 2026-10-21
  (`components/skeletons.tsx`): Home's own shape on every app open — it is
  server-rendered, so it is also the very first paint — plus Splitty and
  Activity. Reports never had a loading state (its data rides in with Home's).
- ~~**Toast has an entry but no exit**~~ → **done** 2026-10-21: `toastOut`
  exit, and a bar draining across the undo window (exempt from the
  reduced-motion guard — it's information). Also fixed an existing glitch:
  `toastPop` overrode the inline centring transform, so every toast slid in
  off-centre and snapped to the middle.
- ~~**Sheet content doesn't animate in**~~ → **done** 2026-10-21:
  `.sheet-stagger` settles a sheet's children in (6px, staggered, then the rest
  together) just behind the panel.
- ~~**No pull-to-refresh**~~ → **done** 2026-10-21 (`usePullToRefresh`):
  arms only at the top and only for a vertical downward drag, half-speed
  resistance, Material-style indicator (content doesn't move, so nothing gains
  a transform). Installed iOS PWAs have no browser pull-to-refresh at all.

## Design-fidelity backlog (audit vs design handoff, 2026-07-13)
Gaps between the built app and `design_handoff_settleup/README.md`, each with
its target phase. The audit confirmed all iron rules hold and Phase-1 exit
criteria are met (bar the E6 trial); these are the visible deltas:

- ~~Salary-proportional split doesn't work for a real couple~~ → **fixed in
  Phase 3** (privacy-preserving server RPC, ADR-0010)
- ~~Partner's real display name never shown~~ → **fixed in Phase 3**
- ~~Settings (editable name/salary, privacy toggle)~~ → **basic sheet shipped
  in Phase 3**; simplify-debts toggle + full-screen fidelity in Phase 6
- ~~Header per design: tappable Tally name → switcher, bell → Activity~~ →
  **done** (bell in Phase 5, tappable name restored in Phase 15). The avatar
  is still a "Settings" pill rather than a photo — folded into the avatar item
  below.
- ~~Spaces switcher + create-space sheet~~ → **done** (Phase 6, reworked in
  Phases 12 and 15).
- Sync-state pill (synced/syncing/offline) → belongs to **Phase 2**; there is
  nothing to show until an outbox exists. **Effort:** XS · **Credits:** ~1–3
  *(within Phase 2; meaningless before it.)*
- ~~Upcoming-recurring card on Home~~ → built in Phase 4, then **deliberately
  removed** in the Tally polish batch when Recurring moved into Settings. Not
  pending — listed only so it isn't "re-fixed" later.
- ~~Note input on Add/Edit sheet~~ → **done** 2026-10-21: behind a
  "+ Add a note" link so the Add sheet stays zero-friction (ADR-0008), open by
  default only when editing an expense that has one. A receipt scan's item
  list now lands in it (visible and editable) instead of being saved silently.
- Avatar photos (add-photo affordance in onboarding/settings) — still open.
  Storage and the image-compression helper already exist from receipts, so the
  groundwork is done. **Effort:** M · **Credits:** ~10–20 *(upload, crop,
  bucket policy, and every avatar fallback across the app.)*
- ~~Group rename UI; member-leave-with-zero-balance rule~~ → **done**
  (Phase 6, consolidated into "Manage this Tally" in Phase 12).
- Percentage/shares split methods: implemented + tested in the domain layer but
  deliberately **not surfaced** — the final design's segmented control has
  exactly three options (Equal · Exact · Proportional); design supersedes scope
  §6.5 here. Revisit only if a real need appears. **Not estimated** — this is
  a standing decision not to build, not a pending task.
