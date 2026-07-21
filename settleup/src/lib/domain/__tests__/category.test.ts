import { describe, it, expect } from "vitest";
import {
  autoCategory,
  categoryMeta,
  parentOf,
  CATEGORY_TREE,
  PARENT_CATEGORIES,
  SUBCATEGORIES,
} from "../category";

describe("autoCategory (two-level, subcategory slugs)", () => {
  it("detects SA merchants down to the subcategory", () => {
    expect(autoCategory("Woolworths groceries")).toBe("groceries");
    expect(autoCategory("Tops liquor run")).toBe("groceries_liquor");
    expect(autoCategory("Prepaid electricity")).toBe("utilities_electricity");
    expect(autoCategory("Vumatel fibre")).toBe("utilities_internet");
    expect(autoCategory("DSTV")).toBe("utilities_tv");
    expect(autoCategory("Vodacom airtime")).toBe("utilities_mobile");
    expect(autoCategory("Uber Eats dinner")).toBe("eatingout_takeaway");
    expect(autoCategory("Bolt home")).toBe("transport_rideshare");
    expect(autoCategory("Engen petrol")).toBe("transport_fuel");
    expect(autoCategory("e-toll")).toBe("transport_parking");
    expect(autoCategory("ADT armed response")).toBe("household_security");
    expect(autoCategory("Dis-Chem")).toBe("household_pharmacy");
    expect(autoCategory("Netflix")).toBe("entertainment_streaming");
    expect(autoCategory("Discovery Health medical aid")).toBe("other_medical");
  });

  it("resolves each subcategory to its parent", () => {
    expect(parentOf("groceries_liquor")).toBe("groceries");
    expect(parentOf("utilities_electricity")).toBe("utilities");
    expect(parentOf("entertainment_streaming")).toBe("entertainment");
  });

  it("keeps legacy bare parent slugs valid", () => {
    for (const p of PARENT_CATEGORIES) {
      expect(parentOf(p)).toBe(p);
      expect(categoryMeta(p).parent).toBe(p);
    }
  });

  it("order-sensitive: 'uber eats' → takeaway before 'uber' → rideshare", () => {
    expect(autoCategory("uber eats")).toBe("eatingout_takeaway");
    expect(parentOf(autoCategory("uber eats"))).toBe("eatingout");
  });

  it("falls back to other", () => {
    expect(autoCategory("mystery purchase")).toBe("other");
    expect(autoCategory("")).toBe("other");
    expect(autoCategory(null)).toBe("other");
  });
});

describe("categoryMeta", () => {
  it("gives subcategory label with parent colour/icon", () => {
    const m = categoryMeta("groceries_liquor");
    expect(m.label).toBe("Liquor");
    expect(m.parentLabel).toBe("Groceries");
    expect(m.color).toBe("#7FB6F5");
    expect(m.icon).toBe("🛒");
  });

  it("degrades gracefully for an unknown slug", () => {
    const m = categoryMeta("totally_made_up");
    expect(m.parent).toBe("other");
    expect(m.label).toBe("Other");
  });
});

describe("taxonomy shape", () => {
  it("every subcategory belongs to a known parent and tree is complete", () => {
    for (const sub of SUBCATEGORIES) {
      expect(PARENT_CATEGORIES).toContain(sub.parent);
      expect(CATEGORY_TREE[sub.parent].some((s) => s.slug === sub.slug)).toBe(true);
    }
    // Each parent has at least one subcategory (its general bucket).
    for (const p of PARENT_CATEGORIES) {
      expect(CATEGORY_TREE[p].length).toBeGreaterThanOrEqual(1);
    }
  });

  it("subcategory slugs are unique", () => {
    const slugs = SUBCATEGORIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
