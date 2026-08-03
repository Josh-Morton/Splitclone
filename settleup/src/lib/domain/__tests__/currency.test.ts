import { describe, expect, it } from "vitest";
import {
  convertToZarCents,
  currencyMeta,
  fmtCurrency,
  orderCurrencies,
  pushRecentCurrency,
  searchCurrencies,
} from "../currency";
import { splitEqual, splitsReconcile } from "../split";

describe("currencyMeta", () => {
  it("derives the flag from the ISO country prefix", () => {
    expect(currencyMeta("ZAR").flag).toBe("🇿🇦");
    expect(currencyMeta("USD").flag).toBe("🇺🇸");
    expect(currencyMeta("THB").flag).toBe("🇹🇭");
    expect(currencyMeta("MUR").flag).toBe("🇲🇺");
  });

  it("overrides codes whose prefix is not a country", () => {
    expect(currencyMeta("EUR").flag).toBe("🇪🇺");
    expect(currencyMeta("GBP").flag).toBe("🇬🇧");
    // Multi-country currencies get no flag rather than a misleading one.
    expect(currencyMeta("XOF").flag).toBe("");
    expect(currencyMeta("XCD").flag).toBe("");
  });

  it("carries name and symbol, falling back to the code when unknown", () => {
    expect(currencyMeta("ZAR")).toMatchObject({ name: "South African Rand", symbol: "R" });
    expect(currencyMeta("AED").symbol).toBe("د.إ");
    const unknown = currencyMeta("QQQ");
    expect(unknown.name).toBe("QQQ");
    expect(unknown.symbol).toBe("QQQ");
  });

  it("is case-insensitive", () => {
    expect(currencyMeta("usd").code).toBe("USD");
  });
});

describe("orderCurrencies", () => {
  const available = ["USD", "ZAR", "THB", "GBP", "EUR"];

  it("puts recently used first, in recency order", () => {
    const out = orderCurrencies(available, ["THB", "GBP"]).map((c) => c.code);
    expect(out.slice(0, 2)).toEqual(["THB", "GBP"]);
  });

  it("pins ZAR above the rest when it is not already recent", () => {
    const out = orderCurrencies(available, ["THB"]).map((c) => c.code);
    expect(out[0]).toBe("THB");
    expect(out[1]).toBe("ZAR");
  });

  it("never duplicates a currency that is both recent and ZAR", () => {
    const out = orderCurrencies(available, ["ZAR", "USD"]).map((c) => c.code);
    expect(out.filter((c) => c === "ZAR")).toHaveLength(1);
    expect(out[0]).toBe("ZAR");
  });

  it("ignores recent codes the provider no longer quotes", () => {
    const out = orderCurrencies(available, ["XXX", "USD"]).map((c) => c.code);
    expect(out).not.toContain("XXX");
    expect(out[0]).toBe("USD");
  });

  it("sorts the remainder alphabetically by name and keeps every code", () => {
    const out = orderCurrencies(available, []).map((c) => c.code);
    expect(out[0]).toBe("ZAR");
    // Sorted by NAME, not code: British Pound, Euro, Thai Baht, US Dollar.
    expect(out.slice(1)).toEqual(["GBP", "EUR", "THB", "USD"]);
    expect(out).toHaveLength(available.length);
  });
});

describe("searchCurrencies", () => {
  const list = orderCurrencies(["USD", "ZAR", "THB"], []);

  it("matches on code or name, case-insensitively", () => {
    expect(searchCurrencies(list, "thb").map((c) => c.code)).toEqual(["THB"]);
    expect(searchCurrencies(list, "rand").map((c) => c.code)).toEqual(["ZAR"]);
    expect(searchCurrencies(list, "dollar").map((c) => c.code)).toEqual(["USD"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchCurrencies(list, "  ")).toHaveLength(3);
  });
});

describe("pushRecentCurrency", () => {
  it("moves an existing pick to the front instead of duplicating it", () => {
    expect(pushRecentCurrency(["USD", "THB", "GBP"], "THB")).toEqual(["THB", "USD", "GBP"]);
  });

  it("caps the list", () => {
    const many = ["A", "B", "C", "D", "E", "F"];
    expect(pushRecentCurrency(many, "G", 6)).toHaveLength(6);
    expect(pushRecentCurrency(many, "G", 6)[0]).toBe("G");
  });

  it("normalises case", () => {
    expect(pushRecentCurrency(["usd"], "USD")).toEqual(["USD"]);
  });
});

describe("convertToZarCents", () => {
  it("converts at the given rate, rounded to whole cents", () => {
    // $80.00 at R16.4690 = R1317.52
    expect(convertToZarCents(8000, 16.469)).toBe(131752);
  });

  it("rounds half away from zero the way Math.round does, never leaving fractions", () => {
    expect(convertToZarCents(1, 0.3522)).toBe(0);
    expect(convertToZarCents(3, 0.3522)).toBe(1);
    expect(Number.isInteger(convertToZarCents(12345, 1.23456))).toBe(true);
  });

  it("is exact for a 1:1 peg", () => {
    expect(convertToZarCents(45000, 1)).toBe(45000);
  });

  it("rejects a missing or nonsensical rate rather than silently producing 0", () => {
    expect(() => convertToZarCents(1000, 0)).toThrow();
    expect(() => convertToZarCents(1000, -2)).toThrow();
    expect(() => convertToZarCents(1000, NaN)).toThrow();
  });

  it("produces a total the existing split maths can divide exactly", () => {
    // The whole point of ADR-0017: after conversion it is just ZAR cents.
    const zar = convertToZarCents(10000, 16.469); // $100 -> R1646.90
    const splits = splitEqual(zar, ["a", "b", "c"]);
    expect(splitsReconcile(zar, splits)).toBe(true);
  });
});

describe("fmtCurrency", () => {
  it("uses the currency's own symbol and the app's comma decimal", () => {
    expect(fmtCurrency(8000, "USD")).toBe("$80,00");
    expect(fmtCurrency(125000, "THB")).toBe("฿1 250,00");
    expect(fmtCurrency(45000, "ZAR")).toBe("R450,00");
  });

  it("handles negatives and sub-unit amounts", () => {
    expect(fmtCurrency(-2550, "USD")).toBe("-$25,50");
    expect(fmtCurrency(5, "USD")).toBe("$0,05");
  });
});
