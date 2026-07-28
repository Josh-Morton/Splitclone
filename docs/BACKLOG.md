*(Part of the [Tally roadmap](ROADMAP.md).)*

# Backlog

Cross-cutting loose ends that aren't worth a phase of their own — either too
small, or waiting on something outside this repo (an account, a real need
arising). Add new items here rather than letting them accumulate inside
`ROADMAP.md` or a phase file.

## Other open items
- **Custom SMTP for real auth emails** (Resend) — was backlogged since Phase
  0/1; now scoped as an actual launch blocker inside
  [Phase 10](phases/phase-10-custom-domain-launch.md) (Supabase's default
  mailer caps at 2 emails/hour project-wide). Magic-link/password sign-in is
  the flow until Phase 10 ships.
- **Multi-currency support** — the app is ZAR-only today: `fmt()`/`fmtR()`
  (`src/lib/domain/money.ts`), the `group.currency` check constraint, and
  push-notification copy (`_push_fmt()`) all hardcode Rand. Flagged by Josh
  while reviewing Phase 9, not a near-term priority — revisit only if a real
  need appears (e.g. a non-South-African household). Full note in
  [Phase 9](phases/phase-09-push-notifications.md#backlog-multi-currency-not-part-of-this-phase).
- **Privacy policy / terms page** — deferred by Josh while scoping Phase 10,
  despite real strangers' financial data (salaries, expenses) being stored
  once that phase ships. Not a law-firm document needed, just a short,
  plain-language page (what's stored, salary private-by-default, no data
  sold, a contact for deletion requests). Revisit before or shortly after
  Phase 10 goes live publicly.
- **CAPTCHA / bot-signup prevention** — Supabase's `security_captcha_enabled`
  is off; signup is fully open. Only worth doing if bot signups become an
  observed problem post-launch (Phase 10), not preemptively — would need an
  hCaptcha account if/when revisited.
- **Deeper "Tally-ho" brand treatment** — Josh confirmed while scoping
  Phase 10 that "Tally-ho" should be incorporated more fully into the brand
  at some point (beyond its current role as the push-notification
  catchphrase) — explicitly a **later, separate redesign phase**, not bundled
  into the Phase 10 domain migration.

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

Candidates for a later pass, roughly highest value first:
- **Tab switching is an instant swap** — no cross-fade or directional slide
  between Home/Expenses/List/Reports/Splitty. Probably the single most
  "website-not-app" moment left after Phase 11.
- **List rows appear all at once** (Expenses, List, Activity, Splitty items) —
  a short staggered fade/slide on first paint would make loading feel
  intentional rather than abrupt.
- **No press feedback** on the FAB, tab-bar items, pills or list rows — a
  scale-down/ripple on `:active` is the cheapest possible "feels native" win.
- **Checkbox ticks are instant** — shopping-list check/uncheck and Splitty
  item claim are the two most-tapped controls in the app and have no
  transition at all. Worth animating the tick draw + row strike-through.
- **Balance figure snaps** between values — a count-up/roll animation when
  the hero number changes (after adding an expense or settling) would make
  the app's most important number feel alive.
- **Loading is a bare spinner** — skeleton placeholders matching row shapes
  would reduce perceived latency, especially on the Reports tab.
- **Toast has an entry (`toastPop`) but no exit** — it disappears abruptly
  after 4s; also no visual countdown on the undo window, so users can't tell
  how long they have to hit Undo.
- **Sheet content doesn't animate in** — only the sheet container slides up;
  contents appear fully formed. The Phase 11 stagger pattern could extend to
  sheet bodies.
- **No pull-to-refresh** anywhere, despite Realtime already keeping data
  fresh — worth considering only if users actually reach for it.

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
