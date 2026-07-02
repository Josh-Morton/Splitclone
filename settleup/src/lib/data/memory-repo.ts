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
  type NewSettlementInput,
  type Repo,
  ValidationError,
} from "./repo";

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

  async updateProfile(p: Partial<Profile> & { userId: string }): Promise<Profile> {
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

  // --- recurring / activity ---
  async listRecurring(groupId: string): Promise<RecurringExpense[]> {
    return this.recurring.filter((r) => r.groupId === groupId && !r.deletedAt);
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

  return { groupId: group.id };
}
