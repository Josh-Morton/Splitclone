/**
 * In-memory Repo implementation with demo seed data.
 *
 * Purpose: (1) lets the UI be built and demoed before Supabase is wired up
 * (mirrors the prototype's "Skip — explore the demo household" flow), and
 * (2) is the reference implementation of the Repo contract's validation rules.
 *
 * The Supabase-backed implementation (supabase-repo.ts, epic E1–E5) must pass
 * the same behavior; keep them consistent.
 */

import { v4 as uuid } from "uuid";
import type {
  Activity,
  Expense,
  Group,
  GroupMember,
  Profile,
  RecurringExpense,
  Settlement,
  ShoppingItem,
  SyncMeta,
  User,
} from "../domain";
import { autoCategory } from "../domain";
import {
  type NewExpenseInput,
  type NewRecurringInput,
  type NewSettlementInput,
  type Repo,
  ValidationError,
} from "./repo";
import { firstRun } from "./supabase-repo";

/** Advance an ISO date to the next occurrence (mirrors the SQL generator). */
function advance(isoDate: string, frequency: "weekly" | "monthly", anchor: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (frequency === "weekly") {
    const next = new Date(y, m - 1, d + 7);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }
  const next = new Date(y, m, Math.max(1, Math.min(28, anchor))); // m is 0-based+1 = next month
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function meta(userId: string | null): SyncMeta {
  const t = nowIso();
  return { createdAt: t, updatedAt: t, version: 1, updatedBy: userId, deletedAt: null };
}

function touch(m: SyncMeta, userId: string | null): void {
  m.updatedAt = nowIso();
  m.version += 1;
  m.updatedBy = userId;
}

function validateExpense(input: NewExpenseInput): void {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new ValidationError("Amount must be a positive number of cents");
  }
  if (input.splits.length === 0) {
    throw new ValidationError("At least one participant is required");
  }
  const paid = input.payers.reduce((a, p) => a + p.paidCents, 0);
  if (paid !== input.amountCents) {
    throw new ValidationError(`Payers must sum to the total (paid ${paid}, total ${input.amountCents})`);
  }
  const shared = input.splits.reduce((a, s) => a + s.shareCents, 0);
  if (shared !== input.amountCents) {
    throw new ValidationError(`Splits must sum to the total (split ${shared}, total ${input.amountCents})`);
  }
}

export class MemoryRepo implements Repo {
  private user: User;
  private profiles = new Map<string, Profile>();
  private groups: Group[] = [];
  private members: GroupMember[] = [];
  private expenses: Expense[] = [];
  private settlements: Settlement[] = [];
  private shopping: ShoppingItem[] = [];
  private recurring: RecurringExpense[] = [];
  private activity: Activity[] = [];

  constructor(user?: User) {
    this.user = user ?? {
      id: "demo-user",
      email: "josh@example.com",
      displayName: "Josh",
      avatarUrl: null,
    };
  }

