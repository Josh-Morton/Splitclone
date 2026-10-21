/**
 * BUG-019 regression tests.
 *
 * Splitty showed "R1 376,25 of R1 225,00 claimed" on a bill that was exactly
 * fully claimed — because "covered" includes each guest's tip, but the bill
 * total is items only. Items claimed must be compared with the bill total, and
 * tips reported separately.
 */

import { describe, expect, it } from "vitest";
import type { SplitBill } from "../data";
import { claimedItemsCents, coveredCents, itemsTotalCents, tipsCents, unclaimedCents } from "../splitty";

function bill(): SplitBill {
  // R1 225,00 of items across two guests, both claimed in full; Sam tips 15%,
  // Lee tips 10%. Shaped like the "Puglia Osteria" bill in Josh's screenshot.
  return {
    billId: "b",
    shareCode: "s",
    merchant: "Puglia Osteria Cheese Bar",
    receiptTotalCents: 122500,
    status: "closed",
    guests: [
      { id: "sam", displayName: "Sam", tipPercent: 15, lockedIn: true, isAdmin: true },
      { id: "lee", displayName: "Lee", tipPercent: 10, lockedIn: true, isAdmin: false },
    ],
    items: [
      { id: "1", name: "Burrata", lineTotalCents: 52500, claimedByGuestId: "sam" },
      { id: "2", name: "Wine", lineTotalCents: 70000, claimedByGuestId: "lee" },
    ],
  };
}

describe("Splitty claimed vs total (BUG-019)", () => {
  it("never reports more claimed than the bill when items are fully claimed", () => {
    const b = bill();
    expect(claimedItemsCents(b)).toBe(b.receiptTotalCents);
    expect(unclaimedCents(b)).toBe(0);
  });

  it("reports tips separately, and items + tips = what everyone pays", () => {
    const b = bill();
    // Sam: 52 500 × 1.15 = 60 375 · Lee: 70 000 × 1.10 = 77 000
    expect(coveredCents(b)).toBe(137375);
    expect(tipsCents(b)).toBe(137375 - 122500);
    expect(claimedItemsCents(b) + tipsCents(b)).toBe(coveredCents(b));
  });

  it("counts only claimed items when the bill is partly claimed", () => {
    const b = bill();
    b.items[1].claimedByGuestId = null;
    expect(claimedItemsCents(b)).toBe(52500);
    expect(unclaimedCents(b)).toBe(70000);
    expect(claimedItemsCents(b) + unclaimedCents(b)).toBe(b.receiptTotalCents);
  });

  it("claimed + unclaimed always equals the items total, even if a stored total disagrees", () => {
    const b = bill();
    b.receiptTotalCents = 999999; // a stored total that doesn't match the items
    b.items[1].claimedByGuestId = null;
    expect(claimedItemsCents(b) + unclaimedCents(b)).toBe(itemsTotalCents(b));
    expect(itemsTotalCents(b)).toBe(122500);
  });

  it("has no tips when nobody tipped", () => {
    const b = bill();
    b.guests.forEach((g) => (g.tipPercent = 0));
    expect(tipsCents(b)).toBe(0);
    expect(coveredCents(b)).toBe(claimedItemsCents(b));
  });
});
