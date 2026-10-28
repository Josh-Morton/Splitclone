/**
 * Reporting v2 aggregation (Phase 20). Pure functions — no React, no I/O —
 * so every number on the Reports screen is unit-tested, and the UI only
 * renders what these return. Integer cents throughout (the iron rule).
 *
 * Date handling: an expense's day is the date part of `spentAt`, exactly as
 * the Phase 6 filters (`report-filters.ts`) use it, so the screen and the
 * Excel export always agree about which month an expense belongs to.
 */

import { fmtR, parentOf, type Category, type Expense, type ParentCategory } from "./domain";
import { applyFilters, rangeBounds, type RangePreset, type ReportFilters } from "./report-filters";

/** Inclusive ISO day bounds; null = unbounded on that side. */
export interface Bounds {
  from: string | null;
  to: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Parse YYYY-MM-DD as a LOCAL date (new Date("…") would read it as UTC). */
const localDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const dayOf = (e: Expense) => e.spentAt.slice(0, 10);
export const monthOf = (isoDayOrStamp: string) => isoDayOrStamp.slice(0, 7);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

/** "2026-10" shifted by n months. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function inBounds(e: Expense, b: Bounds): boolean {
  const day = dayOf(e);
  return (!b.from || day >= b.from) && (!b.to || day <= b.to);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** The focus: exactly the Phase 6 range, so export and screen match. */
export function focusBounds(f: ReportFilters, now = new Date()): Bounds {
  return rangeBounds(f, now);
}

/**
 * The period every "vs" figure compares against. "This month" compares with
 * last month UP TO THE SAME DAY — a partial month against a full one would
 * always look like a drop. Null where no comparison makes sense.
 */
export function previousBounds(f: ReportFilters, now = new Date()): Bounds | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (f.range) {
    case "this_month": {
      const lastLen = new Date(y, m, 0).getDate();
      return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m - 1, Math.min(d, lastLen))) };
    }
    case "last_month":
      return { from: isoDay(new Date(y, m - 2, 1)), to: isoDay(new Date(y, m - 1, 0)) };
    case "last_3_months":
      return { from: isoDay(new Date(y, m - 5, 1)), to: isoDay(new Date(y, m - 2, 0)) };
    case "this_year": {
      const lenLastYear = new Date(y - 1, m + 1, 0).getDate();
      return { from: `${y - 1}-01-01`, to: isoDay(new Date(y - 1, m, Math.min(d, lenLastYear))) };
    }
    case "custom": {
      if (!f.customFrom || !f.customTo) return null;
      const from = localDate(f.customFrom);
      const to = localDate(f.customTo);
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (days <= 0) return null;
      const pTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
      const pFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days);
      return { from: isoDay(pFrom), to: isoDay(pTo) };
    }
    case "all":
      return null;
  }
}

/** How the previous period is described, in a sentence and in a short form. */
export function previousLabel(range: RangePreset): { sentence: string; short: string } {
  switch (range) {
    case "this_month":
      return { sentence: "by this day last month", short: "this time last month" };
    case "last_month":
      return { sentence: "the month before", short: "the month before" };
    case "last_3_months":
      return { sentence: "the 3 months before", short: "the 3 months before" };
    case "this_year":
      return { sentence: "by this date last year", short: "this time last year" };
    case "custom":
      return { sentence: "the same number of days before", short: "the period before" };
    case "all":
      return { sentence: "", short: "" };
  }
}

/**
 * Person + category filters WITHOUT the date — so the trend window and the
 * previous period can apply their own dates over the same slice.
 */
export function withoutDate(expenses: Expense[], f: ReportFilters): Expense[] {
  return applyFilters(expenses, { ...f, range: "all" });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface Summary {
  total: number;
  count: number;
  average: number;
  biggest: Expense | null;
}

export function summarise(expenses: Expense[]): Summary {
  let total = 0;
  let biggest: Expense | null = null;
  for (const e of expenses) {
    total += e.amountCents;
    if (!biggest || e.amountCents > biggest.amountCents) biggest = e;
  }
  return {
    total,
    count: expenses.length,
    average: expenses.length ? Math.round(total / expenses.length) : 0,
    biggest,
  };
}

export const sumCents = (expenses: Expense[]) => expenses.reduce((a, e) => a + e.amountCents, 0);

// ---------------------------------------------------------------------------
// Monthly trend
// ---------------------------------------------------------------------------

export interface MonthPoint {
  key: string; // YYYY-MM
  label: string; // "Oct"
  total: number;
  count: number;
}

/**
 * One point per month from `startMonth` to `endMonth` inclusive, with months
 * that have no spending present at ZERO — the old chart skipped them, which
 * made a gap look like no gap.
 */
export function monthSeries(expenses: Expense[], startMonth: string, endMonth: string): MonthPoint[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const k = monthOf(dayOf(e));
    const t = totals.get(k) ?? { total: 0, count: 0 };
    t.total += e.amountCents;
    t.count += 1;
    totals.set(k, t);
  }
  const out: MonthPoint[] = [];
  for (let k = startMonth; k <= endMonth; k = addMonths(k, 1)) {
    const t = totals.get(k) ?? { total: 0, count: 0 };
    out.push({ key: k, label: monthLabel(k), ...t });
  }
  return out;
}

