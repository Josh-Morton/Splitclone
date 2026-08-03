# Tally — Roadmap & Status

> **This is the live status board.** Update it whenever work lands — any LLM or
> human resuming the project starts here to see exactly where we are, then
> follows a link for the detail. Full epic/task detail for Phase 1 with
> acceptance criteria lives in the Phase 1 plan doc (`SettleUp - Phase 1 Plan,
> Roadmap & Infrastructure.docx`).
>
> **How this file is structured — read before editing.** This file is a
> **high-level index only**. Every phase's full detail — specs, checklists,
> architecture, migration SQL, verification notes — lives in its own file
> under [`docs/phases/`](phases/). Keep it that way:
> - **Adding a new phase?** Create `docs/phases/phase-NN-slug.md` (zero-padded
>   two-digit number, kebab-case slug) with the full spec/detail, then add one
>   row to the table below linking to it. Follow the shape of an existing
>   phase file (e.g. [phase-09](phases/phase-09-push-notifications.md)) —
>   goal, spec detail, verification, non-goals.
> - **Updating a shipped or in-progress phase?** Edit that phase's file
>   directly. Only touch this file if the phase's status word, milestone, or
>   one-line summary in the table changed.
> - **Never let this file's per-phase entries grow past the table row** — if
>   you're tempted to add more than a line or two here, that content belongs
>   in the phase file instead.
> - Cross-cutting loose ends (design gaps, deferred items not worth a whole
>   phase) go in [`docs/BACKLOG.md`](BACKLOG.md), not here and not buried
>   inside a phase file.
> - **Found a bug** (something already built that doesn't work as intended,
>   as opposed to a feature that was never built)? Log it in
>   [`docs/BUGS.md`](BUGS.md), not here and not in `BACKLOG.md`. If the fix
>   is substantial, promote it to a phase file exactly like a backlog item
>   would be, and link the two together.

**Last updated:** 2026-08-03 (Phase 14 shipped — per-expense foreign currency, 166 currencies, sticky picker, always recorded in Rand)

## Where we are

**Tally is live:** https://splitclone-joshprojects13.vercel.app. The full
ledger (add/edit/delete, multi-payer, settle-up), spaces, recurring bills,
shopping list, reports, receipt scanning, Splitty, and push notifications all
work against the live Supabase backend. Phases 0, 1, 3, 4, 5, 7, 8, and 9 are
shipped; Phase 6 (polish & hardening) is ongoing; Phase 2 (offline-first) is
deliberately deferred to last (ADR-0009). Remaining for M1 is the Phase 1
E6 trial — a week of real use by Josh + partner. **Phase 10** (custom domain,
real auth email, public-launch prep) is specced but not built — see the table
below.

## Phases

Numbered in the order they were originally scoped — **not** execution order.
Actual build order was 0 → 1 → 3 → 4 → 5 → 6 → 7 → 8 → 9, with **2
deliberately deferred to last** (ADR-0009: ship the correct ledger and the
features people actually asked for before offline-first).

