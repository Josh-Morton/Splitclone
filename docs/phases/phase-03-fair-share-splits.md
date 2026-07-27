*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 3 — Fair-share & richer splits (execution order is 1 → 3 → 4 → 5 → 2 → 6 per ADR-0009)
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

## Post-launch tweaks (Josh, 2026-07-19)
- [x] **Categories reworked to 7 intuitive parents** (Groceries · Eating out ·
      Bills & rent · Transport · Household · Leisure · Other) with a much larger
      grocery/ingredient keyword database ("cheese"→Groceries) and word-token
      matching to avoid false positives. Legacy slugs resolve, no migration.
      (ADR-0011 revision.)
- [x] **Recurring supports weekly OR monthly** with a day picker (weekday pills
      for weekly, day-of-month for monthly) — in both the Add-expense "Repeating
      expense" toggle and the New-recurring sheet. Rule cards show "Every Wed" /
      "Monthly on day N". Server generator already handled weekly advance.
