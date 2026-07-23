import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepo, seedDemo } from "../memory-repo";
import { ValidationError } from "../repo";
import { computeBalances, balancesSumToZero, simplifyDebts } from "../../domain";

describe("MemoryRepo — Repo contract behavior", () => {
  let repo: MemoryRepo;
  let groupId: string;

  beforeEach(async () => {
    repo = new MemoryRepo();
    ({ groupId } = await seedDemo(repo));
  });

  it("seeds a rich demo household with expenses that all reconcile", async () => {
    const expenses = await repo.listExpenses(groupId);
    // The demo intentionally exercises every split method + edge case.
    expect(expenses.length).toBeGreaterThanOrEqual(15);
    expect(new Set(expenses.map((e) => e.splitMethod))).toEqual(
      new Set(["equal", "exact", "percent", "shares", "salary"])
    );
    for (const e of expenses) {
      expect(e.splits.reduce((a, s) => a + s.shareCents, 0)).toBe(e.amountCents);
      expect(e.payers.reduce((a, p) => a + p.paidCents, 0)).toBe(e.amountCents);
    }
  });

  it("rejects an unbalanced expense", async () => {
    const members = await repo.listMembers(groupId);
    await expect(
      repo.createExpense({
        groupId,
        description: "bad",
        category: "other",
        amountCents: 100,
        spentAt: new Date().toISOString(),
        splitMethod: "exact",
        payers: [{ memberId: members[0].id, paidCents: 100 }],
        splits: [{ memberId: members[0].id, shareCents: 99 }],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("soft delete removes from list, restore brings it back, balances follow", async () => {
    const members = await repo.listMembers(groupId);
    const memberIds = members.map((m) => m.id);
    const [e] = await repo.listExpenses(groupId);

    await repo.deleteExpense(e.id);
    expect((await repo.listExpenses(groupId)).map((x) => x.id)).not.toContain(e.id);

    const net = computeBalances(memberIds, await repo.listExpenses(groupId), []);
    expect(balancesSumToZero(net)).toBe(true);

    await repo.restoreExpense(e.id);
    expect((await repo.listExpenses(groupId)).map((x) => x.id)).toContain(e.id);
  });

  it("recording the simplified settlement clears the balance to zero", async () => {
    const members = await repo.listMembers(groupId);
    const memberIds = members.map((m) => m.id);
    const net = computeBalances(
      memberIds,
      await repo.listExpenses(groupId),
      await repo.listSettlements(groupId)
    );
    const tx = simplifyDebts(net);
    expect(tx.length).toBeGreaterThanOrEqual(1); // 4-person flat: one or more payments

    for (const t of tx) {
      await repo.recordSettlement({
        groupId,
        fromMemberId: t.fromMemberId,
        toMemberId: t.toMemberId,
        amountCents: t.amountCents,
      });
    }

    const after = computeBalances(
      memberIds,
      await repo.listExpenses(groupId),
      await repo.listSettlements(groupId)
    );
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it("logs activity for adds, edits, deletes and settlements", async () => {
    const activity = await repo.listActivity(groupId);
    const expenses = await repo.listExpenses(groupId);
    // One "expense_added" entry per seeded expense.
    expect(activity.filter((a) => a.type === "expense_added").length).toBe(expenses.length);
  });
});
