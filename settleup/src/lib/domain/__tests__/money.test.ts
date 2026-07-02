import { describe, it, expect } from "vitest";
import { fmt, fmtR, parseCents } from "../money";

describe("fmt (ZAR formatting)", () => {
  it("formats with space thousands and comma decimals", () => {
    expect(fmt(120000)).toBe("R1 200,00");
    expect(fmt(1234567)).toBe("R12 345,67");
    expect(fmt(123456789)).toBe("R1 234 567,89");
  });
  it("formats small and zero amounts", () => {
    expect(fmt(0)).toBe("R0,00");
    expect(fmt(5)).toBe("R0,05");
    expect(fmt(742)).toBe("R7,42");
  });
  it("formats negatives with leading minus", () => {
    expect(fmt(-6350)).toBe("-R63,50");
  });
  it("fmtR rounds to whole rands", () => {
    expect(fmtR(120050)).toBe("R1 201");
    expect(fmtR(-120049)).toBe("-R1 200");
    expect(fmtR(1200000)).toBe("R12 000");
  });
});

describe("parseCents", () => {
  it("parses plain rand amounts", () => {
    expect(parseCents("742")).toBe(74200);
    expect(parseCents("742.5")).toBe(74250);
  });
  it("treats comma as decimal separator (ZA convention)", () => {
    expect(parseCents("1 200,50")).toBe(120050);
    expect(parseCents("63,5")).toBe(6350);
  });
  it("strips currency symbols and junk", () => {
    expect(parseCents("R742.00")).toBe(74200);
  });
  it("returns 0 for garbage / empty / null", () => {
    expect(parseCents("")).toBe(0);
    expect(parseCents("abc")).toBe(0);
    expect(parseCents(null)).toBe(0);
    expect(parseCents(undefined)).toBe(0);
  });
});
