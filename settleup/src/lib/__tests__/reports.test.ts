/**
 * Phase 20 — every number on the Reports screen comes from these functions,
 * so they're tested against hand-worked figures. Dates are fixed (`NOW`) so
 * the period maths can't drift with the calendar.
 */

import { describe, expect, it } from "vitest";
import type { Expense } from "../domain";
import { DEFAULT_FILTERS, type ReportFilters } from "../report-filters";
import {
  addMonths,
  averageOfNonEmpty,
  biggest,
  categoryRollup,
  inBounds,
  inScope,
  insights,
  monthSeries,
  paceSeries,
  previousBounds,
  regulars,
  summarise,
  trendWindow,
} from "../reports";

const NOW = new Date(2026, 9, 14); // 14 Oct 2026, local time

let n = 0;
function ex(day: string, rand: number, category = "groceries", description = "Shop"): Expense {
  const cents = rand * 100;
  return {
    id: `e${n++}`,
    groupId: "g",
    description,
    category,
    amountCents: cents,
    spentAt: `${day}T12:00:00.000Z`,
    splitMethod: "equal",
    payers: [{ memberId: "a", paidCents: cents }],
    splits: [{ memberId: "a", shareCents: cents }],
    receiptUrl: null,
    recurringId: null,
    note: null,
    createdBy: "u",
    originalCurrency: null,
    originalAmountCents: null,
    fxRateToZar: null,
    createdAt: `${day}T12:00:00.000Z`,
    updatedAt: `${day}T12:00:00.000Z`,
    version: 1,
    updatedBy: null,
    deletedAt: null,
  };
}
const f = (over: Partial<ReportFilters>): ReportFilters => ({ ...DEFAULT_FILTERS, categories: new Set(), ...over });

