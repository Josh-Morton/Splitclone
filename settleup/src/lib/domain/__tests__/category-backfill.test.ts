import { describe, it, expect } from "vitest";
import { planRefiles, type BackfillRow } from "../category-backfill";
import { CONFIDENT_MIN_MARGIN, CONFIDENT_MIN_SCORE, isConfident, isGeneralCategory } from "../category";

let n = 0;
const row = (description: string, category: string, extra: Partial<BackfillRow> = {}): BackfillRow => ({
  table: "expense",
  id: `id-${++n}`,
  groupId: "g1",
  description,
  category,
  ...extra,
});
const one = (r: BackfillRow) => planRefiles([r]);

describe("isGeneralCategory", () => {
  it("is true for Other, each parent's catch-all, and unknown slugs", () => {
    for (const s of ["other", "bills", "utilities", "eatingout", "transport", "groceries", "household", "entertainment", "leisure", "made_up"]) {
      expect(isGeneralCategory(s), s).toBe(true);
    }
  });
  it("is false for specific subcategories, including the legacy ones that still mean something", () => {
    for (const s of ["rent", "groceries_liquor", "household_cleaning", "other_pets", "other_insurance"]) {
      expect(isGeneralCategory(s), s).toBe(false);
    }
  });
});

describe("isConfident (Phase 18 §3 thresholds)", () => {
  it("needs both the minimum score and the minimum lead", () => {
    expect(isConfident({ score: CONFIDENT_MIN_SCORE, runnerUp: CONFIDENT_MIN_SCORE - CONFIDENT_MIN_MARGIN })).toBe(true);
    expect(isConfident({ score: CONFIDENT_MIN_SCORE - 0.25, runnerUp: 0 })).toBe(false);
    expect(isConfident({ score: 3, runnerUp: 3 - CONFIDENT_MIN_MARGIN + 0.25 })).toBe(false);
  });
});

describe("planRefiles — what is never touched", () => {
  it("leaves a specific subcategory alone even when the engine now disagrees", () => {
    // The old matcher read "towel" as furniture; the new one says consumables.
    // No provenance → it may have been picked by hand → leave it (ADR-0019).
    expect(one(row("Paper towel", "household_furniture"))).toEqual([]);
  });
  it("never moves a row into Other", () => {
    expect(one(row("qwerty", "groceries"))).toEqual([]);
  });
  it("keeps Other when nothing matches", () => {
    expect(one(row("Cash", "other"))).toEqual([]);
  });
  it("never moves between two catch-all buckets", () => {
    // "stuffs" → nothing; "cleaning" alone is the Household (other) weak word.
    expect(one(row("Cleaning stuffs", "groceries"))).toEqual([]);
  });
  it("skips rows a person filed by hand", () => {
    expect(one(row("Cat litter", "other", { source: "manual" }))).toEqual([]);
  });
});

describe("planRefiles — the engine", () => {
  it("re-files Other on any match: it's what the app would file today", () => {
    expect(one(row("Cat litter 15kg", "other"))).toMatchObject([{ before: "other", after: "other_pets", reason: "engine" }]);
    expect(one(row("Table", "other"))).toMatchObject([{ after: "household_furniture" }]);
  });
  it("refines within the same parent on any match (parent totals don't move)", () => {
    expect(one(row("Beers", "groceries"))).toMatchObject([{ before: "groceries", after: "groceries_liquor" }]);
    expect(one(row("Bus to the station", "transport"))).toMatchObject([{ after: "transport_public" }]);
  });
  it("crosses parents only when confident", () => {
    expect(one(row("Monday dinner", "groceries"))).toEqual([]); // one weak word
    expect(one(row("Cat food", "groceries"))).toMatchObject([{ after: "other_pets" }]); // 3 vs 0.75
  });
});

describe("planRefiles — the household's own filing", () => {
  it("copies the Tally's specific filing of the identical description, ignoring case and spacing", () => {
    const plan = planRefiles([
      row("Ms Fixit", "household_cleaning"),
      row("ms  fixit ", "other"),
      row("Ms Fixit", "other"),
    ]);
    expect(plan).toHaveLength(2);
    expect(plan.every((p) => p.after === "household_cleaning" && p.reason === "household")).toBe(true);
  });
  it("beats the engine: the household knows its own words best", () => {
    expect(
      planRefiles([row("Cat stuff", "groceries_consumables"), row("Cat stuff", "other")])
    ).toMatchObject([{ after: "groceries_consumables", reason: "household" }]);
  });
  it("never crosses Tallies", () => {
    expect(
      planRefiles([row("Ms Fixit", "household_cleaning", { groupId: "g1" }), row("Ms Fixit", "other", { groupId: "g2" })])
    ).toEqual([]);
  });
  it("falls through to the engine when the household disagrees with itself", () => {
    expect(
      planRefiles([
        row("Cat litter", "household_cleaning"),
        row("Cat litter", "groceries_consumables"),
        row("Cat litter", "other"),
      ])
    ).toMatchObject([{ after: "other_pets", reason: "engine" }]);
  });
  it("counts hand-filed rows as evidence", () => {
    expect(
      planRefiles([row("Ms Fixit", "household_cleaning", { source: "manual" }), row("Ms Fixit", "other")])
    ).toMatchObject([{ after: "household_cleaning" }]);
  });
  it("re-files a recurring template, but a template's own category is never evidence", () => {
    const plan = planRefiles([
      row("Ms Fixit", "household_cleaning"),
      row("Ms Fixit", "other", { table: "recurring_expense" }),
    ]);
    expect(plan).toMatchObject([{ table: "recurring_expense", after: "household_cleaning" }]);

    expect(
      planRefiles([row("Ms Fixit", "household_cleaning", { table: "recurring_expense" }), row("Ms Fixit", "other")])
    ).toEqual([]);
  });
  it("ignores blank descriptions", () => {
    expect(planRefiles([row("", "household_cleaning"), row("  ", "other")])).toEqual([]);
  });
});
