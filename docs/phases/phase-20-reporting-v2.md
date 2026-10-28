*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 20 — Reporting v2: drill-down, trends & insights ✅ SHIPPED (2026-10-28)

> **Effort:** L · **Credits:** ~20–35 *(no migration or server work — L because
> it's a full rewrite of Reports plus three chart components, a drill-down
> view and a tested aggregation module.)* See
> [Estimating scale](../ROADMAP.md#estimating-scale).
>
> **Requested by Josh (2026-10-28):** Reports "feels very one-dimensional" —
> *"I can't go down into the exact expenses that were made per category, per
> thing, per month"*; wants *"a bit more of a detailed spending graph"*, trend
> data *"in a nice chart"*, and for it to be *interesting*. Document first,
> then build.
>
> **The spec below is kept as written.** What was actually built, and the
> few places it differs, is recorded in [§11 · Shipped](#11--shipped-2026-10-28).
>
> **Decision record:** [ADR-0021](../decisions/0021-reporting-charts.md) —
> hand-rolled SVG, one hue + emphasis, small multiples instead of a stacked
> category chart.

## 1 · Research

### What data exists

Reports already receives **every expense in the Tally** (`listExpenses` has
no limit), so everything below is computed on the device — no new queries,
no migration, nothing to keep in sync.

| Field | What it makes possible |
|---|---|
| `amountCents` (always ZAR) | All totals — foreign expenses are already converted and locked (ADR-0017), so multi-currency needs no special handling |
| `spentAt` | Month buckets, within-month pacing, day-of-month |
| `category` (subcategory slug) → `parentOf()` | Category → subcategory drill-down |
| `description` | Recurring places/items ("Woolworths ×8"), search within a drill |
| `payers[]`, `splits[]` | Who paid, who owes, per-person views |
| `recurringId` | Separating fixed from discretionary spend (a candidate for later) |
| `note`, `receiptUrl` | Shown in the expense detail reached from a drill |

### The real data (production, aggregated, 2026-10-28)

- Two active Tallies, **~4 months of history each** (Jul–Oct 2026),
  **15–24 expenses a month**, **~R5 000–6 300 a month**. Median expense R250,
  95th percentile R697, largest R1 302. 0–25% recurring.
- **"Other" is 32–61% of spend in any month** — rows filed by the old matcher
  before the Phase 18 §1 engine went live; the new engine only files *new*
  expenses.

What that means for design: **month-on-month** is the comparison that
matters (year-on-year would be empty for a long time); charts must still read
well with 2–4 months of data; and seeing *what's inside "Other"* is one of the
most useful things a drill-down can do right now.

### Why Reports feels one-dimensional — measured causes

1. **The trend chart is usually one bar.** The default range is "This month",
   and the monthly chart only draws months inside the range.
2. **Empty months are skipped**, not drawn at zero — a month with no spending
   vanishes and the trend lies about the gap.
3. **Drill-down stops at subcategory totals.** There's no way from any number
   to the expenses behind it — the core of the request.
4. **No comparison anywhere.** No "vs last month", no pace, no change per
   category — so nothing on the screen says whether a number is normal.

### How established apps do it

- **YNAB, Spending Trends:** category group → category → individual
  transactions, with totals at each level.
  ([YNAB support](https://support.ynab.com/en_us/spending-trends-H1inlhzAc.md),
  [YNAB reports](https://www.ynab.com/ynab-reports-and-data/))
- **Monarch:** a "Month in Review" summary — top categories, cash flow,
  changes — plus trend and cash-flow charts.
  ([Motley Fool review](https://www.fool.com/money/personal-finance/monarch-money-review))

Tally takes the **drill path** from YNAB (with months as a second axis — the
"per month" Josh asked for) and the **"what changed" summary** idea from
Monarch, sized to a household with a few months of data.

## 2 · Goals and non-goals

**Goals**
- From any number, reach the expenses behind it: **month**, **category**,
  **subcategory**, or **a recurring place**, in any combination.
- A **trend** that always has context (a 12-month window, not one bar).
- **Comparison** throughout: vs the previous period, and a within-month pace.
- A few **plain-language insights** computed from the data — the
  "interesting" part, kept factual.
- Every value readable **without hover** (it's a phone app) and **without
  colour** (table twins, labels).

**Non-goals**
- Budgets / targets (no budget data exists; a separate feature).
- Income or cash flow (Tally records shared spending only).
- A stacked category chart — rejected on measurement (ADR-0021 §3).
- Year-on-year views (not enough history yet).
- Re-filing the "Other" pile — that is [Phase 18 §5](phase-18-learning-categorisation.md#5--retrospective-backfill);
  see §8.

## 3 · Screen structure

The single filter row stays where it is, above everything (Phase 6 filters:
range · person · category). Below it, top to bottom:

1. **Summary tiles** — Spent (with change vs the previous period), Expenses
   (count), Average per expense, Biggest single expense.
2. **Insights** — up to three sentences (§4.2).
3. **Monthly trend** — 12-month columns (§4.3). Tap a month to drill into it.
4. **Spending pace** — this month vs last month, cumulative (§4.4). Only for
   single-month ranges.
5. **Categories** — share bar, change, and a small trend per category
   (§4.5). Tap to drill.
6. **Biggest expenses** and **Regulars** — top five each (§4.6).
7. **Who paid what** — unchanged.

### Range semantics — one deliberate, labelled exception

The range filter defines the **focus**: tiles, insights, categories, lists and
"who paid what" all use *range ∩ person ∩ category*. The **monthly trend**
alone shows a **12-month window ending at the focus's last month**, with the
focus months emphasised and the rest in grey. Person and category filters
still apply to it in full. The chart's caption says so ("Last 12 months · this
month highlighted"). Without this, the default view's trend is one bar.

### Previous period (for every "vs" figure)

| Range | Compared with |
|---|---|
| This month | Last month **up to the same day** (a partial month against a full one would always look like a drop) |
| Last month | The month before |
| Last 3 months | The 3 months before |
| This year | Last year up to the same date |
| Custom | The same number of days immediately before |
| All time | No comparison |

## 4 · The views

### 4.1 Summary tiles
Stat-tile contract: sentence-case label, value (proportional figures), optional
delta ("▲ R420 vs last month" / "▼ …"). **Deltas are in ink, not red/green** —
spending more than last month isn't automatically bad (an annual insurance
payment), so the app doesn't moralise.

### 4.2 Insights
Deterministic sentences, at most three, in this priority:
1. **Pace / total vs previous period** — e.g. *"R4 210 so far — R380 less than
   by this day last month."*
2. **Biggest category mover** — the largest absolute change vs the previous
   period, shown only if ≥ R100 **and** ≥ 15% — e.g. *"Groceries is up R410
   (24%) on last month."*
3. **"Other" is large** — if > 30% of the focus spend: *"45% of spending is
   filed under Other — tap it to see what's there."* (Actionable, and true of
   every month in production today.)

### 4.3 Monthly trend
- **Form:** columns, one per month, **including empty months at zero**; ≤ 24px
  wide, 4px rounded top, square at the baseline.
- **Colour:** emphasis — focus months `--primary`, context months grey.
- **Average line:** a hairline at the mean of the window's non-empty months,
  labelled "avg".
- **Labels:** selective — the highest month and the selected month only.
- **Readout above the plot** (replaces hover): defaults to the latest focus
  month — *"Oct 2026 · R6 017 · 18 expenses"* — and updates on tap, drag or
  arrow keys. A **"See expenses ›"** action in the readout drills into that
  month.
- **Table twin:** "Show numbers" reveals month → total → count.

### 4.4 Spending pace
- **Form:** two cumulative lines by day of month — **this month** (accent,
  2px, end-dot) and **last month** (grey). A legend plus direct labels at the
  line ends.
- Shown only when the focus is a single calendar month ("this month" →
  compared with last month; "last month" → with the month before).
- **Scrub readout:** drag or tap along the chart — *"Day 14 · this month R3 210
  · last month R2 740"*. The current month's line stops at today.
- **Table twin:** "Show numbers" (every fifth day + the last day).

### 4.5 Categories (with small multiples)
Each parent category is one row: icon, name, amount, share bar (one hue — see
ADR-0021), change vs the previous period, and a **six-month sparkline** of that
category's monthly spend (single hue, focus month emphasised). Sorted by
amount. **Tap a row to drill into the category.**

### 4.6 Biggest expenses and Regulars
- **Biggest expenses:** top five by amount in the focus — tap opens the
  expense.
- **Regulars:** descriptions that recur (≥ 2 times), grouped by normalised
  text (lower-cased, trimmed, whitespace collapsed), top five by total —
  *"Woolworths · 8× · R2 140"*. Tap drills into those expenses.

### 4.7 Drill view

One view, driven by a **scope** — any combination of
`{ month?, parent?, sub?, regular? }` — rendered inside the Reports tab with a
breadcrumb: **Reports › Oct 2026 › Groceries › Supermarket**. Every crumb is
tappable; the back control pops one level.

The drill shows, for its scope:
- a header total, count and share of the focus, with change vs the previous
  period;
- a **trend** for the scope when it isn't pinned to one month (e.g. Groceries
  across the 12-month window);
- **subcategory bars** when the scope is a parent (tap one to narrow
  further);
- the **expense list**, grouped by date — description, who paid, amount.
  **Tap any expense to open it** (the existing expense detail), where it can
  be viewed, edited or re-categorised — which is how a user cleans up "Other".

A month in scope overrides the range preset; person and category filters
still apply.

## 5 · Data module — `src/lib/reports.ts`

Pure functions, no React, unit-tested — the Reports UI only renders their
output. Integer cents throughout (iron rule).

| Function | Returns |
|---|---|
| `focusBounds(filters, now)` / `previousBounds(filters, now)` | Inclusive ISO date ranges per the table in §3 |
| `monthSeries(expenses, endMonth, months)` | `{ key, label, total, count }[]`, **gaps filled with zero** |
| `paceSeries(expenses, month, uptoDay?)` | Cumulative cents per day of month |
| `categoryRollup(focus, previous)` | Per parent: total, share, delta, per-sub totals |
| `regulars(expenses)` | Recurring descriptions with count + total |
| `insights(...)` | Up to three sentences per §4.2 |
| `inScope(expense, scope)` | The drill predicate |

The existing `applyFilters` / `rangeBounds` (Phase 6) stay the single source
for the filter predicate, so the export keeps matching the screen.

## 6 · Colour, interaction and accessibility

Per [ADR-0021](../decisions/0021-reporting-charts.md) and the data-viz method:
one hue + emphasis; marks thin (≤ 24px columns, 2px lines, ≥ 8px end-dots
with a 2px surface ring); hairline solid gridlines; text in text tokens, never
the series colour; no dual axes; no number on every mark.

- **No hover-gating:** every chart has a readout driven by tap, drag and
  keyboard, and a "Show numbers" table twin.
- **Keyboard:** charts are focusable; ← / → move the selection; Enter drills.
- **Reduced motion:** chart entry animations obey the global guard.
- **Hit targets:** a whole month's column *band*, not just the painted bar,
  is the tap target.

## 7 · Edge cases

- **No expenses in the focus:** tiles show R0,00 with no delta; charts show an
  empty state rather than an empty axis.
- **One month of history:** the trend shows one emphasised column plus empty
  context months; pace shows only this month's line, with "No data for last
  month".
- **Deleted expenses** are already excluded by the repo.
- **Pre-existing, unchanged:** month buckets use the date part of `spentAt`,
  the same as the Phase 6 filters, so the screen and the export agree.

## 8 · Follow-up worth doing next

**[Phase 18 §5 — backfill](phase-18-learning-categorisation.md#5--retrospective-backfill).**
With 32–61% of every month in "Other", the category views are lopsided until
those rows are re-filed by the new engine. Phase 20 makes the problem visible
and lets a user fix rows one by one; §5 fixes them in bulk (fallback buckets
only, reversible — as already specced and agreed). **Effort:** S–M ·
**Credits:** ~6–15.

## 9 · Build order

1. `src/lib/reports.ts` + tests (period maths, gap-filled months, rollup with
   deltas, pace, regulars, insights, scope predicate).
2. Chart components in `src/components/charts/`: `MonthColumns`, `PaceLines`,
   `Sparkline`.
3. Rewrite the Reports overview.
4. Drill view + breadcrumb.
5. Wire "open expense" from Reports to the existing expense detail.
6. Verify (§10), document what shipped, deploy.

## 10 · Verify

- `npm test` (new `reports` tests) and `npm run build`.
- In the browser (demo data, mobile viewport):
  - default range shows a 12-month trend, focus emphasised, empty months at zero;
  - tapping a month updates the readout; "See expenses" drills; breadcrumb
    returns;
  - pace scrubbing updates its readout under **real touch events**;
  - category row → drill → subcategory → expense → expense detail opens;
  - "Show numbers" tables match the charts;
  - keyboard: focus a chart, arrow keys move, Enter drills;
  - totals in the drill equal the sum of the listed expenses.
- Screenshot each section.

## 11 · Shipped (2026-10-28)

Everything in §3–§7 is built. Code: `src/lib/reports.ts` (aggregation, 28
tests in `src/lib/__tests__/reports.test.ts`), `src/components/charts/`
(`MonthColumns`, `PaceLines`, `Sparkline`, `NumbersTable`, `scale.ts`),
`src/components/report-drill.tsx`, and `src/components/reports-tab.tsx`
(rewritten). Chart colours come from new LAYER 2 tokens (`--chart-accent`,
`--chart-context`, `--chart-line-muted`, `--chart-grid`, `--chart-wash`).

**Where the build differs from the spec — and why**
- **Trend window:** up to 12 months, but starting no earlier than the first
  month with any spending, and **never fewer than 6 columns**. A Tally with
  four months of history shows those months, not eight empty ones; a brand-new
  Tally still has context. (§7's "one month of history" case is covered by the
  6-column floor.)
- **Axis rounding** uses finer steps (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
  with the classic 1/2/5 a R28.8k peak got a R50k axis and the chart used half
  its height. The tallest mark now fills 81–96% of the plot.
- **The drill's readout** starts on the latest month that scope actually has
  spending in, not the window's end (which showed "R0 · 0 expenses" for a
  regular last bought last month).
- **The drill's back button is named for where it goes** ("Back to Eating
  out"): the expense detail opened from a drill has its own "Back", and two
  identically named controls is ambiguous for a screen reader.
- **Changing filters keeps your place in a drill** — filters scope the drill
  too, so there's no reason to throw the user back to the overview.
- **The demo seed gained ~5 months of history** (13 recurring expenses —
  Woolworths, Vida e Caffè, Uber, Eskom — with payers rotating so balances
  barely move). Without it, the demo showed no "Regulars" at all and thin
  mini-charts, so a visitor would never see half the feature.

**Verified** (demo data, 375×812, real pointer and keyboard events — not
`.click()`): the default range shows a multi-month trend with empty months at
zero; tapping, dragging and ← / → move the readout; Enter and "See expenses"
drill; category → subcategory → expense → expense detail → back returns to the
same level; breadcrumb and back step up; month → category drills; a regular's
drill; pace scrubbing, including past today; "All time" via the real filter
sheet. **At every drill level the header total equals the sum of the listed
expenses, to the cent.** "Show numbers" tables match the chart readouts. No
console errors. 429 tests pass; tsc, lint and build clean.

**Not verified here:** how it feels on a real phone (scroll vs scrub on the
charts uses `touch-action: pan-y`, which only a device can really judge).
