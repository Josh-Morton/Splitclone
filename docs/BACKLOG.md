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

Candidates for a later pass, roughly highest value first:
- **Tab switching is an instant swap** — no cross-fade or directional slide
  between Home/Expenses/List/Reports/Splitty. Probably the single most
  "website-not-app" moment left after Phase 11. **[S · ~5–10]**
- **List rows appear all at once** (Expenses, List, Activity, Splitty items) —
  a short staggered fade/slide on first paint would make loading feel
  intentional rather than abrupt. **[S · ~4–9]**
- **No press feedback** on the FAB, tab-bar items, pills or list rows — a
  scale-down/ripple on `:active` is the cheapest possible "feels native" win. **[XS · ~2–5]**
- **Checkbox ticks are instant** — shopping-list check/uncheck and Splitty
  item claim are the two most-tapped controls in the app and have no
  transition at all. Worth animating the tick draw + row strike-through. **[S · ~4–8]**
- **Balance figure snaps** between values — a count-up/roll animation when
  the hero number changes (after adding an expense or settling) would make
  the app's most important number feel alive. **[S · ~4–8]**
- **Loading is a bare spinner** — skeleton placeholders matching row shapes
  would reduce perceived latency, especially on the Reports tab. **[M · ~10–20]**
- **Toast has an entry (`toastPop`) but no exit** — it disappears abruptly
  after 4s; also no visual countdown on the undo window, so users can't tell
  how long they have to hit Undo. **[S · ~4–8]**
- **Sheet content doesn't animate in** — only the sheet container slides up;
  contents appear fully formed. The Phase 11 stagger pattern could extend to
  sheet bodies. **[S · ~4–8]**
- **No pull-to-refresh** anywhere, despite Realtime already keeping data
  fresh — worth considering only if users actually reach for it. **[M · ~10–18]**

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
- Note input on Add/Edit sheet — still open; the schema and the detail view
  already carry notes, so this is just the input.
  **Effort:** XS · **Credits:** ~2–4
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
