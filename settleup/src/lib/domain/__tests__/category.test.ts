import { describe, it, expect } from "vitest";
import { autoCategory } from "../category";

describe("autoCategory", () => {
  it("detects South African merchants and terms", () => {
    expect(autoCategory("Woolworths groceries")).toBe("groceries");
    expect(autoCategory("Checkers run")).toBe("groceries");
    expect(autoCategory("Pick n Pay")).toBe("groceries");
    expect(autoCategory("July rent")).toBe("rent");
    expect(autoCategory("Prepaid electricity")).toBe("utilities");
    expect(autoCategory("Fibre for the month")).toBe("utilities");
    expect(autoCategory("Uber Eats dinner")).toBe("eatingout");
    expect(autoCategory("Bolt to work")).toBe("transport");
    expect(autoCategory("Petrol")).toBe("transport");
    expect(autoCategory("Gym membership")).toBe("household");
    expect(autoCategory("Netflix")).toBe("entertainment");
  });

  it("earlier categories win when keywords overlap (map order matters)", () => {
    // "uber eats" contains "uber" (transport) but eatingout is checked first.
    expect(autoCategory("uber eats")).toBe("eatingout");
  });

  it("falls back to other", () => {
    expect(autoCategory("mystery purchase")).toBe("other");
    expect(autoCategory("")).toBe("other");
    expect(autoCategory(null)).toBe("other");
  });
});
