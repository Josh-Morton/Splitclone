/**
 * Phase 18 §5: which legacy rows to re-file, and to what.
 *
 * Pure. `scripts/backfill-categories.ts` fetches the rows, calls
 * `planRefiles`, and does the guarded, logged write. The rules, in order
 * (phase-18 §5a, ADR-0019):
 *
 * 1. Only rows in a general bucket are candidates (`isGeneralCategory`).
 *    A specific subcategory may be someone's deliberate choice, and no
 *    provenance exists for legacy rows, so it is never touched.
 * 2. The household's own filing wins: if other expenses in the SAME Tally
 *    with the identical description are all filed under one specific
 *    subcategory, use it. Nothing crosses Tallies.
 * 3. Otherwise the engine, with a bar that rises with what the move changes:
 *    from Other, any match (what the app would file today); within the same
 *    parent, any match (parent totals don't move); across parents, only a
 *    confident one.
 * 4. Never to Other, never to the same slug, never from one general bucket
 *    to another.
 */

import {
  isConfident,
  isGeneralCategory,
  parentOf,
  scoreCategory,
  type Category,
  type CategorySource,
} from "./category";

export type BackfillTable = "expense" | "recurring_expense";

export interface BackfillRow {
  table: BackfillTable;
  id: string;
  groupId: string;
  description: string;
  category: Category;
  /** Expense provenance. Only `auto` rows are re-filed; templates are always auto. */
  source?: CategorySource;
}

export interface Refile {
  table: BackfillTable;
  id: string;
  groupId: string;
  before: Category;
  after: Category;
  /** `household`: this Tally filed the same description specifically. `engine`: `scoreCategory`. */
  reason: "household" | "engine";
}

/** Same normalisation as Reports' "Regulars": case and spacing don't matter. */
const descriptionKey = (groupId: string, description: string) =>
  `${groupId}\u0000${description.toLowerCase().trim().replace(/\s+/g, " ")}`;

export function planRefiles(rows: BackfillRow[]): Refile[] {
  // What each Tally has filed each description as, from specific expenses
  // only. Templates never donate: their category is always the engine's.
  const filed = new Map<string, Set<Category>>();
  for (const r of rows) {
    if (r.table !== "expense" || isGeneralCategory(r.category) || !r.description.trim()) continue;
    const k = descriptionKey(r.groupId, r.description);
    const set = filed.get(k) ?? new Set<Category>();
    set.add(r.category);
    filed.set(k, set);
  }

  const out: Refile[] = [];
  for (const r of rows) {
    if ((r.source ?? "auto") !== "auto" || !isGeneralCategory(r.category)) continue;
    const household = r.description.trim() ? filed.get(descriptionKey(r.groupId, r.description)) : undefined;
    if (household?.size === 1) {
      const [after] = household;
      out.push({ ...pick(r), after, reason: "household" });
      continue;
    }
    const after = engineChoice(r.category, r.description);
    if (after) out.push({ ...pick(r), after, reason: "engine" });
  }
  return out;
}

function pick(r: BackfillRow) {
  return { table: r.table, id: r.id, groupId: r.groupId, before: r.category };
}

function engineChoice(current: Category, description: string): Category | null {
  const s = scoreCategory(description);
  if (s.score === 0 || s.slug === "other" || s.slug === current) return null;
  if (current === "other") return s.slug;
  if (isGeneralCategory(s.slug)) return null;
  if (parentOf(s.slug) === parentOf(current)) return s.slug;
  return isConfident(s) ? s.slug : null;
}
