*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 4 — Recurring & shopping list → M3 "Fair & automatic" ✅ (2026-07-13)
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