/**
 * The trend window: up to 12 months ending at `endMonth`, starting no earlier
 * than the first month this slice has any spending — but always at least
 * `minMonths` wide, so a Tally with one month of history still has context.
 */
export function trendWindow(
  expenses: Expense[],
  endMonth: string,
  maxMonths = 12,
  minMonths = 6
): { start: string; end: string } {
  let start = addMonths(endMonth, -(maxMonths - 1));
  const first = expenses.reduce<string | null>((min, e) => {
    const k = monthOf(dayOf(e));
    return !min || k < min ? k : min;
  }, null);
  if (first && first > start) start = first;
  const minStart = addMonths(endMonth, -(minMonths - 1));
  if (start > minStart) start = minStart;
  return { start, end: endMonth };
}

/** Mean of the months that had any spending (empty months would drag it to zero). */
export function averageOfNonEmpty(points: MonthPoint[]): number {
  const live = points.filter((p) => p.count > 0);
  return live.length ? Math.round(live.reduce((a, p) => a + p.total, 0) / live.length) : 0;
}

// ---------------------------------------------------------------------------
// Within-month pace
// ---------------------------------------------------------------------------

/**
 * Cumulative spend by day of month: index 0 = by the end of day 1. Stops at
 * `uptoDay` (inclusive) when given — the current month's line ends at today.
 */
