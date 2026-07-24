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
import { autoCategory, computeSplit } from "../domain";
import type { ExpenseSplit } from "../domain";
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
  // Splitty (Phase 8) — a single in-memory session, so no cross-device realtime.
  private splitBills: {
    id: string;
    shareCode: string;
    createdBy: string;
    merchant: string | null;
    receiptTotalCents: number;
    status: "open" | "closed";
    createdAt: string;
  }[] = [];
  private splitGuests: {
    id: string;
    billId: string;
    displayName: string;
    tipPercent: number;
    lockedIn: boolean;
    isAdmin: boolean;
    joinedAt: string;
  }[] = [];
  private splitItems: {
    id: string;
    billId: string;
    name: string;
    lineTotalCents: number;
    position: number;
    claimedByGuestId: string | null;
  }[] = [];
  private splitTokens = new Map<string, string>(); // token → guestId

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

  // --- Splitty (Phase 8) ---
  // NOTE: this is a single in-memory session — the guest share link literally
  // cannot be opened on a second device in demo mode (there is no server). The
  // methods still model the real behaviour so the demo tab isn't empty and the
  // create/join/claim/lock loop works locally, same caveat as scanReceipt.
  async splittyCreateBill(
    merchant: string | null,
    receiptTotalCents: number,
    items: import("./repo").SplitBillItemInput[]
  ): Promise<{ shareCode: string; guestId: string; guestToken: string }> {
    const clean = items.filter((it) => it.name.trim() && it.lineTotalCents > 0);
    if (clean.length === 0) throw new ValidationError("A split needs at least one item");
    const billId = uuid();
    const shareCode = uuid().replace(/-/g, "").slice(0, 16);
    this.splitBills.push({
      id: billId,
      shareCode,
      createdBy: this.user.id,
      merchant: merchant?.trim() || null,
      receiptTotalCents: Math.max(0, Math.round(receiptTotalCents)),
      status: "open",
      createdAt: nowIso(),
    });
    const guestId = uuid();
    this.splitGuests.push({
      id: guestId,
      billId,
      displayName: this.user.displayName || "You",
      tipPercent: 0,
      lockedIn: false,
      isAdmin: true,
      joinedAt: nowIso(),
    });
    const guestToken = uuid();
    this.splitTokens.set(guestToken, guestId);
    clean.forEach((it, i) =>
      this.splitItems.push({
        id: uuid(),
        billId,
        name: it.name.trim(),
        lineTotalCents: Math.round(it.lineTotalCents),
        position: i,
        claimedByGuestId: null,
      })
    );
    return { shareCode, guestId, guestToken };
  }

  async splittyJoin(shareCode: string, displayName: string): Promise<{ guestId: string; guestToken: string }> {
    const name = displayName.trim().slice(0, 40);
    if (!name) throw new ValidationError("Enter your name");
    const bill = this.splitBills.find((b) => b.shareCode === shareCode);
    if (!bill) throw new ValidationError("Split not found");
    if (bill.status === "closed") throw new ValidationError("This split is closed");
    const guestId = uuid();
    this.splitGuests.push({
      id: guestId,
      billId: bill.id,
      displayName: name,
      tipPercent: 0,
      lockedIn: false,
      isAdmin: false,
      joinedAt: nowIso(),
    });
    const guestToken = uuid();
    this.splitTokens.set(guestToken, guestId);
    return { guestId, guestToken };
  }

  async splittyAdminIdentity(
    shareCode: string
  ): Promise<{ guestId: string; guestToken: string } | null> {
    const bill = this.splitBills.find((b) => b.shareCode === shareCode && b.createdBy === this.user.id);
    if (!bill) return null;
    const admin = this.splitGuests.find((g) => g.billId === bill.id && g.isAdmin);
    if (!admin) return null;
    for (const [token, guestId] of this.splitTokens) {
      if (guestId === admin.id) return { guestId: admin.id, guestToken: token };
    }
    return null;
  }

  async splittyGetBill(shareCode: string): Promise<import("./repo").SplitBill | null> {
    const bill = this.splitBills.find((b) => b.shareCode === shareCode);
    if (!bill) return null;
    return {
      billId: bill.id,
      shareCode: bill.shareCode,
      merchant: bill.merchant,
      receiptTotalCents: bill.receiptTotalCents,
      status: bill.status,
      items: this.splitItems
        .filter((it) => it.billId === bill.id)
        .sort((a, b) => a.position - b.position)
        .map((it) => ({
          id: it.id,
          name: it.name,
          lineTotalCents: it.lineTotalCents,
          claimedByGuestId: it.claimedByGuestId,
        })),
      guests: this.splitGuests
        .filter((g) => g.billId === bill.id)
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
        .map((g) => ({
          id: g.id,
          displayName: g.displayName,
          tipPercent: g.tipPercent,
          lockedIn: g.lockedIn,
          isAdmin: g.isAdmin,
        })),
    };
  }

  private splittyGuest(shareCode: string, guestToken: string) {
    const bill = this.splitBills.find((b) => b.shareCode === shareCode);
    const guestId = this.splitTokens.get(guestToken);
    const guest = this.splitGuests.find((g) => g.id === guestId && g.billId === bill?.id);
    if (!bill || !guest) throw new ValidationError("Not recognized — rejoin the split");
    return { bill, guest };
  }

  async splittyClaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void> {
    const { bill, guest } = this.splittyGuest(shareCode, guestToken);
    if (bill.status === "closed") throw new ValidationError("This split is closed");
    if (guest.lockedIn) throw new ValidationError("Unlock to change your items");
    const item = this.splitItems.find((it) => it.id === itemId && it.billId === bill.id);
    if (!item || item.claimedByGuestId !== null) throw new ValidationError("Someone already grabbed that one");
    item.claimedByGuestId = guest.id;
  }

  async splittyUnclaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void> {
    const { bill, guest } = this.splittyGuest(shareCode, guestToken);
    if (bill.status === "closed") throw new ValidationError("This split is closed");
    if (guest.lockedIn) throw new ValidationError("Unlock to change your items");
    const item = this.splitItems.find((it) => it.id === itemId && it.billId === bill.id);
    if (!item || item.claimedByGuestId !== guest.id) throw new ValidationError("That item is not yours to release");
    item.claimedByGuestId = null;
  }

  async splittySetTip(shareCode: string, guestToken: string, tipPercent: number): Promise<void> {
    const { bill, guest } = this.splittyGuest(shareCode, guestToken);
    if (bill.status === "closed") throw new ValidationError("This split is closed");
    if (guest.lockedIn) throw new ValidationError("Unlock to change your tip");
    guest.tipPercent = Math.max(0, Math.min(100, tipPercent));
  }

  async splittySetLocked(shareCode: string, guestToken: string, locked: boolean): Promise<void> {
    const { bill, guest } = this.splittyGuest(shareCode, guestToken);
    if (bill.status === "closed") throw new ValidationError("This split is closed");
    guest.lockedIn = locked;
  }

  async splittyCloseBill(shareCode: string): Promise<void> {
    const bill = this.splitBills.find((b) => b.shareCode === shareCode && b.createdBy === this.user.id);
    if (!bill) throw new ValidationError("Only the creator can close this split");
    bill.status = "closed";
  }

  async splittyListMyBills(): Promise<import("./repo").SplitBillSummary[]> {
    return this.splitBills
      .filter((b) => b.createdBy === this.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({
        shareCode: b.shareCode,
        merchant: b.merchant,
        status: b.status,
        createdAt: b.createdAt,
      }));
  }

  subscribeSplitBill(): () => void {
    return () => {};
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
 * Seed a demo household matching the prototype's "explore the demo" flow, but
 * deliberately rich: a 4-person flatshare (Josh + Thandi + Sipho + Lerato) with
 * ~2½ months of history exercising EVERY split method (equal, exact, percent,
 * shares, salary-proportional), multi-payer bills, subset splits, a payer who
 * isn't a participant, odd-cent largest-remainder cases, recurring rules
 * (monthly/weekly, salary/equal/fixed, one paused), partial + full settlements,
 * a shopping list (checked/qty/priced), and categories across all 7 parents —
 * so the whole app has something real to show on first open.
 */
export async function seedDemo(repo: MemoryRepo): Promise<{ groupId: string }> {
  const user = (await repo.getCurrentUser())!;
  await repo.updateProfile({ userId: user.id, monthlySalaryCents: 4200000, salaryVisible: true });
  const group = await repo.createGroup("Flat 4B");
  const members = await repo.listMembers(group.id);
  const josh = members[0]; // the owner (you)
  const thandi = await repo.addPlaceholderMember(group.id, "Thandi");
  const sipho = await repo.addPlaceholderMember(group.id, "Sipho");
  const lerato = await repo.addPlaceholderMember(group.id, "Lerato");
  const ALL = [josh.id, thandi.id, sipho.id, lerato.id];

  // Monthly salaries (cents) drive the proportional / "salary" splits below.
  const salaries: Record<string, number> = {
    [josh.id]: 4200000,
    [thandi.id]: 5500000,
    [sipho.id]: 3800000,
    [lerato.id]: 6100000,
  };

  // Split builders — all go through the domain functions so every expense
  // reconciles to the cent (largest-remainder), exactly like the real app.
  const eq = (total: number, ids: string[] = ALL) => computeSplit("equal", total, ids);
  const salary = (total: number, ids: string[] = ALL) =>
    computeSplit("salary", total, ids, { salaries });
  const shares = (total: number, ids: string[], w: number[]) =>
    computeSplit("shares", total, ids, { shares: Object.fromEntries(ids.map((id, i) => [id, w[i]])) });
  const percent = (total: number, ids: string[], p: number[]) =>
    computeSplit("percent", total, ids, { pct: Object.fromEntries(ids.map((id, i) => [id, p[i]])) });
  const exact = (total: number, ids: string[], amts: number[]): ExpenseSplit[] =>
    computeSplit("exact", total, ids, { exact: Object.fromEntries(ids.map((id, i) => [id, amts[i]])) });
  const pay = (memberId: string, total: number) => [{ memberId, paidCents: total }];

  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString();
  };

  // ── Bills & rent (proportional to salary — the headline edge case) ──────────
  // Rent is salary-split AND multi-payer: everyone EFTs their own salary share
  // straight to the agent, so it nets to zero on the ledger but still shows the
  // proportional maths and a 4-payer bill. (Realistic — nobody floats R25k.)
  const rentSplit = salary(2480000);
  const rentPayers = rentSplit.map((s) => ({ memberId: s.memberId, paidCents: s.shareCents }));
  await repo.createExpense({
    groupId: group.id, description: "October rent", category: "rent",
    amountCents: 2480000, spentAt: day(66), splitMethod: "salary",
    payers: rentPayers, splits: rentSplit,
    note: "Split by salary; everyone pays their own share to the agent.",
  });
  await repo.createExpense({
    groupId: group.id, description: "November rent", category: "rent",
    amountCents: 2480000, spentAt: day(35), splitMethod: "salary",
    payers: rentPayers, splits: rentSplit,
  });
  // Single-payer salary split too: Josh fronts the flat insurance, split by pay.
  await repo.createExpense({
    groupId: group.id, description: "Household contents insurance", category: "bills_insurance",
    amountCents: 96000, spentAt: day(26), splitMethod: "salary",
    payers: pay(josh.id, 96000), splits: salary(96000),
    note: "Josh paid the annual premium up front — split by salary.",
  });
  // Fibre — fixed exact shares (heavy user pays more), paid by Thandi.
  await repo.createExpense({
    groupId: group.id, description: "Vumatel fibre", category: "utilities_internet",
    amountCents: 99900, spentAt: day(33), splitMethod: "exact",
    payers: pay(thandi.id, 99900), splits: exact(99900, ALL, [30000, 30000, 9900, 30000]),
    note: "Sipho's on the cheaper cap, so he pays less.",
  });
  // Prepaid electricity — equal, paid by Sipho, odd amount (largest-remainder).
  await repo.createExpense({
    groupId: group.id, description: "Eskom prepaid electricity", category: "utilities_electricity",
    amountCents: 85001, spentAt: day(28), splitMethod: "equal",
    payers: pay(sipho.id, 85001), splits: eq(85001), // 85001/4 → 21251,21250,21250,21250
  });
  await repo.createExpense({
    groupId: group.id, description: "DSTV Premium", category: "utilities_tv",
    amountCents: 93900, spentAt: day(24), splitMethod: "percent",
    payers: pay(lerato.id, 93900), splits: percent(93900, ALL, [10, 20, 20, 50]),
    note: "Lerato watches the most sport — 50%.",
  });

  // ── Groceries & household (subset splits, multi-payer) ──────────────────────
  await repo.createExpense({
    groupId: group.id, description: "Checkers big shop", category: "groceries",
    amountCents: 214733, spentAt: day(30), splitMethod: "equal",
    payers: pay(josh.id, 214733), splits: eq(214733), // odd cents across 4
  });
  // Multi-payer: Thandi and Lerato both chipped in at the till.
  await repo.createExpense({
    groupId: group.id, description: "Woolworths month-end", category: "groceries",
    amountCents: 180000, spentAt: day(18), splitMethod: "equal",
    payers: [{ memberId: thandi.id, paidCents: 120000 }, { memberId: lerato.id, paidCents: 60000 }],
    splits: eq(180000),
  });
  await repo.createExpense({
    groupId: group.id, description: "Braai pack & wood", category: "groceries_butcher",
    amountCents: 62000, spentAt: day(20), splitMethod: "equal",
    payers: pay(sipho.id, 62000), splits: eq(62000),
  });
  // Cleaning supplies — only Josh & Thandi share the upstairs bathroom.
  await repo.createExpense({
    groupId: group.id, description: "Cleaning supplies", category: "groceries_consumables",
    amountCents: 34500, spentAt: day(15), splitMethod: "equal",
    payers: pay(josh.id, 34500), splits: eq(34500, [josh.id, thandi.id]),
  });
  await repo.createExpense({
    groupId: group.id, description: "SweepSouth deep clean", category: "household_cleaning",
    amountCents: 48000, spentAt: day(12), splitMethod: "shares",
    payers: pay(lerato.id, 48000), splits: shares(48000, ALL, [1, 1, 1, 1]),
  });

  // ── Eating out & leisure (exact itemised, shares, drinks) ───────────────────
  // Restaurant with an itemised (exact) split — everyone ate differently.
  await repo.createExpense({
    groupId: group.id, description: "Marble dinner (birthday)", category: "eatingout_restaurant",
    amountCents: 268050, spentAt: day(22), splitMethod: "exact",
    payers: pay(lerato.id, 268050), splits: exact(268050, ALL, [72050, 60000, 51000, 85000]),
    note: "Steak — R720\nFish — R600\nPasta — R510\nWine & dessert — R850",
  });
  // Bar tab — shares by how many rounds each bought.
  await repo.createExpense({
    groupId: group.id, description: "Friday drinks at the local", category: "eatingout_drinks",
    amountCents: 84000, spentAt: day(11), splitMethod: "shares",
    payers: pay(sipho.id, 84000), splits: shares(84000, ALL, [2, 1, 3, 2]),
  });
  await repo.createExpense({
    groupId: group.id, description: "Uber Eats — rainy Sunday", category: "eatingout_takeaway",
    amountCents: 41550, spentAt: day(6), splitMethod: "equal",
    payers: pay(josh.id, 41550), splits: eq(41550, [josh.id, sipho.id, lerato.id]),
  });
  await repo.createExpense({
    groupId: group.id, description: "Cinema — new release", category: "entertainment_movies",
    amountCents: 36000, spentAt: day(9), splitMethod: "equal",
    payers: pay(thandi.id, 36000), splits: eq(36000, [josh.id, thandi.id, lerato.id]),
  });

  // ── Transport & one-offs ────────────────────────────────────────────────────
  await repo.createExpense({
    groupId: group.id, description: "Petrol — airport run", category: "transport_fuel",
    amountCents: 90000, spentAt: day(8), splitMethod: "equal",
    payers: pay(lerato.id, 90000), splits: eq(90000, [thandi.id, lerato.id]),
  });
  await repo.createExpense({
    groupId: group.id, description: "Uber to the airport", category: "transport_rideshare",
    amountCents: 24567, spentAt: day(8), splitMethod: "equal",
    payers: pay(thandi.id, 24567), splits: eq(24567, [thandi.id, lerato.id]), // 12284/12283
  });
  // Payer NOT a participant: Josh covered a leaving gift he isn't charged for.
  await repo.createExpense({
    groupId: group.id, description: "Sipho's birthday gift (from the flat)", category: "leisure_hobbies",
    amountCents: 60000, spentAt: day(5), splitMethod: "equal",
    payers: pay(josh.id, 60000), splits: eq(60000, [thandi.id, lerato.id]),
    note: "Josh fronted it; Sipho of course isn't charged for his own gift.",
  });
  // Tiny amount — coffee, just two of them.
  await repo.createExpense({
    groupId: group.id, description: "Flat white x2", category: "eatingout_coffee",
    amountCents: 1100, spentAt: day(2), splitMethod: "equal",
    payers: pay(sipho.id, 1100), splits: eq(1100, [sipho.id, josh.id]),
  });
  await repo.createExpense({
    groupId: group.id, description: "Builders — new kettle & globes", category: "household_maintenance",
    amountCents: 47999, spentAt: day(4), splitMethod: "equal",
    payers: pay(josh.id, 47999), splits: eq(47999), // 12000,12000,12000,11999 (remainder)
  });

  // ── Settlements: a partial repayment, and one between two non-payers ────────
  // Sipho paid Josh back part of what he owed (partial — a balance remains).
  await repo.recordSettlement({
    groupId: group.id, fromMemberId: sipho.id, toMemberId: josh.id,
    amountCents: 25000, settledAt: day(14),
  });
  // Lerato squared up with Thandi for the airport trip (a settlement that
  // doesn't involve you at all — the ledger still tracks it).
  await repo.recordSettlement({
    groupId: group.id, fromMemberId: lerato.id, toMemberId: thandi.id,
    amountCents: 30000, settledAt: day(7),
  });

  // ── Shopping list (checked = in the cart, plus qty and estimates) ───────────
  await repo.addShoppingItem({ groupId: group.id, name: "Milk", qty: 2 });
  await repo.addShoppingItem({ groupId: group.id, name: "Brown bread" });
  await repo.addShoppingItem({ groupId: group.id, name: "Coffee beans", estPriceCents: 18000 });
  await repo.addShoppingItem({ groupId: group.id, name: "Dishwashing liquid", qty: 1, estPriceCents: 4500 });
  await repo.addShoppingItem({ groupId: group.id, name: "Eggs (18)", estPriceCents: 6500 });
  const toilet = await repo.addShoppingItem({ groupId: group.id, name: "Toilet paper (9s)", estPriceCents: 9900 });
  const bins = await repo.addShoppingItem({ groupId: group.id, name: "Bin bags" });
  await repo.setShoppingItemChecked(toilet.id, true); // already in the trolley
  await repo.setShoppingItemChecked(bins.id, true);

  // ── Recurring rules (monthly/weekly, salary/equal/fixed, one paused) ─────────
  await repo.createRecurring({
    groupId: group.id, description: "Rent", amountCents: 2480000,
    frequency: "monthly", anchor: 1, payerMemberId: josh.id,
    splitMethod: "salary", participantMemberIds: ALL,
  });
  await repo.createRecurring({
    groupId: group.id, description: "Vumatel fibre", amountCents: 99900,
    frequency: "monthly", anchor: 3, payerMemberId: thandi.id,
    splitMethod: "exact", participantMemberIds: ALL,
    fixedShares: exact(99900, ALL, [30000, 30000, 9900, 30000]),
  });
  await repo.createRecurring({
    groupId: group.id, description: "Domestic helper (weekly)", amountCents: 45000,
    frequency: "weekly", anchor: 3, payerMemberId: lerato.id,
    splitMethod: "equal", participantMemberIds: ALL,
  });
  const paused = await repo.createRecurring({
    groupId: group.id, description: "Netflix (on hold)", amountCents: 19900,
    frequency: "monthly", anchor: 20, payerMemberId: sipho.id,
    splitMethod: "equal", participantMemberIds: ALL,
  });
  await repo.setRecurringPaused(paused.id, true);

  // A demo Splitty bill so the tab isn't empty. Josh is the admin; a second
  // guest "Sam" has already claimed a couple of items and locked in.
  const bill = await repo.splittyCreateBill("Mzoli's braai", 62000, [
    { name: "Boerewors roll", lineTotalCents: 8500 },
    { name: "Lamb chops 300g", lineTotalCents: 22000 },
    { name: "Pap & chakalaka", lineTotalCents: 6500 },
    { name: "Castle Lager (1 of 2)", lineTotalCents: 4500 },
    { name: "Castle Lager (2 of 2)", lineTotalCents: 4500 },
    { name: "Savanna Dry", lineTotalCents: 5500 },
    { name: "Grilled corn", lineTotalCents: 3500 },
    { name: "Wet wipes", lineTotalCents: 2000 },
  ]);
  const samGuest = await repo.splittyJoin(bill.shareCode, "Sam");
  const seeded = await repo.splittyGetBill(bill.shareCode);
  if (seeded) {
    await repo.splittyClaimItem(bill.shareCode, samGuest.guestToken, seeded.items[3].id);
    await repo.splittyClaimItem(bill.shareCode, samGuest.guestToken, seeded.items[5].id);
    await repo.splittySetTip(bill.shareCode, samGuest.guestToken, 10);
    await repo.splittySetLocked(bill.shareCode, samGuest.guestToken, true);
  }

  return { groupId: group.id };
}
