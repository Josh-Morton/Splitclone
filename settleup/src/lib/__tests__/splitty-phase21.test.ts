/**
 * Phase 21: rounding up to the rand, Rand tips, editing a scanned bill, and the
 * share message.
 */

import { describe, expect, it } from "vitest";
import type { SplitBill } from "../data";
import {
  editedLineCents,
  expandRows,
  groupScanItems,
  guestContributionCents,
  guestRoundingCents,
  guestTipCents,
  roundUpToRand,
  scansRemainingLabel,
  splittyShareMessage,
} from "../splitty";

function bill(tip: { percent?: number; cents?: number | null } = {}): SplitBill {
  return {
    billId: "b",
    shareCode: "abc123",
    merchant: "Mzoli's",
    receiptTotalCents: 13760,
    status: "open",
    guests: [
      {
        id: "g",
        displayName: "Thabo",
        tipPercent: tip.percent ?? 0,
        tipCents: tip.cents ?? null,
        lockedIn: false,
        isAdmin: false,
      },
    ],
    items: [
      { id: "1", name: "Wors roll", lineTotalCents: 8760, claimedByGuestId: "g" },
      { id: "2", name: "Coke", lineTotalCents: 5000, claimedByGuestId: "g" },
    ],
  };
}

describe("rounding up to the nearest rand", () => {
  it("rounds any cents up, and leaves an exact rand alone", () => {
    expect(roundUpToRand(13760)).toBe(13800);
    expect(roundUpToRand(13701)).toBe(13800);
    expect(roundUpToRand(13800)).toBe(13800);
    expect(roundUpToRand(0)).toBe(0);
  });

  it("applies to items + tip together, and reports the rounding", () => {
    const b = bill();
    expect(guestContributionCents(b, "g")).toBe(13800);
    expect(guestRoundingCents(b, "g")).toBe(40);
  });

  it("never rounds a total that's already a whole rand", () => {
    const b = bill({ cents: 240 }); // R137,60 + R2,40 = R140,00
    expect(guestContributionCents(b, "g")).toBe(14000);
    expect(guestRoundingCents(b, "g")).toBe(0);
  });
});

describe("tips", () => {
  it("a percentage tip is a share of what you claimed", () => {
    expect(guestTipCents(bill({ percent: 10 }), "g")).toBe(1376);
  });

  it("a Rand tip is exactly that amount, whatever you claimed", () => {
    const b = bill({ percent: 15, cents: 2000 });
    expect(guestTipCents(b, "g")).toBe(2000);
    expect(guestContributionCents(b, "g")).toBe(15800); // 137,60 + 20,00 = 157,60 → 158
  });

  it("a Rand tip of zero is no tip, even with an old percentage stored", () => {
    expect(guestTipCents(bill({ percent: 20, cents: 0 }), "g")).toBe(0);
  });
});

describe("editing a scanned bill", () => {
  const scanned = [
    { name: "Burger", lineTotalCents: 12900 },
    { name: "Jack Black (1 of 5)", lineTotalCents: 5000 },
    { name: "Jack Black (2 of 5)", lineTotalCents: 5000 },
    { name: "Jack Black (3 of 5)", lineTotalCents: 5000 },
    { name: "Jack Black (4 of 5)", lineTotalCents: 5000 },
    { name: "Jack Black (5 of 5)", lineTotalCents: 5000 },
    { name: "Water (1 of 3)", lineTotalCents: 334 },
    { name: "Water (2 of 3)", lineTotalCents: 333 },
    { name: "Water (3 of 3)", lineTotalCents: 333 },
  ];

  it("folds the scanner's per-unit rows back into one line with a quantity", () => {
    expect(groupScanItems(scanned)).toEqual([
      { name: "Burger", qty: 1, lineCents: 12900 },
      { name: "Jack Black", qty: 5, lineCents: 25000 },
      { name: "Water", qty: 3, lineCents: 1000 },
    ]);
  });

  it("round-trips: untouched lines expand back to exactly what was scanned", () => {
    expect(expandRows(groupScanItems(scanned))).toEqual(scanned);
  });

  it("leaves a broken or out-of-order run as separate lines", () => {
    const odd = [
      { name: "Shot (1 of 3)", lineTotalCents: 2000 },
      { name: "Shot (3 of 3)", lineTotalCents: 2000 },
      { name: "Something (2 of 2)", lineTotalCents: 900 },
    ];
    expect(groupScanItems(odd).map((l) => l.qty)).toEqual([1, 1, 1]);
  });

  it("expands an edited line cent-exactly, remainder on the first units", () => {
    const items = expandRows([{ name: "Wine", qty: 3, lineCents: 1000 }]);
    expect(items.map((i) => i.lineTotalCents)).toEqual([334, 333, 333]);
    expect(items.map((i) => i.name)).toEqual(["Wine (1 of 3)", "Wine (2 of 3)", "Wine (3 of 3)"]);
  });

  it("drops lines with no name or no price", () => {
    expect(
      expandRows([
        { name: "  ", qty: 1, lineCents: 500 },
        { name: "Chips", qty: 2, lineCents: 0 },
      ])
    ).toEqual([]);
  });

  it("keeps the scanned total while price and qty are untouched, then uses price × qty", () => {
    const s = { qty: 3, unitCents: 333, lineCents: 1000 };
    expect(editedLineCents(3, 333, s)).toBe(1000);
    expect(editedLineCents(4, 333, s)).toBe(1332);
    expect(editedLineCents(3, 400, s)).toBe(1200);
    expect(editedLineCents(2, 500, null)).toBe(1000);
  });
});

describe("the share message", () => {
  it("carries the bill link and the 'Loving Splitty?' link with its source", () => {
    const m = splittyShareMessage("https://tally.example", "abc123", "Mzoli's");
    expect(m).toContain("the Mzoli's bill");
    expect(m).toContain("1. Tap this link: https://tally.example/split/abc123");
    expect(m).toContain(
      "Loving Splitty? Save this link and you can use it too! https://tally.example/splitty?ref=abc123"
    );
  });
});

describe("the scan counter", () => {
  it("reads naturally for one, many and none", () => {
    expect(scansRemainingLabel(100)).toBe("(100 Splits remaining for today)");
    expect(scansRemainingLabel(1)).toBe("(1 Split remaining for today)");
    expect(scansRemainingLabel(-3)).toBe("(0 Splits remaining for today)");
  });
});
