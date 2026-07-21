/**
 * Report filters (Phase 6): date range · person · category. Pure helpers so
 * the Reports tab and the Excel export apply exactly the same predicate.
 * Everything computes client-side from the already-loaded ledger.
 */

import { parentOf, type Expense, type ParentCategory } from "./domain";

export type RangePreset = "this_month" | "last_month" | "last_3_months" | "this_year" | "all" | "custom";

export interface ReportFilters {
  range: RangePreset;
  /** ISO dates (YYYY-MM-DD), used only when range === "custom". */
  customFrom: string;
  customTo: string;
  /** group_member id, or null for everyone. */
  memberId: string | null;
  /** Parent categories to include. Empty set = all. */
  categories: Set<ParentCategory>;
}

export const DEFAULT_FILTERS: ReportFilters = {
  range: "this_month",
  customFrom: "",
  customTo: "",
  memberId: null,
  categories: new Set(),
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Resolve a preset to concrete [from, to] ISO dates (inclusive). null = unbounded. */
export function rangeBounds(f: ReportFilters, now = new Date()): { from: string | null; to: string | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (f.range) {
    case "this_month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "last_3_months":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "this_year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: f.customFrom || null, to: f.customTo || null };
  }
}

export function applyFilters(expenses: Expense[], f: ReportFilters, now = new Date()): Expense[] {
  const { from, to } = rangeBounds(f, now);
  return expenses.filter((e) => {
    const day = e.spentAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (f.categories.size > 0 && !f.categories.has(parentOf(e.category))) return false;
    if (f.memberId) {
      const involved =
        e.payers.some((p) => p.memberId === f.memberId) ||
        e.splits.some((s) => s.memberId === f.memberId);
      if (!involved) return false;
    }
    return true;
  });
}

const RANGE_LABEL: Record<RangePreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
  all: "All time",
  custom: "Custom",
};

/** Short human summary for the header + export filename, e.g. "This month · Groceries · Sam". */
export function filtersLabel(
  f: ReportFilters,
  memberName: (id: string) => string,
  categoryLabel: (c: ParentCategory) => string
): string {
  const parts: string[] = [f.range === "custom" ? `${f.customFrom || "…"}–${f.customTo || "…"}` : RANGE_LABEL[f.range]];
  if (f.categories.size > 0) parts.push([...f.categories].map(categoryLabel).join("/"));
  if (f.memberId) parts.push(memberName(f.memberId));
  return parts.join(" · ");
}

export function isDefault(f: ReportFilters): boolean {
  return f.range === "this_month" && f.memberId === null && f.categories.size === 0;
}
