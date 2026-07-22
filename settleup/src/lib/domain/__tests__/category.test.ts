import { describe, it, expect } from "vitest";
import {
  autoCategory,
  categoryMeta,
  parentOf,
  CATEGORY_TREE,
  PARENT_CATEGORIES,
  SUBCATEGORIES,
} from "../category";

describe("autoCategory — grocery vocabulary (Josh: 'cheese' → groceries)", () => {
  it("maps common ingredients/items to Groceries", () => {
    for (const word of ["cheese", "chicken", "bread", "milk", "eggs", "rice", "coffee", "boerewors", "spinach"]) {
      expect(parentOf(autoCategory(word))).toBe("groceries");
    }
  });
  it("maps SA grocery retailers to Groceries", () => {
    expect(parentOf(autoCategory("Woolworths"))).toBe("groceries");
    expect(parentOf(autoCategory("Pick n Pay"))).toBe("groceries");
    expect(parentOf(autoCategory("Checkers run"))).toBe("groceries");
  });
  it("splits liquor and butcher into their subcategories", () => {
    expect(autoCategory("Tops liquor")).toBe("groceries_liquor");
    expect(autoCategory("butcher braai pack")).toBe("groceries_butcher");
  });
});

describe("autoCategory — the seven-parent taxonomy", () => {
  it("rent, utilities and subscriptions all roll into Bills & rent", () => {
    expect(parentOf(autoCategory("July rent"))).toBe("bills");
    expect(parentOf(autoCategory("prepaid electricity"))).toBe("bills");
    expect(parentOf(autoCategory("Vumatel fibre"))).toBe("bills");
    expect(parentOf(autoCategory("Vodacom airtime"))).toBe("bills");
    expect(parentOf(autoCategory("DSTV"))).toBe("bills");
    expect(parentOf(autoCategory("Netflix"))).toBe("bills");
    expect(parentOf(autoCategory("car insurance"))).toBe("bills");
    expect(parentOf(autoCategory("medical aid"))).toBe("bills");
  });
  it("movies/games/gym/travel roll into Leisure", () => {
    expect(parentOf(autoCategory("cinema movie"))).toBe("leisure");
    expect(parentOf(autoCategory("Steam game"))).toBe("leisure");
    expect(parentOf(autoCategory("Virgin Active gym"))).toBe("leisure");
    expect(parentOf(autoCategory("flight to Cape Town"))).toBe("leisure");
  });
  it("order-sensitive: 'uber eats' → takeaway before 'uber' → rideshare", () => {
    expect(autoCategory("uber eats")).toBe("eatingout_takeaway");
    expect(parentOf(autoCategory("Bolt home"))).toBe("transport");
  });
  it("falls back to other", () => {
    expect(autoCategory("mystery purchase")).toBe("other");
    expect(autoCategory("")).toBe("other");
    expect(autoCategory(null)).toBe("other");
  });
});

describe("legacy slug resolution (no migration)", () => {
  it("retired parent slugs still resolve to their new home", () => {
    expect(parentOf("rent")).toBe("bills");
    expect(parentOf("utilities")).toBe("bills");
    expect(parentOf("utilities_electricity")).toBe("bills");
    expect(parentOf("entertainment")).toBe("leisure");
    expect(parentOf("entertainment_streaming")).toBe("bills");
    expect(parentOf("other_travel")).toBe("leisure");
    expect(parentOf("other_insurance")).toBe("bills");
  });
  it("current parent slugs resolve to themselves", () => {
    for (const p of PARENT_CATEGORIES) {
      expect(parentOf(p)).toBe(p);
      expect(categoryMeta(p).parent).toBe(p);
    }
  });
});

describe("categoryMeta", () => {
  it("gives subcategory label with parent colour/icon", () => {
    const m = categoryMeta("groceries_liquor");
    expect(m.label).toBe("Liquor");
    expect(m.parentLabel).toBe("Groceries");
    expect(m.color).toBe("#7FB6F5");
  });
  it("shows electricity under Bills & rent", () => {
    const m = categoryMeta("utilities_electricity");
    expect(m.parentLabel).toBe("Bills & rent");
    expect(m.label).toBe("Electricity / prepaid");
  });
  it("degrades gracefully for an unknown slug", () => {
    const m = categoryMeta("totally_made_up");
    expect(m.parent).toBe("other");
    expect(m.label).toBe("Other");
  });
});

describe("taxonomy shape", () => {
  it("exactly seven parents", () => {
    expect(PARENT_CATEGORIES).toHaveLength(7);
  });
  it("every subcategory belongs to a known parent and is in the tree", () => {
    for (const sub of SUBCATEGORIES) {
      expect(PARENT_CATEGORIES).toContain(sub.parent);
      expect(CATEGORY_TREE[sub.parent].some((s) => s.slug === sub.slug)).toBe(true);
    }
    for (const p of PARENT_CATEGORIES) {
      expect(CATEGORY_TREE[p].length).toBeGreaterThanOrEqual(1);
    }
  });
  it("subcategory slugs are unique", () => {
    const slugs = SUBCATEGORIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
