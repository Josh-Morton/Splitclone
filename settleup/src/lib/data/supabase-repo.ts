/**
 * Supabase-backed Repo implementation (Phase 1, online-first).
 *
 * Must behave identically to MemoryRepo (the reference implementation) — same
 * validation, same soft-delete semantics. All access is via the anon key and
 * constrained by RLS; multi-row expense writes go through the create_expense /
 * update_expense RPCs so the database's deferred reconciliation triggers see
 * the complete set atomically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuid } from "uuid";
import type {
  Activity,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  Profile,
  RecurringExpense,
  Settlement,
  ShoppingItem,
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

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** First occurrence of day-of-month `day` that is today or later (ISO date). */
export function nextMonthlyRun(day: number, from = new Date()): string {
  const d = Math.max(1, Math.min(28, Math.round(day)));
  const candidate = new Date(from.getFullYear(), from.getMonth(), d);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
  return toIso(candidate);
}

/** Next date that is weekday `dow` (0 Sun–6 Sat), today or later (ISO date). */
export function nextWeeklyRun(dow: number, from = new Date()): string {
  const target = ((Math.round(dow) % 7) + 7) % 7;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const delta = (target - today.getDay() + 7) % 7;
  today.setDate(today.getDate() + delta);
  return toIso(today);
}

/** First run date for a new rule from its frequency + anchor. */
export function firstRun(frequency: "weekly" | "monthly", anchor: number, from = new Date()): string {
  return frequency === "weekly" ? nextWeeklyRun(anchor, from) : nextMonthlyRun(anchor, from);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- row mapping from PostgREST */

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

function syncMeta(row: any) {
  return {
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version ?? 1),
    updatedBy: row.updated_by ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

function mapGroup(row: any): Group {
  return {
    id: row.id,
    name: row.name,
    currency: "ZAR",
    simplifyDebts: row.simplify_debts,
    archived: row.archived,
    createdBy: row.created_by,
    ...syncMeta(row),
  };
}

function mapMember(row: any): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    placeholderName: row.placeholder_name,
    role: row.role,
    status: row.status,
    ...syncMeta(row),
  };
}

function mapExpense(row: any): Expense {
  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    category: row.category,
    amountCents: Number(row.amount_cents),
    spentAt: row.spent_at,
    splitMethod: row.split_method,
    payers: (row.expense_payer ?? []).map((p: any) => ({
      memberId: p.member_id,
      paidCents: Number(p.paid_cents),
    })),
    splits: (row.expense_split ?? []).map((s: any) => ({
      memberId: s.member_id,
      shareCents: Number(s.share_cents),
      weight: s.weight != null ? Number(s.weight) : undefined,
    })),
    receiptUrl: row.receipt_url,
    recurringId: row.recurring_id,
    note: row.note,
    createdBy: row.created_by,
    ...syncMeta(row),
  };
}

function mapSettlement(row: any): Settlement {
  return {
    id: row.id,
    groupId: row.group_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountCents: Number(row.amount_cents),
    settledAt: row.settled_at,
    ...syncMeta(row),
  };
}

const EXPENSE_SELECT = "*, expense_payer(*), expense_split(*)";

/** Short shareable code like "KWM-4T2Q" — unambiguous alphabet (no 0/O/1/I). */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `${pick(3)}-${pick(4)}`;
}

