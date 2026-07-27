*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 5 — Insight & export → M4 "Complete v1" ✅ (2026-07-16)
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