describe("previous period", () => {
  it("compares this month with last month only up to the same day", () => {
    expect(previousBounds(f({ range: "this_month" }), NOW)).toEqual({ from: "2026-09-01", to: "2026-09-14" });
  });
  it("clamps the same-day comparison to a shorter month (31 Mar -> 28 Feb)", () => {
    expect(previousBounds(f({ range: "this_month" }), new Date(2026, 2, 31))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
  it("compares last month with the month before", () => {
    expect(previousBounds(f({ range: "last_month" }), NOW)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
  it("compares the last 3 months with the 3 before", () => {
    expect(previousBounds(f({ range: "last_3_months" }), NOW)).toEqual({ from: "2026-05-01", to: "2026-07-31" });
  });
  it("compares this year with last year up to the same date", () => {
    expect(previousBounds(f({ range: "this_year" }), NOW)).toEqual({ from: "2025-01-01", to: "2025-10-14" });
  });
  it("compares a custom range with the same number of days immediately before", () => {
    expect(previousBounds(f({ range: "custom", customFrom: "2026-10-10", customTo: "2026-10-19" }), NOW)).toEqual({
      from: "2026-09-30",
      to: "2026-10-09",
    });
  });
  it("has nothing to compare 'all time' with", () => {
    expect(previousBounds(f({ range: "all" }), NOW)).toBeNull();
  });
});

describe("monthly trend", () => {
  const data = [ex("2026-07-03", 100), ex("2026-07-20", 50), ex("2026-09-02", 300), ex("2026-10-01", 80)];

  it("fills empty months with zero instead of skipping them", () => {
    const s = monthSeries(data, "2026-07", "2026-10");
    expect(s.map((p) => [p.key, p.total, p.count])).toEqual([
      ["2026-07", 15000, 2],
      ["2026-08", 0, 0], // the old chart dropped this month entirely
      ["2026-09", 30000, 1],
      ["2026-10", 8000, 1],
    ]);
  });

  it("starts the window at the first month with spending, but keeps at least 6 columns", () => {
    expect(trendWindow(data, "2026-10")).toEqual({ start: "2026-05", end: "2026-10" });
  });

  it("caps the window at 12 months of history", () => {
    const long = [ex("2024-01-05", 10), ex("2026-10-05", 10)];
    expect(trendWindow(long, "2026-10")).toEqual({ start: "2025-11", end: "2026-10" });
  });

  it("averages only months that had spending", () => {
    expect(averageOfNonEmpty(monthSeries(data, "2026-07", "2026-10"))).toBe(Math.round((15000 + 30000 + 8000) / 3));
  });

  it("shifts months across a year boundary", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });
});

describe("within-month pace", () => {
  it("is cumulative by day and stops at the given day", () => {
    const data = [ex("2026-10-01", 10), ex("2026-10-03", 5), ex("2026-10-03", 5), ex("2026-09-30", 999)];
    expect(paceSeries(data, "2026-10", 4)).toEqual([1000, 1000, 2000, 2000]);
  });
  it("covers the whole month when no end day is given", () => {
    expect(paceSeries([ex("2026-09-30", 7)], "2026-09")).toHaveLength(30);
    expect(paceSeries([ex("2026-09-30", 7)], "2026-09").at(-1)).toBe(700);
  });
});

describe("category rollup", () => {
  const focus = [ex("2026-10-02", 300, "groceries"), ex("2026-10-03", 100, "groceries_liquor"), ex("2026-10-05", 100, "other")];
  const previous = [ex("2026-09-02", 200, "groceries"), ex("2026-09-09", 400, "other")];

  it("rolls subcategories up to parents with share and change", () => {
    const rows = categoryRollup(focus, previous);
    const groceries = rows.find((r) => r.parent === "groceries")!;
    expect(groceries.total).toBe(40000);
    expect(groceries.share).toBeCloseTo(0.8);
    expect(groceries.previous).toBe(20000);
    expect(groceries.delta).toBe(20000);
    expect(groceries.subs.map((s) => [s.slug, s.total])).toEqual([
      ["groceries", 30000],
      ["groceries_liquor", 10000],
    ]);
  });
  it("sorts parents by amount and shares sum to 1", () => {
    const rows = categoryRollup(focus, previous);
    expect(rows.map((r) => r.parent)).toEqual(["groceries", "other"]);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1);
  });
  it("has no change figures without a previous period", () => {
    expect(categoryRollup(focus, null)[0].delta).toBeNull();
  });
});

describe("regulars, biggest, summary", () => {
  const data = [
    ex("2026-10-01", 120, "groceries", "Woolworths"),
    ex("2026-10-04", 80, "groceries", "woolworths "),
    ex("2026-10-09", 200, "groceries", "WOOLWORTHS"),
    ex("2026-10-10", 900, "utilities_electricity", "Eskom"),
    ex("2026-10-11", 15, "eatingout_coffee", "Vida"),
  ];
  it("groups descriptions case- and space-insensitively, only when repeated", () => {
    const r = regulars(data);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "woolworths", count: 3, total: 40000 });
  });
  it("lists the biggest expenses first", () => {
    expect(biggest(data, 2).map((e) => e.description)).toEqual(["Eskom", "WOOLWORTHS"]);
  });
  it("summarises total, count, rounded average and the biggest", () => {
    const s = summarise(data);
    expect(s.total).toBe(131500);
    expect(s.count).toBe(5);
    expect(s.average).toBe(26300);
    expect(s.biggest?.description).toBe("Eskom");
  });
});

describe("drill scope", () => {
  const e = ex("2026-10-02", 50, "groceries_liquor", "Tops liquor");
  it("matches on any combination of month, parent, subcategory and regular", () => {
    expect(inScope(e, {})).toBe(true);
    expect(inScope(e, { month: "2026-10", parent: "groceries" })).toBe(true);
    expect(inScope(e, { sub: "groceries_liquor", regular: "tops liquor" })).toBe(true);
    expect(inScope(e, { month: "2026-09" })).toBe(false);
    expect(inScope(e, { parent: "eatingout" })).toBe(false);
  });
  it("treats bounds as inclusive", () => {
    expect(inBounds(e, { from: "2026-10-02", to: "2026-10-02" })).toBe(true);
    expect(inBounds(e, { from: "2026-10-03", to: null })).toBe(false);
  });
});

describe("insights", () => {
  const label = (p: string) => ({ groceries: "Groceries", other: "Other", eatingout: "Eating out" })[p] ?? p;
  const focus = [ex("2026-10-02", 500, "groceries"), ex("2026-10-03", 400, "other")];
  const previous = [ex("2026-09-02", 200, "groceries"), ex("2026-09-03", 400, "other")];

  it("compares the total with the same point last month", () => {
    const out = insights({ range: "this_month", focus, previous, rollup: categoryRollup(focus, previous), categoryLabel: label });
    expect(out[0].text).toBe("R900 so far this month — R300 more than by this day last month.");
  });
  it("names the biggest category mover and links to it", () => {
    const out = insights({ range: "this_month", focus, previous, rollup: categoryRollup(focus, previous), categoryLabel: label });
    expect(out[1]).toEqual({ text: "Groceries is up R300 (150%) on this time last month.", scope: { parent: "groceries" } });
  });
  it("nudges when the bare Other fallback is over 30%, and links straight to it", () => {
    const out = insights({ range: "this_month", focus, previous, rollup: categoryRollup(focus, previous), categoryLabel: label });
    expect(out[2].text).toMatch(/^44% of spending is filed as “Other”/);
    expect(out[2].scope).toEqual({ parent: "other", sub: "other" });
  });
  it("ignores small movers (under R100 or under 15%)", () => {
    const f2 = [ex("2026-10-02", 250, "groceries")];
    const p2 = [ex("2026-09-02", 200, "groceries")];
    const out = insights({ range: "this_month", focus: f2, previous: p2, rollup: categoryRollup(f2, p2), categoryLabel: label });
    expect(out).toHaveLength(1); // R50 change: not worth a sentence
  });
  it("gives a monthly average for all time", () => {
    const out = insights({ range: "all", focus, previous: null, rollup: categoryRollup(focus, null), categoryLabel: label, monthsWithSpend: 3 });
    expect(out[0].text).toBe("R900 in total — about R300 a month.");
  });
  it("says so plainly when there's nothing to report", () => {
    expect(insights({ range: "this_month", focus: [], previous: [], rollup: [], categoryLabel: label })).toEqual([
      { text: "Nothing spent in this range yet." },
    ]);
  });
});