export class SupabaseRepo implements Repo {
  constructor(private sb: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data, error } = await this.sb.auth.getUser();
    if (error || !data.user) throw new ValidationError("Not signed in");
    return data.user.id;
  }

  private fail(error: { message: string } | null): never {
    throw new ValidationError(error?.message ?? "Unknown Supabase error");
  }

  // --- session / profile ---
  async getCurrentUser(): Promise<User | null> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return null;
    const { data: prof } = await this.sb
      .from("profile")
      .select("display_name, avatar_url")
      .eq("user_id", data.user.id)
      .maybeSingle();
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      displayName: prof?.display_name ?? "",
      avatarUrl: prof?.avatar_url ?? null,
    };
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.sb
      .from("profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) this.fail(error);
    if (!data) return null;
    return {
      userId: data.user_id,
      monthlySalaryCents: data.monthly_salary_cents != null ? Number(data.monthly_salary_cents) : null,
      defaultSplitMethod: data.default_split_method,
      defaultGroupId: data.default_group_id,
      salaryVisible: data.salary_visible,
    };
  }

  async updateProfile(p: Partial<Profile> & { userId: string; displayName?: string }): Promise<Profile> {
    const patch: Record<string, unknown> = {};
    if ("monthlySalaryCents" in p) patch.monthly_salary_cents = p.monthlySalaryCents;
    if ("defaultSplitMethod" in p) patch.default_split_method = p.defaultSplitMethod;
    if ("defaultGroupId" in p) patch.default_group_id = p.defaultGroupId;
    if ("salaryVisible" in p) patch.salary_visible = p.salaryVisible;
    if ("displayName" in p) patch.display_name = p.displayName;
    const { error } = await this.sb.from("profile").update(patch).eq("user_id", p.userId);
    if (error) this.fail(error);
    return (await this.getProfile(p.userId))!;
  }

  // --- groups & members ---
  async listGroups(): Promise<Group[]> {
    const { data, error } = await this.sb
      .from("group")
      .select("*")
      .is("deleted_at", null)
      .eq("archived", false)
      .order("created_at");
    if (error) this.fail(error);
    return (data ?? []).map(mapGroup);
  }

  async createGroup(name: string): Promise<Group> {
    const userId = await this.uid();
    const groupId = uuid();
    const { data, error } = await this.sb
      .from("group")
      .insert({ id: groupId, name, created_by: userId, updated_by: userId })
      .select()
      .single();
    if (error) this.fail(error);
    const { error: mErr } = await this.sb.from("group_member").insert({
      id: uuid(),
      group_id: groupId,
      user_id: userId,
      role: "owner",
      status: "active",
      updated_by: userId,
    });
    if (mErr) this.fail(mErr);
    return mapGroup(data);
  }

  async renameGroup(groupId: string, name: string): Promise<Group> {
    const { data, error } = await this.sb
      .from("group")
      .update({ name })
      .eq("id", groupId)
      .select()
      .single();
    if (error) this.fail(error);
    return mapGroup(data);
  }

  async setSimplifyDebts(groupId: string, on: boolean): Promise<Group> {
    const { data, error } = await this.sb
      .from("group")
      .update({ simplify_debts: on })
      .eq("id", groupId)
      .select()
      .single();
    if (error) this.fail(error);
    return mapGroup(data);
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await this.sb
      .from("group_member")
      .select("*")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .neq("status", "left")
      .order("created_at");
    if (error) this.fail(error);
    const members = (data ?? []).map(mapMember);
    // Hydrate real users' display names from the salary-stripped public view.
    const userIds = members.map((m) => m.userId).filter((x): x is string => Boolean(x));
    if (userIds.length > 0) {
      const { data: profs } = await this.sb
        .from("profile_public")
        .select("user_id, display_name")
        .in("user_id", userIds);
      const names = new Map((profs ?? []).map((p: any) => [p.user_id, p.display_name]));
      for (const m of members) {
        if (m.userId) m.profileName = names.get(m.userId) || null;
      }
    }
    return members;
  }

  async getSalaryShares(
    groupId: string,
    totalCents: number,
    memberIds: string[]
  ): Promise<ExpenseSplit[] | null> {
    const { data, error } = await this.sb.rpc("salary_split_shares", {
      p_group_id: groupId,
      p_total: totalCents,
      p_member_ids: memberIds,
    });
    if (error) this.fail(error);
    const rows: any[] = data ?? [];
    if (rows.length === 0 || rows.some((r) => !r.has_salary)) return null;
    return rows.map((r) => ({ memberId: r.member_id, shareCents: Number(r.share_cents) }));
  }

  async addPlaceholderMember(groupId: string, name: string): Promise<GroupMember> {
    const userId = await this.uid();
    const { data, error } = await this.sb
      .from("group_member")
      .insert({
        id: uuid(),
        group_id: groupId,
        user_id: null,
        placeholder_name: name,
        role: "member",
        status: "active",
        updated_by: userId,
      })
      .select()
      .single();
    if (error) this.fail(error);
    return mapMember(data);
  }

  // --- invites ---
  async createInvite(groupId: string, upgradesMemberId?: string | null): Promise<{ code: string }> {
    const userId = await this.uid();
    const code = generateInviteCode();
    const { error } = await this.sb.from("invite").insert({
      code,
      group_id: groupId,
      created_by: userId,
      upgrades_member_id: upgradesMemberId ?? null,
    });
    if (error) this.fail(error);
    return { code };
  }

  async previewInvite(code: string): Promise<{ groupName: string; inviterName: string } | null> {
    const { data, error } = await this.sb.rpc("invite_preview", { p_code: code });
    if (error) this.fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { groupName: row.group_name, inviterName: row.inviter_name };
  }

  async redeemInvite(code: string): Promise<{ groupId: string; groupName: string }> {
    const { data, error } = await this.sb.rpc("redeem_invite", { p_code: code });
    if (error) this.fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new ValidationError("Invalid invite code");
    return { groupId: row.group_id, groupName: row.group_name };
  }

  // --- expenses ---
  async listExpenses(groupId: string): Promise<Expense[]> {
    const { data, error } = await this.sb
      .from("expense")
      .select(EXPENSE_SELECT)
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("spent_at", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []).map(mapExpense);
  }

  async getExpense(id: string): Promise<Expense | null> {
    const { data, error } = await this.sb
      .from("expense")
      .select(EXPENSE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) this.fail(error);
    return data ? mapExpense(data) : null;
  }

  async createExpense(input: NewExpenseInput): Promise<Expense> {
    validateExpense(input);
    const { data, error } = await this.sb.rpc("create_expense", {
      p_expense: {
        id: input.id ?? uuid(),
        group_id: input.groupId,
        description: input.description,
        category: input.category ?? autoCategory(input.description),
        amount_cents: input.amountCents,
        spent_at: input.spentAt,
        split_method: input.splitMethod,
        note: input.note ?? null,
        recurring_id: input.recurringId ?? null,
      },
      p_payers: input.payers.map((p) => ({ member_id: p.memberId, paid_cents: p.paidCents })),
      p_splits: input.splits.map((s) => ({
        member_id: s.memberId,
        share_cents: s.shareCents,
        weight: s.weight ?? null,
      })),
    });
    if (error) this.fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    return (await this.getExpense(row.id))!;
  }

  async updateExpense(id: string, input: NewExpenseInput): Promise<Expense> {
    validateExpense(input);
    const { error } = await this.sb.rpc("update_expense", {
      p_id: id,
      p_expense: {
        description: input.description,
        category: input.category ?? autoCategory(input.description),
        amount_cents: input.amountCents,
        spent_at: input.spentAt,
        split_method: input.splitMethod,
        note: input.note ?? null,
      },
      p_payers: input.payers.map((p) => ({ member_id: p.memberId, paid_cents: p.paidCents })),
      p_splits: input.splits.map((s) => ({
        member_id: s.memberId,
        share_cents: s.shareCents,
        weight: s.weight ?? null,
      })),
    });
    if (error) this.fail(error);
    return (await this.getExpense(id))!;
  }

  async deleteExpense(id: string): Promise<void> {
    const { error } = await this.sb
      .from("expense")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail(error);
  }

  async restoreExpense(id: string): Promise<void> {
    const { error } = await this.sb.from("expense").update({ deleted_at: null }).eq("id", id);
    if (error) this.fail(error);
  }

  // --- settlements ---
  async listSettlements(groupId: string): Promise<Settlement[]> {
    const { data, error } = await this.sb
      .from("settlement")
      .select("*")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("settled_at", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []).map(mapSettlement);
  }

  async recordSettlement(input: NewSettlementInput): Promise<Settlement> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ValidationError("Settlement amount must be positive cents");
    }
    if (input.fromMemberId === input.toMemberId) {
      throw new ValidationError("Cannot settle with yourself");
    }
    const userId = await this.uid();
    const id = input.id ?? uuid();
    const { data, error } = await this.sb
      .from("settlement")
      .insert({
        id,
        group_id: input.groupId,
        from_member_id: input.fromMemberId,
        to_member_id: input.toMemberId,
        amount_cents: input.amountCents,
        settled_at: input.settledAt ?? new Date().toISOString(),
        updated_by: userId,
      })
      .select()
      .single();
    if (error) this.fail(error);
    await this.sb.from("activity").insert({
      id: uuid(),
      group_id: input.groupId,
      actor_id: userId,
      type: "settled",
      target_id: id,
    });
    return mapSettlement(data);
  }

  // --- shopping list ---
  async listShoppingItems(groupId: string): Promise<ShoppingItem[]> {
    const { data, error } = await this.sb
      .from("shopping_item")
      .select("*")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) this.fail(error);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      qty: row.qty != null ? Number(row.qty) : null,
      estPriceCents: row.est_price_cents != null ? Number(row.est_price_cents) : null,
      checked: row.checked,
      addedBy: row.added_by,
      ...syncMeta(row),
    }));
  }

  async addShoppingItem(
    item: Pick<ShoppingItem, "groupId" | "name"> &
      Partial<Pick<ShoppingItem, "qty" | "estPriceCents">>
  ): Promise<ShoppingItem> {
    const userId = await this.uid();
    const { data, error } = await this.sb
      .from("shopping_item")
      .insert({
        id: uuid(),
        group_id: item.groupId,
        name: item.name,
        qty: item.qty ?? null,
        est_price_cents: item.estPriceCents ?? null,
        added_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) this.fail(error);
    return {
      id: data.id,
      groupId: data.group_id,
      name: data.name,
      qty: data.qty != null ? Number(data.qty) : null,
      estPriceCents: data.est_price_cents != null ? Number(data.est_price_cents) : null,
      checked: data.checked,
      addedBy: data.added_by,
      ...syncMeta(data),
    };
  }

  async setShoppingItemChecked(id: string, checked: boolean): Promise<void> {
    const { error } = await this.sb.from("shopping_item").update({ checked }).eq("id", id);
    if (error) this.fail(error);
  }

  async removeShoppingItem(id: string): Promise<void> {
    const { error } = await this.sb
      .from("shopping_item")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail(error);
  }

  async clearCheckedShoppingItems(groupId: string): Promise<void> {
    const { error } = await this.sb
      .from("shopping_item")
      .update({ deleted_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .eq("checked", true)
      .is("deleted_at", null);
    if (error) this.fail(error);
  }

  subscribeShoppingItems(groupId: string, cb: () => void): () => void {
    const channel = this.sb
      .channel(`shopping:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_item", filter: `group_id=eq.${groupId}` },
        () => cb()
      )
      .subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  // --- recurring bills ---
  async listRecurring(groupId: string): Promise<RecurringExpense[]> {
    const { data, error } = await this.sb
      .from("recurring_expense")
      .select("*")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("next_run");
    if (error) this.fail(error);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      groupId: row.group_id,
      description: row.description,
      category: row.category,
      amountCents: Number(row.amount_cents),
      frequency: row.frequency,
      anchor: row.anchor,
      nextRun: row.next_run,
      endDate: row.end_date,
      payerMemberId: row.payer_member_id,
      splitMethod: row.split_method,
      participantMemberIds: row.participant_member_ids ?? [],
      fixedShares: Array.isArray(row.fixed_shares)
        ? row.fixed_shares.map((s: any) => ({
            memberId: s.member_id,
            shareCents: Number(s.share_cents),
          }))
        : null,
      paused: row.paused,
      ...syncMeta(row),
    }));
  }

  async createRecurring(input: NewRecurringInput): Promise<RecurringExpense> {
    const userId = await this.uid();
    const anchor =
      input.frequency === "weekly"
        ? ((Math.round(input.anchor) % 7) + 7) % 7
        : Math.max(1, Math.min(28, Math.round(input.anchor)));
    const { data, error } = await this.sb
      .from("recurring_expense")
      .insert({
        id: uuid(),
        group_id: input.groupId,
        description: input.description,
        category: autoCategory(input.description),
        amount_cents: input.amountCents,
        frequency: input.frequency,
        anchor,
        next_run: firstRun(input.frequency, anchor),
        payer_member_id: input.payerMemberId,
        split_method: input.splitMethod,
        participant_member_ids: input.participantMemberIds,
        // Stored as [{member_id, share_cents}] to match the SQL generator.
        fixed_shares:
          input.splitMethod === "exact" && input.fixedShares
            ? input.fixedShares.map((s) => ({ member_id: s.memberId, share_cents: s.shareCents }))
            : null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) this.fail(error);
    return (await this.listRecurring(input.groupId)).find((r) => r.id === data.id)!;
  }

  async setRecurringPaused(id: string, paused: boolean): Promise<void> {
    const { error } = await this.sb.from("recurring_expense").update({ paused }).eq("id", id);
    if (error) this.fail(error);
  }

  async deleteRecurring(id: string): Promise<void> {
    const { error } = await this.sb
      .from("recurring_expense")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail(error);
  }

  async runRecurringNow(id: string): Promise<void> {
    const { error } = await this.sb.rpc("run_recurring_now", { p_id: id });
    if (error) this.fail(error);
  }

  async processDueRecurring(groupId: string): Promise<number> {
    const { data, error } = await this.sb.rpc("process_due_recurring", { p_group_id: groupId });
    if (error) this.fail(error);
    return Number(data ?? 0);
  }

  // --- receipts ---
  async attachReceipt(expenseId: string, image: Blob): Promise<void> {
    const expense = await this.getExpense(expenseId);
    if (!expense) throw new ValidationError("Expense not found");
    const path = `${expense.groupId}/${expenseId}.jpg`;
    const { error: upErr } = await this.sb.storage
      .from("receipts")
      .upload(path, image, { upsert: true, contentType: "image/jpeg" });
    if (upErr) this.fail(upErr);
    const { error } = await this.sb.from("expense").update({ receipt_url: path }).eq("id", expenseId);
    if (error) this.fail(error);
  }

  async removeReceipt(expenseId: string): Promise<void> {
    const expense = await this.getExpense(expenseId);
    if (!expense?.receiptUrl) return;
    await this.sb.storage.from("receipts").remove([expense.receiptUrl]);
    const { error } = await this.sb.from("expense").update({ receipt_url: null }).eq("id", expenseId);
    if (error) this.fail(error);
  }

  async getReceiptUrl(receiptPath: string): Promise<string> {
    const { data, error } = await this.sb.storage
      .from("receipts")
      .createSignedUrl(receiptPath, 3600);
    if (error || !data?.signedUrl) this.fail(error ?? { message: "Could not sign receipt URL" });
    return data.signedUrl;
  }

  // --- activity ---
  async listActivity(groupId: string): Promise<Activity[]> {
    const { data, error } = await this.sb
      .from("activity")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) this.fail(error);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      groupId: row.group_id,
      actorId: row.actor_id,
      type: row.type,
      targetId: row.target_id,
      createdAt: row.created_at,
    }));
  }
}
