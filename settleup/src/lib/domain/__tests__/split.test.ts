import { describe, it, expect } from "vitest";
import {
  splitEqual,
  splitWeighted,
  computeSplit,
  splitsReconcile,
  payersReconcile,
  salaryFallsBackToEqual,
} from "../split";

const sum = (splits: { shareCents: number }[]) =>
  splits.reduce((a, s) => a + s.shareCents, 0);

describe("splitEqual", () => {
  it("matches the worked example in the scope doc §7.2", () => {
    // R742.00 split 3 ways → R247.34, R247.33, R247.33
    const s = splitEqual(74200, ["a", "b", "c"]);
    expect(s.map((x) => x.shareCents)).toEqual([24734, 24733, 24733]);
    expect(sum(s)).toBe(74200);
  });
  it("splits evenly when divisible", () => {
    const s = splitEqual(10000, ["a", "b"]);
    expect(s.map((x) => x.shareCents)).toEqual([5000, 5000]);
  });
  it("is deterministic: remainder goes to the first participants in order", () => {
    const s = splitEqual(100, ["a", "b", "c"]);
    expect(s.map((x) => x.shareCents)).toEqual([34, 33, 33]);
  });
  it("always sums to total across a sweep of awkward cases", () => {
    for (let total = 1; total <= 500; total += 7) {
      for (let n = 1; n <= 5; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        expect(sum(splitEqual(total, ids))).toBe(total);
      }
    }
  });
  it("throws with no participants", () => {
    expect(() => splitEqual(100, [])).toThrow();
  });
});

describe("splitWeighted", () => {
  it("matches the 2:1 example in the scope doc §7.4", () => {
    const s = splitWeighted(30000, ["a", "b"], [2, 1]);
    expect(s.map((x) => x.shareCents)).toEqual([20000, 10000]);
  });
  it("assigns remainder cents to largest fractional part first", () => {
    // 100c split 1:1:1 → 34/33/33; ties broken by input order
    const s = splitWeighted(100, ["a", "b", "c"], [1, 1, 1]);
    expect(sum(s)).toBe(100);
    expect(s.map((x) => x.shareCents)).toEqual([34, 33, 33]);
  });
  it("falls back to equal when all weights are zero", () => {
    const s = splitWeighted(100, ["a", "b"], [0, 0]);
    expect(s.map((x) => x.shareCents)).toEqual([50, 50]);
  });
  it("records the raw weight for audit", () => {
    const s = splitWeighted(100, ["a", "b"], [3, 1]);
    expect(s[0].weight).toBe(3);
  });
  it("always sums to total for random-ish weights", () => {
    const weights = [
      [1, 3],
      [7, 11, 13],
      [40000, 20000],
      [1, 1, 1, 1, 1, 1, 1],
      [0.5, 0.25, 0.25],
    ];
    for (const w of weights) {
      for (const total of [1, 99, 100, 101, 74200, 1200001]) {
        const ids = w.map((_, i) => `m${i}`);
        expect(sum(splitWeighted(total, ids, w))).toBe(total);
      }
    }
  });
});

describe("computeSplit — salary-proportional (fair share)", () => {
  it("matches the flagship worked example in the scope doc §7.5", () => {
    // Josh R40k, partner R20k, rent R12 000 → R8 000 / R4 000
    const s = computeSplit("salary", 1200000, ["josh", "partner"], {
      salaries: { josh: 4000000, partner: 2000000 },
    });
    expect(s.find((x) => x.memberId === "josh")!.shareCents).toBe(800000);
    expect(s.find((x) => x.memberId === "partner")!.shareCents).toBe(400000);
  });
  it("falls back to equal when any salary is missing", () => {
    const s = computeSplit("salary", 1200000, ["josh", "partner"], {
      salaries: { josh: 4000000 },
    });
    expect(s.map((x) => x.shareCents)).toEqual([600000, 600000]);
    expect(salaryFallsBackToEqual(["josh", "partner"], { josh: 4000000 })).toBe(true);
    expect(
      salaryFallsBackToEqual(["josh", "partner"], { josh: 4000000, partner: 2000000 })
    ).toBe(false);
  });
});

describe("computeSplit — other methods", () => {
  it("percent splits by percentage weights", () => {
    const s = computeSplit("percent", 10000, ["a", "b"], { pct: { a: 75, b: 25 } });
    expect(s.map((x) => x.shareCents)).toEqual([7500, 2500]);
  });
  it("exact takes the entered amounts verbatim (validation is separate)", () => {
    const s = computeSplit("exact", 10000, ["a", "b"], { exact: { a: 9999, b: 1 } });
    expect(s.map((x) => x.shareCents)).toEqual([9999, 1]);
    expect(splitsReconcile(10000, s)).toBe(true);
  });
  it("defaults to equal", () => {
    const s = computeSplit("equal", 100, ["a", "b"]);
    expect(sum(s)).toBe(100);
  });
});

describe("validation helpers", () => {
  it("splitsReconcile rejects an unbalanced split", () => {
    expect(splitsReconcile(100, [{ memberId: "a", shareCents: 99 }])).toBe(false);
  });
  it("payersReconcile enforces multi-payer sums", () => {
    expect(payersReconcile(100, [{ paidCents: 60 }, { paidCents: 40 }])).toBe(true);
    expect(payersReconcile(100, [{ paidCents: 60 }, { paidCents: 41 }])).toBe(false);
  });
});