export function paceSeries(expenses: Expense[], month: string, uptoDay?: number): number[] {
  const len = Math.min(daysInMonth(month), uptoDay ?? Infinity);
  const perDay = new Array<number>(daysInMonth(month)).fill(0);
  for (const e of expenses) {
    const day = dayOf(e);
    if (monthOf(day) !== month) continue;
    perDay[Number(day.slice(8, 10)) - 1] += e.amountCents;
  }
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < len; i++) {
    run += perDay[i];
    out.push(run);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryRow {
  parent: ParentCategory;
  total: number;
  /** 0–1 share of the focus total. */
  share: number;
  /** null when there's no previous period to compare with. */
  previous: number | null;
  delta: number | null;
  subs: { slug: Category; total: number; count: number }[];
  count: number;
}

export function categoryRollup(focus: Expense[], previous: Expense[] | null): CategoryRow[] {
  const total = sumCents(focus);
  const rows = new Map<ParentCategory, CategoryRow>();
  const subMaps = new Map<ParentCategory, Map<Category, { total: number; count: number }>>();
  for (const e of focus) {
    const p = parentOf(e.category);
    const row =
      rows.get(p) ?? { parent: p, total: 0, share: 0, previous: null, delta: null, subs: [], count: 0 };
    row.total += e.amountCents;
    row.count += 1;
    rows.set(p, row);
    const subs = subMaps.get(p) ?? new Map();
    const s = subs.get(e.category) ?? { total: 0, count: 0 };
    s.total += e.amountCents;
    s.count += 1;
    subs.set(e.category, s);
    subMaps.set(p, subs);
  }
  const prevByParent = new Map<ParentCategory, number>();
  for (const e of previous ?? []) {
    const p = parentOf(e.category);
    prevByParent.set(p, (prevByParent.get(p) ?? 0) + e.amountCents);
  }
  return [...rows.values()]
    .map((r) => {
      const prev = previous ? (prevByParent.get(r.parent) ?? 0) : null;
      return {
        ...r,
        share: total > 0 ? r.total / total : 0,
        previous: prev,
        delta: prev === null ? null : r.total - prev,
        subs: [...(subMaps.get(r.parent) ?? new Map()).entries()]
          .map(([slug, v]) => ({ slug, ...v }))
          .sort((a, b) => b.total - a.total),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Regulars — descriptions that keep coming back
// ---------------------------------------------------------------------------

export const normaliseDescription = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

export interface Regular {
  key: string; // normalised
  label: string; // the most common original spelling
  count: number;
  total: number;
}

export function regulars(expenses: Expense[], minCount = 2): Regular[] {
  const groups = new Map<string, { count: number; total: number; spellings: Map<string, number> }>();
  for (const e of expenses) {
    const key = normaliseDescription(e.description);
    if (!key) continue;
    const g = groups.get(key) ?? { count: 0, total: 0, spellings: new Map() };
    g.count += 1;
    g.total += e.amountCents;
    const label = e.description.trim();
    g.spellings.set(label, (g.spellings.get(label) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= minCount)
    .map(([key, g]) => ({
      key,
      label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
      total: g.total,
    }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}

export function biggest(expenses: Expense[], n = 5): Expense[] {
  return [...expenses].sort((a, b) => b.amountCents - a.amountCents).slice(0, n);
}

// ---------------------------------------------------------------------------
// Drill scope
// ---------------------------------------------------------------------------

/** What a drill view is narrowed to. Any combination; empty = everything. */
export interface DrillScope {
  month?: string; // YYYY-MM
  parent?: ParentCategory;
  sub?: Category;
  regular?: string; // normalised description
}

export function inScope(e: Expense, s: DrillScope): boolean {
  if (s.month && monthOf(dayOf(e)) !== s.month) return false;
  if (s.parent && parentOf(e.category) !== s.parent) return false;
  if (s.sub && e.category !== s.sub) return false;
  if (s.regular && normaliseDescription(e.description) !== s.regular) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Insights — the "what's interesting" sentences
// ---------------------------------------------------------------------------

export interface Insight {
  text: string;
  /** Tapping the insight drills here, when set. */
  scope?: DrillScope;
}

const RANGE_SUBJECT: Record<RangePreset, string> = {
  this_month: "so far this month",
  last_month: "last month",
  last_3_months: "over the last 3 months",
  this_year: "so far this year",
  custom: "in this period",
  all: "in total",
};

/**
 * Up to three factual sentences, in priority order (Phase 20 §4.2):
 *  1. the total vs the previous period (or the monthly average, for all time);
 *  2. the biggest category mover, if it moved by at least R100 AND 15%;
 *  3. a nudge when the bare "Other" fallback holds more than 30% of spend.
 */
export function insights(args: {
  range: RangePreset;
  focus: Expense[];
  previous: Expense[] | null;
  rollup: CategoryRow[];
  categoryLabel: (p: ParentCategory) => string;
  monthsWithSpend?: number;
}): Insight[] {
  const { range, focus, previous, rollup, categoryLabel } = args;
  const out: Insight[] = [];
  const total = sumCents(focus);
  if (focus.length === 0) return [{ text: "Nothing spent in this range yet." }];

  // 1 · total vs previous
  if (previous) {
    const prev = sumCents(previous);
    const diff = total - prev;
    const { sentence } = previousLabel(range);
    const tail =
      prev === 0
        ? `nothing had been spent ${sentence}.`
        : diff === 0
          ? `exactly the same as ${sentence}.`
          : `${fmtR(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than ${sentence}.`;
    out.push({ text: `${fmtR(total)} ${RANGE_SUBJECT[range]} — ${tail}` });
  } else if (range === "all" && args.monthsWithSpend) {
    out.push({
      text: `${fmtR(total)} in total — about ${fmtR(Math.round(total / args.monthsWithSpend))} a month.`,
    });
  } else {
    out.push({ text: `${fmtR(total)} ${RANGE_SUBJECT[range]}.` });
  }

  // 2 · biggest category mover
  if (previous) {
    const { short } = previousLabel(range);
    const movers = rollup
      .filter((r) => r.delta !== null && Math.abs(r.delta) >= 10_000)
      .filter((r) => !r.previous || Math.abs(r.delta!) / r.previous >= 0.15)
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
    const m = movers[0];
    if (m) {
      const name = categoryLabel(m.parent);
      const text = !m.previous
        ? `${name}: ${fmtR(m.total)}, with nothing ${short}.`
        : `${name} is ${m.delta! > 0 ? "up" : "down"} ${fmtR(Math.abs(m.delta!))} (${Math.round(
            (Math.abs(m.delta!) / m.previous) * 100
          )}%) on ${short}.`;
      out.push({ text, scope: { parent: m.parent } });
    }
  }

  // 3 · the "Other" fallback is large
  const fallback = focus.filter((e) => e.category === "other").reduce((a, e) => a + e.amountCents, 0);
  if (total > 0 && fallback / total > 0.3) {
    out.push({
      text: `${Math.round((fallback / total) * 100)}% of spending is filed as “Other” — tap to see what’s in there.`,
      scope: { parent: "other", sub: "other" },
    });
  }

  return out.slice(0, 3);
}
