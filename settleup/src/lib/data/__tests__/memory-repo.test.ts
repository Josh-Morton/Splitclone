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

  it("seeds a demo household with expenses that reconcile", async () => {
    const expenses = await repo.listExpenses(groupId);
    expect(expenses.length).toBe(3);
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
    expect(tx.length).toBe(1); // two-person household: single payment

    await repo.recordSettlement({
      groupId,
      fromMemberId: tx[0].fromMemberId,
      toMemberId: tx[0].toMemberId,
      amountCents: tx[0].amountCents,
    });

    const after = computeBalances(
      memberIds,
      await repo.listExpenses(groupId),
      await repo.listSettlements(groupId)
    );
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it("logs activity for adds, edits, deletes and settlements", async () => {
    const activity = await repo.listActivity(groupId);
    expect(activity.filter((a) => a.type === "expense_added").length).toBe(3);
  });
});
