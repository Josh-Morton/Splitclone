*(Part of the [Tally decision log](README.md).)*

# ADR-0021 — Reporting charts: hand-rolled SVG, one hue + emphasis, small multiples over stacks

**Status:** Accepted (2026-10-28) · **Context:** [Phase 20](../phases/phase-20-reporting-v2.md)
· **Numbering note:** ADR-0020 is reserved by [Phase 19](../phases/phase-19-category-assignments.md)
for its pending decision, so this takes 0021.

## Context

Phase 20 adds real charts to Reports — a monthly trend, a within-month
spending-pace line, per-category trends — plus drill-down into the expenses
behind every number. Three choices had to be made before any code: what draws
the charts, how they're coloured, and whether spend-by-category is shown as a
stacked chart.

## Decisions

### 1. Hand-rolled SVG components, no chart library

The charts live in `src/components/charts/` as small SVG components (columns,
line, sparkline), fed by a pure, unit-tested aggregation module
(`src/lib/reports.ts`).

- **Reliability first** (Josh's stated preference: the reliable option over
  the more complex one). Three chart shapes is a narrow, stable need; a
  general charting library brings far more surface area — and upgrade churn —
  than the problem has.
- **Weight.** This is a PWA used on phones; a charting library is a large
  bundle to add for three shapes.
- **Theming and accessibility.** Hand-rolled SVG reads the LAYER 1/2 tokens
  directly, so a reskin recolours the charts for free, and keyboard/table
  access is built in rather than bolted onto someone else's DOM.
- **Mobile interaction.** Hover tooltips don't exist on a phone. Each chart
  uses a *readout* above the plot that updates on tap, drag or keyboard
  focus — so no value is ever hover-gated.

Revisit only if the chart set grows well beyond these shapes.

### 2. Colour: one hue plus emphasis, not categorical

Every chart in Phase 20 is a **single series** — "spend" — so it takes **one
hue** (`--primary`). Where one part matters more (the months inside the
selected range, this month on the pace chart), it's shown as **emphasis**: the
accent for the focus, a neutral grey for context. Category *identity* is
carried by each category's icon and name, never by bar colour.

### 3. Small multiples instead of a stacked category chart

The obvious "detailed spending graph" is monthly columns stacked by category.
It was rejected **on measurement**, not taste. The category colour tokens,
run through the data-viz palette validator (`validate_palette.js`, light
mode) in stack order, fail three of the six checks:

| Check | Result |
|---|---|
| Normal-vision floor (≥ 15 ΔE) | **Fail** — Eating out ↔ Groceries **9.3**: two near-identical teals, hard to tell apart even with full colour vision |
| Colour-blind separation (≥ 8 ΔE) | **Fail** — Other ↔ Leisure **4.0** under deuteranopia |
| Chroma floor (C ≥ 0.10) | **Fail** — Groceries, Eating out, Transport and Other read as grey |

(Those tokens were darkened on 2026-10-21 to give category *text* AA contrast,
which is the right trade for chips and labels; it just makes them a poor
chart palette.) A seven-segment stack is also near the categorical ceiling,
and the middle segments of any stack are hard to compare across months.

Instead, each category row in Reports carries its **own tiny single-hue
trend** — small multiples — which passes every check by construction (one
hue, titled by the row) and answers the real question, "how is *this*
category trending", more directly than a stack does.

## Consequences

- No new dependency. Chart code is ours to maintain, which is acceptable at
  three shapes.
- Category bars in Reports change from per-category colours to a single hue.
  Identity is unchanged in practice (icon + name, as before).
- If a stacked or multi-series categorical chart is ever wanted, the category
  palette must be re-tuned to pass the validator first (a separate chart
  palette, or re-stepped tokens) — not shipped on eyeballed colours.