  // --- session / profile ---
  async getCurrentUser(): Promise<User | null> {
    return this.user;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async getSalaryShares(
    groupId: string,
    totalCents: number,
    memberIds: string[]
  ): Promise<import("../domain").ExpenseSplit[] | null> {
    this.mustGroup(groupId);
    const salaries = memberIds.map((mid) => {
      const m = this.members.find((x) => x.id === mid);
      if (!m?.userId) return 0; // placeholders have no salary
      return this.profiles.get(m.userId)?.monthlySalaryCents ?? 0;
    });
    if (salaries.some((s) => s <= 0)) return null;
    const { splitWeighted } = await import("../domain");
    return splitWeighted(totalCents, memberIds, salaries).map(({ memberId, shareCents }) => ({
      memberId,
      shareCents,
    }));
  }

  async updateProfile(
    p: Partial<Profile> & { userId: string; displayName?: string }
  ): Promise<Profile> {
    if (p.displayName !== undefined && p.userId === this.user.id) {
      this.user.displayName = p.displayName;
    }
    const existing = this.profiles.get(p.userId) ?? {
      userId: p.userId,
      monthlySalaryCents: null,
      defaultSplitMethod: null,
      defaultGroupId: null,
      salaryVisible: false,
    };
    const next = { ...existing, ...p };
    this.profiles.set(p.userId, next);
    return next;
  }

  // --- groups & members ---
  async listGroups(): Promise<Group[]> {
    return this.groups.filter((g) => !g.deletedAt && !g.archived);
  }

  async createGroup(name: string): Promise<Group> {
    const g: Group = {
      id: uuid(),
      name,
      currency: "ZAR",
      simplifyDebts: true,
      archived: false,
      createdBy: this.user.id,
      ...meta(this.user.id),
    };
    this.groups.push(g);
    this.members.push({
      id: uuid(),
      groupId: g.id,
      userId: this.user.id,
      placeholderName: null,
      role: "owner",
      status: "active",
      ...meta(this.user.id),
    });
    return g;
  }

  async renameGroup(groupId: string, name: string): Promise<Group> {
    const g = this.mustGroup(groupId);
    g.name = name;
    touch(g, this.user.id);
    return g;
  }

  async deleteGroup(groupId: string): Promise<void> {
    const g = this.groups.find((x) => x.id === groupId && !x.deletedAt);
    if (!g) return;
    g.archived = true;
    g.deletedAt = nowIso();
    touch(g, this.user.id);
  }

  async setSimplifyDebts(groupId: string, on: boolean): Promise<Group> {
    const g = this.mustGroup(groupId);
    g.simplifyDebts = on;
    touch(g, this.user.id);
    return g;
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    return this.members.filter((m) => m.groupId === groupId && !m.deletedAt && m.status !== "left");
  }

  async addPlaceholderMember(groupId: string, name: string): Promise<GroupMember> {
    this.mustGroup(groupId);
    const m: GroupMember = {
      id: uuid(),
      groupId,
      userId: null,
      placeholderName: name,
      role: "member",
      status: "active",
      ...meta(this.user.id),
    };
    this.members.push(m);
    return m;
  }

  async removeMember(memberId: string): Promise<string | null> {
    const m = this.members.find((x) => x.id === memberId && !x.deletedAt);
    if (!m) throw new ValidationError("Member not found");
    if (m.role === "owner") throw new ValidationError("The space owner cannot be removed");
    const net = this.memberNet(m.groupId, memberId);
    if (net !== 0) throw new ValidationError("Settle up with this person before removing them");
    m.status = "left";
    m.deletedAt = nowIso();
    touch(m, this.user.id);
    return m.userId;
  }

  async leaveGroup(groupId: string): Promise<void> {
    const m = this.members.find(
      (x) => x.groupId === groupId && x.userId === this.user.id && !x.deletedAt
    );
    if (!m) throw new ValidationError("You are not a member of this space");
    if (m.role === "owner") {
      throw new ValidationError("You created this space — delete it instead of leaving");
    }
    if (this.memberNet(groupId, m.id) !== 0) {
      throw new ValidationError("Settle up before leaving this space");
    }
    m.status = "left";
    m.deletedAt = nowIso();
    touch(m, this.user.id);
  }

  async notifyRemoved(): Promise<void> {
    /* demo: no email backend */
  }

  private memberNet(groupId: string, memberId: string): number {
    let net = 0;
    for (const e of this.expenses) {
      if (e.groupId !== groupId || e.deletedAt) continue;
      for (const p of e.payers) if (p.memberId === memberId) net += p.paidCents;
      for (const s of e.splits) if (s.memberId === memberId) net -= s.shareCents;
    }
    for (const s of this.settlements) {
      if (s.groupId !== groupId || s.deletedAt) continue;
      if (s.fromMemberId === memberId) net += s.amountCents;
      if (s.toMemberId === memberId) net -= s.amountCents;
    }
    return net;
  }

  // --- invites (demo: codes work within this session's memory) ---
  private invites = new Map<string, { groupId: string; upgradesMemberId: string | null }>();

  async createInvite(groupId: string, upgradesMemberId?: string | null): Promise<{ code: string }> {
    this.mustGroup(groupId);
    const code = "DEM-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    this.invites.set(code, { groupId, upgradesMemberId: upgradesMemberId ?? null });
    return { code };
  }

  async previewInvite(code: string): Promise<{ groupName: string; inviterName: string } | null> {
    const inv = this.invites.get(code.trim().toUpperCase());
    if (!inv) return null;
    const g = this.groups.find((x) => x.id === inv.groupId);
    return g ? { groupName: g.name, inviterName: this.user.displayName } : null;
  }

  async redeemInvite(code: string): Promise<{ groupId: string; groupName: string }> {
    const inv = this.invites.get(code.trim().toUpperCase());
    if (!inv) throw new ValidationError("Invalid invite code");
    const g = this.mustGroup(inv.groupId);
    const existing = this.members.find(
      (m) => m.groupId === inv.groupId && m.userId === this.user.id && !m.deletedAt
    );
    if (!existing) {
      const placeholder = inv.upgradesMemberId
        ? this.members.find((m) => m.id === inv.upgradesMemberId && !m.userId && !m.deletedAt)
        : undefined;
      if (placeholder) {
        placeholder.userId = this.user.id;
        placeholder.placeholderName = null;
        touch(placeholder, this.user.id);
      } else {
        this.members.push({
          id: uuid(),
          groupId: inv.groupId,
          userId: this.user.id,
          placeholderName: null,
          role: "member",
          status: "active",
          ...meta(this.user.id),
        });
      }
      this.log("member_joined", inv.groupId, inv.groupId);
    }
    return { groupId: g.id, groupName: g.name };
  }

  // --- expenses ---
  async listExpenses(groupId: string): Promise<Expense[]> {
    return this.expenses
      .filter((e) => e.groupId === groupId && !e.deletedAt)
      .sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  }

  async getExpense(id: string): Promise<Expense | null> {
    return this.expenses.find((e) => e.id === id) ?? null;
  }

  async createExpense(input: NewExpenseInput): Promise<Expense> {
    validateExpense(input);
    const e: Expense = {
      id: input.id ?? uuid(),
      groupId: input.groupId,
      description: input.description,
      category: input.category ?? autoCategory(input.description),
      amountCents: input.amountCents,
      spentAt: input.spentAt,
      splitMethod: input.splitMethod,
      payers: input.payers,
      splits: input.splits,
      receiptUrl: null,
      recurringId: input.recurringId ?? null,
      note: input.note ?? null,
      createdBy: this.user.id,
      ...meta(this.user.id),
    };
    this.expenses.push(e);
    this.log("expense_added", e.groupId, e.id);
    return e;
  }

  async updateExpense(id: string, input: NewExpenseInput): Promise<Expense> {
    validateExpense(input);
    const e = this.expenses.find((x) => x.id === id);
    if (!e) throw new ValidationError(`No expense ${id}`);
    Object.assign(e, {
      description: input.description,
      category: input.category ?? autoCategory(input.description),
      amountCents: input.amountCents,
      spentAt: input.spentAt,
      splitMethod: input.splitMethod,
      payers: input.payers,
      splits: input.splits,
      note: input.note ?? null,
    });
    touch(e, this.user.id);
    this.log("expense_edited", e.groupId, e.id);
    return e;
  }

  async deleteExpense(id: string): Promise<void> {
    const e = this.expenses.find((x) => x.id === id);
    if (!e) return;
    e.deletedAt = nowIso();
    touch(e, this.user.id);
    this.log("expense_deleted", e.groupId, e.id);
  }

  async restoreExpense(id: string): Promise<void> {
    const e = this.expenses.find((x) => x.id === id);
    if (!e) return;
    e.deletedAt = null;
    touch(e, this.user.id);
  }

  // --- settlements ---
  async listSettlements(groupId: string): Promise<Settlement[]> {
    return this.settlements.filter((s) => s.groupId === groupId && !s.deletedAt);
  }

  async recordSettlement(input: NewSettlementInput): Promise<Settlement> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ValidationError("Settlement amount must be positive cents");
    }
    if (input.fromMemberId === input.toMemberId) {
      throw new ValidationError("Cannot settle with yourself");
    }
    const s: Settlement = {
      id: input.id ?? uuid(),
      groupId: input.groupId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountCents: input.amountCents,
      settledAt: input.settledAt ?? nowIso(),
      ...meta(this.user.id),
    };
    this.settlements.push(s);
    this.log("settled", s.groupId, s.id);
    return s;
  }

  // --- shopping list ---
  async listShoppingItems(groupId: string): Promise<ShoppingItem[]> {
    return this.shopping.filter((i) => i.groupId === groupId && !i.deletedAt);
  }

  async addShoppingItem(
    item: Pick<ShoppingItem, "groupId" | "name"> & Partial<Pick<ShoppingItem, "qty" | "estPriceCents">>
  ): Promise<ShoppingItem> {
    const i: ShoppingItem = {
      id: uuid(),
      groupId: item.groupId,
      name: item.name,
      qty: item.qty ?? null,
      estPriceCents: item.estPriceCents ?? null,
      checked: false,
      addedBy: this.user.id,
      ...meta(this.user.id),
    };
    this.shopping.push(i);
    return i;
  }

  async setShoppingItemChecked(id: string, checked: boolean): Promise<void> {
    const i = this.shopping.find((x) => x.id === id);
    if (!i) return;
    i.checked = checked;
    touch(i, this.user.id);
  }

  async removeShoppingItem(id: string): Promise<void> {
    const i = this.shopping.find((x) => x.id === id);
    if (!i) return;
    i.deletedAt = nowIso();
    touch(i, this.user.id);
  }

  async clearCheckedShoppingItems(groupId: string): Promise<void> {
    for (const i of this.shopping) {
      if (i.groupId === groupId && i.checked && !i.deletedAt) {
        i.deletedAt = nowIso();
        touch(i, this.user.id);
      }
    }
  }

  subscribeShoppingItems(): () => void {
    return () => {}; // single-device demo: nothing to push
  }

  // --- recurring bills ---
  async listRecurring(groupId: string): Promise<RecurringExpense[]> {
    return this.recurring
      .filter((r) => r.groupId === groupId && !r.deletedAt)
      .sort((a, b) => a.nextRun.localeCompare(b.nextRun));
  }

  async createRecurring(input: NewRecurringInput): Promise<RecurringExpense> {
    this.mustGroup(input.groupId);
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ValidationError("Amount must be positive cents");
    }
    const anchor =
      input.frequency === "weekly"
        ? ((Math.round(input.anchor) % 7) + 7) % 7
        : Math.max(1, Math.min(28, Math.round(input.anchor)));
    const r: RecurringExpense = {
      id: uuid(),
      groupId: input.groupId,
      description: input.description,
      category: autoCategory(input.description),
      amountCents: input.amountCents,
      frequency: input.frequency,
      anchor,
      nextRun: firstRun(input.frequency, anchor),
      endDate: null,
      payerMemberId: input.payerMemberId,
      splitMethod: input.splitMethod,
      participantMemberIds: input.participantMemberIds,
      fixedShares: input.splitMethod === "exact" ? (input.fixedShares ?? null) : null,
      paused: false,
      ...meta(this.user.id),
    };
    this.recurring.push(r);
    return r;
  }

  async setRecurringPaused(id: string, paused: boolean): Promise<void> {
    const r = this.recurring.find((x) => x.id === id);
    if (!r) return;
    r.paused = paused;
    touch(r, this.user.id);
  }

  async deleteRecurring(id: string): Promise<void> {
    const r = this.recurring.find((x) => x.id === id);
    if (!r) return;
    r.deletedAt = nowIso();
    touch(r, this.user.id);
  }

  async runRecurringNow(id: string): Promise<void> {
    const r = this.recurring.find((x) => x.id === id && !x.deletedAt);
    if (!r) throw new ValidationError("Recurring rule not found");
    await this.generateFromRule(r, nowIso());
    r.nextRun = advance(r.nextRun, r.frequency, r.anchor);
    touch(r, this.user.id);
  }

  async processDueRecurring(groupId: string): Promise<number> {
    const today = nowIso().slice(0, 10);
    let generated = 0;
    for (const r of this.recurring) {
      if (r.groupId !== groupId || r.paused || r.deletedAt) continue;
      let guard = 0;
      while (r.nextRun <= today && guard < 24) {
        await this.generateFromRule(r, r.nextRun + "T08:00:00.000Z");
        r.nextRun = advance(r.nextRun, r.frequency, r.anchor);
        generated++;
        guard++;
      }
    }
    return generated;
  }

  private async generateFromRule(r: RecurringExpense, spentAt: string): Promise<void> {
    const { splitEqual } = await import("../domain");
    const amount = r.amountCents!;
    const live = new Set(
      this.members.filter((m) => m.groupId === r.groupId && !m.deletedAt).map((m) => m.id)
    );

    // Fixed shares reuse the locked values verbatim, but only if they still
    // reconcile (amount unchanged, no member left); otherwise fall back to
    // equal — mirrors the SQL generator.
    const fixedValid =
      r.splitMethod === "exact" &&
      r.fixedShares != null &&
      r.fixedShares.every((s) => live.has(s.memberId)) &&
      r.fixedShares.reduce((a, s) => a + s.shareCents, 0) === amount;

    const salaryShares =
      !fixedValid && r.splitMethod === "salary"
        ? await this.getSalaryShares(r.groupId, amount, r.participantMemberIds)
        : null;

    const splits = fixedValid
      ? r.fixedShares!
      : (salaryShares ?? splitEqual(amount, r.participantMemberIds));
    const splitMethod = fixedValid ? "exact" : salaryShares ? "salary" : "equal";

    await this.createExpense({
      groupId: r.groupId,
      description: r.description,
      category: r.category,
      amountCents: amount,
      spentAt,
      splitMethod,
      payers: [{ memberId: r.payerMemberId, paidCents: amount }],
      splits,
      recurringId: r.id,
    });
  }

  // --- receipts (demo: object URLs held in memory) ---
  private receipts = new Map<string, string>();

  async attachReceipt(expenseId: string, image: Blob): Promise<void> {
    const e = this.expenses.find((x) => x.id === expenseId);
    if (!e) throw new ValidationError("Expense not found");
    const old = this.receipts.get(expenseId);
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(image);
    this.receipts.set(expenseId, url);
    e.receiptUrl = `demo:${expenseId}`;
    touch(e, this.user.id);
  }

  async removeReceipt(expenseId: string): Promise<void> {
    const e = this.expenses.find((x) => x.id === expenseId);
    const old = this.receipts.get(expenseId);
    if (old) URL.revokeObjectURL(old);
    this.receipts.delete(expenseId);
    if (e) {
      e.receiptUrl = null;
      touch(e, this.user.id);
    }
  }

  async getReceiptUrl(receiptPath: string): Promise<string> {
    const url = this.receipts.get(receiptPath.replace(/^demo:/, ""));
    if (!url) throw new ValidationError("No receipt stored");
    return url;
  }

  // Demo scan: returns a canned Checkers slip so "explore the demo" can try the
  // scan → checklist → expense flow without a backend.
  async scanReceipt(): Promise<import("./repo").ScanResult> {
    await new Promise((r) => setTimeout(r, 900)); // mimic the network round-trip
    const items = [
      { name: "Milk 2L Fresh", qty: null, lineTotalCents: 3299 },
      { name: "Brown Bread", qty: null, lineTotalCents: 1799 },
      { name: "Cheddar Cheese 400g", qty: null, lineTotalCents: 8999 },
      { name: "Bananas 1kg", qty: null, lineTotalCents: 2450 },
      { name: "Free Range Eggs 6", qty: null, lineTotalCents: 4599 },
      { name: "Woolies Coffee 250g", qty: null, lineTotalCents: 12999 },
      { name: "Dishwashing Liquid", qty: null, lineTotalCents: 3299 },
    ];
    return {
      merchant: "Checkers Hyper",
      totalCents: items.reduce((a, i) => a + i.lineTotalCents, 0),
      items,
    };
  }

  async listActivity(groupId: string): Promise<Activity[]> {
    return this.activity
      .filter((a) => a.groupId === groupId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- internals ---
  private mustGroup(groupId: string): Group {
    const g = this.groups.find((x) => x.id === groupId && !x.deletedAt);
    if (!g) throw new ValidationError(`No group ${groupId}`);
    return g;
  }

  private log(type: Activity["type"], groupId: string, targetId: string): void {
    this.activity.push({
      id: uuid(),
      groupId,
      actorId: this.user.id,
      type,
      targetId,
      createdAt: nowIso(),
    });
  }
}

/**
 * Seed a demo household matching the prototype's "explore the demo" flow:
 * Josh (owner) + Sam (placeholder partner), a few expenses and shopping items.
 */
export async function seedDemo(repo: MemoryRepo): Promise<{ groupId: string }> {
  const user = (await repo.getCurrentUser())!;
  await repo.updateProfile({ userId: user.id, monthlySalaryCents: 4000000 });
  const group = await repo.createGroup("Apartment");
  const members = await repo.listMembers(group.id);
  const josh = members[0];
  const sam = await repo.addPlaceholderMember(group.id, "Sam");

  const equal = (total: number) => {
    const half = Math.floor(total / 2);
    return [
      { memberId: josh.id, shareCents: total - half },
      { memberId: sam.id, shareCents: half },
    ];
  };

  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString();
  };

  await repo.createExpense({
    groupId: group.id,
    description: "Woolworths groceries",
    category: "groceries",
    amountCents: 74200,
    spentAt: day(0),
    splitMethod: "equal",
    payers: [{ memberId: josh.id, paidCents: 74200 }],
    splits: equal(74200),
  });
  await repo.createExpense({
    groupId: group.id,
    description: "Fibre internet",
    category: "utilities",
    amountCents: 89900,
    spentAt: day(1),
    splitMethod: "equal",
    payers: [{ memberId: sam.id, paidCents: 89900 }],
    splits: equal(89900),
  });
  await repo.createExpense({
    groupId: group.id,
    description: "Uber Eats dinner",
    category: "eatingout",
    amountCents: 43550,
    spentAt: day(2),
    splitMethod: "equal",
    payers: [{ memberId: josh.id, paidCents: 43550 }],
    splits: equal(43550),
  });

  await repo.addShoppingItem({ groupId: group.id, name: "Milk", qty: 2 });
  await repo.addShoppingItem({ groupId: group.id, name: "Bread" });
  await repo.addShoppingItem({ groupId: group.id, name: "Coffee beans", estPriceCents: 18000 });

  await repo.createRecurring({
    groupId: group.id,
    description: "Rent",
    amountCents: 1200000,
    frequency: "monthly",
    anchor: 1,
    payerMemberId: josh.id,
    splitMethod: "salary",
    participantMemberIds: [josh.id, sam.id],
  });

  return { groupId: group.id };
}
