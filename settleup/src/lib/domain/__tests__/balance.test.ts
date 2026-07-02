import { describe, it, expect } from "vitest";
import { computeBalances, simplifyDebts, balancesSumToZero } from "../balance";
import type { Expense, Settlement } from "../types";

const meta = {
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  version: 1,
  updatedBy: "u1",
  deletedAt: null,
};

function expense(partial: Partial<Expense> & Pick<Expense, "payers" | "splits" | "amountCents">): Expense {
  return {
    id: "e1",
    groupId: "g1",
    description: "test",
    category: "other",
    spentAt: "2026-07-01T00:00:00Z",
    splitMethod: "equal",
    receiptUrl: null,
    recurringId: null,
    note: null,
    createdBy: "u1",
    ...meta,
    ...partial,
  };
}

function settlement(partial: Partial<Settlement> & Pick<Settlement, "fromMemberId" | "toMemberId" | "amountCents">): Settlement {
  return {
    id: "s1",
    groupId: "g1",
    settledAt: "2026-07-01T00:00:00Z",
    ...meta,
    ...partial,
  };
}

describe("computeBalances", () => {
  it("net = paid − charged; nets sum to zero", () => {
    // Josh pays R742 groceries, split equally with partner.
    const e = expense({
      amountCents: 74200,
      payers: [{ memberId: "josh", paidCents: 74200 }],
      splits: [
        { memberId: "josh", shareCents: 37100 },
        { memberId: "partner", shareCents: 37100 },
      ],
    });
    const net = computeBalances(["josh", "partner"], [e], []);
    expect(net.josh).toBe(37100); // is owed
    expect(net.partner).toBe(-37100); // owes
    expect(balancesSumToZero(net)).toBe(true);
  });

  it("ignores soft-deleted expenses and settlements", () => {
    const e = expense({
      amountCents: 100,
      deletedAt: "2026-07-02T00:00:00Z",
      payers: [{ memberId: "josh", paidCents: 100 }],
      splits: [{ memberId: "partner", shareCents: 100 }],
    });
    const net = computeBalances(["josh", "partner"], [e], []);
    expect(net.josh).toBe(0);
    expect(net.partner).toBe(0);
  });

  it("a settlement of the owed amount clears the balance to zero", () => {
    const e = expense({
      amountCents: 74200,
      payers: [{ memberId: "josh", paidCents: 74200 }],
      splits: [
        { memberId: "josh", shareCents: 37100 },
        { memberId: "partner", shareCents: 37100 },
      ],
    });
    const s = settlement({ fromMemberId: "partner", toMemberId: "josh", amountCents: 37100 });
    const net = computeBalances(["josh", "partner"], [e], [s]);
    expect(net.josh).toBe(0);
    expect(net.partner).toBe(0);
  });

  it("handles multiple payers", () => {
    const e = expense({
      amountCents: 10000,
      payers: [
        { memberId: "josh", paidCents: 6000 },
        { memberId: "partner", paidCents: 4000 },
      ],
      splits: [
        { memberId: "josh", shareCents: 5000 },
        { memberId: "partner", shareCents: 5000 },
      ],
    });
    const net = computeBalances(["josh", "partner"], [e], []);
    expect(net.josh).toBe(1000);
    expect(net.partner).toBe(-1000);
  });
});

describe("simplifyDebts", () => {
  it("two-person case collapses to a single payment", () => {
    const tx = simplifyDebts({ josh: 37100, partner: -37100 });
    expect(tx).toEqual([
      { fromMemberId: "partner", toMemberId: "josh", amountCents: 37100 },
    ]);
  });

  it("returns no transactions when settled", () => {
    expect(simplifyDebts({ josh: 0, partner: 0 })).toEqual([]);
  });

  it("greedy largest-vs-largest for 3+ members, preserving net positions", () => {
    // a is owed 700, b owes 500, c owes 200
    const balances = { a: 700, b: -500, c: -200 };
    const tx = simplifyDebts(balances);
    expect(tx).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountCents: 500 },
      { fromMemberId: "c", toMemberId: "a", amountCents: 200 },
    ]);
    // Applying the transactions zeroes everyone.
    const after = { ...balances };
    for (const t of tx) {
      after[t.fromMemberId as keyof typeof after] += t.amountCents;
      after[t.toMemberId as keyof typeof after] -= t.amountCents;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it("tangled 4-member web settles with at most n-1 payments", () => {
    const balances = { a: 1000, b: 250, c: -750, d: -500 };
    const tx = simplifyDebts(balances);
    expect(tx.length).toBeLessThanOrEqual(3);
    const after = { ...balances };
    for (const t of tx) {
      after[t.fromMemberId as keyof typeof after] += t.amountCents;
      after[t.toMemberId as keyof typeof after] -= t.amountCents;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
});