| Phase | Status | Milestone | Summary |
|---|---|---|---|
| [0 — Foundations](phases/phase-00-foundations.md) | ✅ Done | — | Repo scaffold, design tokens, domain layer, Supabase project, Vercel deploy |
| [1 — Core ledger (MVP)](phases/phase-01-core-ledger.md) | ✅ Built · ⏳ M1 trial pending | M1 "It works for us" | Auth, onboarding, invites, add/edit/delete expenses, settle-up |
| [2 — Offline-first](phases/phase-02-offline-first.md) | 🔜 Not started (deferred) | M2 "Works anywhere" | Dexie local store, outbox/sync engine, full offline PWA — moved to end, ADR-0009 |
| [3 — Fair-share & richer splits](phases/phase-03-fair-share-splits.md) | ✅ Done | — | Salary-proportional splits via a privacy-preserving server RPC (ADR-0010) |
| [4 — Recurring & shopping list](phases/phase-04-recurring-shopping-list.md) | ✅ Done (2026-07-13) | M3 "Fair & automatic" | Recurring bills (pg_cron), shared shopping list, cart→expense |
| [5 — Insight & export](phases/phase-05-insight-export.md) | ✅ Done (2026-07-16) | M4 "Complete v1" | Reports tab, Excel export, activity feed, receipt photos |
| [6 — Polish & hardening](phases/phase-06-polish-hardening.md) | 🟡 Ongoing | — | Spaces switcher, invite rework, categories, auth rebuild, membership management, empty/error states, a11y, security/perf passes |
| [7 — Receipt line-item scanning](phases/phase-07-receipt-scanning.md) | ✅ Shipped (2026-07-22) | M5 "Scan the slip" | Photo a till slip → Gemini extracts line items → tick what's yours |
| [8 — Splitty](phases/phase-08-splitty.md) | ✅ Shipped (2026-07-23) | M6 "Split with anyone" | Standalone bill-splitting via a shared link — no guest account needed (ADR-0013) |
| [9 — Push notifications](phases/phase-09-push-notifications.md) | ✅ Shipped (2026-07-26) | M7 "Tally-ho!" | Web Push via VAPID — 5 triggers, "Tally-ho!" copy, Android-first (ADR-0014) |
| [10 — Custom domain & public launch prep](phases/phase-10-custom-domain-launch.md) | 📝 Spec only — not built (2026-07-27) | — | Move off `*.vercel.app` onto a real domain, custom auth email (current mailer caps at 2/hr), free-tier watchlist (ADR-0015) |
| [11 — Visual reskin (light "wave" theme)](phases/phase-11-visual-reskin.md) | 📝 Spec only — not built (2026-07-28) | — | Dark → light token swap, Nunito, pill geometry, wave motif, collapsing headers, sheet drag-to-dismiss. Presentation only (ADR-0016) |
| [12 — Tally management & terminology rename](phases/phase-12-tally-management.md) | ✅ Shipped (2026-07-30) | — | "Space"/"household" → "Tally" everywhere; one consolidated "Manage this Tally" screen; per-Tally default split method |
| [13 — Shopping list rework](phases/phase-13-shopping-list-rework.md) | ✅ Shipped (2026-07-30) | — | Drop cart→expense; checked items become a dated "Sorted" section instead |
| [14 — Multi-currency expenses](phases/phase-14-multi-currency-expenses.md) | ✅ Shipped (2026-08-03) | — | Per-expense foreign currency, converted + rate-locked to ZAR at entry; recently-used quick-pick (ADR-0017/0018) |
| [15 — Fix Tally navigation](phases/phase-15-tally-navigation-fix.md) | ✅ Shipped (2026-07-30) | — | Bug fix: header should switch Tallies, Settings should manage them — Phase 12 built it backwards ([BUG-001](BUGS.md#bug-001-tally-navigation--header-should-switch-settings-should-manage)) |
| [16 — Performance: cut the reload chain](phases/phase-16-performance.md) | ✅ Shipped (2026-07-31) | — | ~1000ms delays switching Tallies/saving/logging in — every action reloads the whole home screen sequentially, with several calls duplicated |
| [17 — Unified shopping list across Tallies](phases/phase-17-unified-shopping-list.md) | 📝 Spec only — not built (2026-07-30) | — | Per-Tally segments within one List tab, drop the price estimate, default-Tally picker on add |

See [`docs/decisions/`](decisions/README.md) for the settled architectural
decisions (ADRs) behind these phases, [`docs/BACKLOG.md`](BACKLOG.md) for
cross-cutting loose ends that aren't a phase of their own, and
[`docs/BUGS.md`](BUGS.md) for confirmed defects in what's already built.

## Working agreements
- Ship the correct ledger before anything clever; offline is architectural and
  comes right after (scope doc §12.3).
- Every phase lands with tests; a phase's checkboxes flip only when the
  epic's "done when" criterion from the plan doc is met.
- See the structure note at the top of this file for how to add or update
  phase content.
