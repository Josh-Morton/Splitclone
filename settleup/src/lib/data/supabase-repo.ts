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
  type NewSettlementInput,
  type Repo,
  ValidationError,
} from "./repo";

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
    return (data ?? []).map(mapMember);
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

  // --- shopping list / recurring: Phase 4 (tables not yet migrated) ---
  async listShoppingItems(): Promise<ShoppingItem[]> {
    return [];
  }
  async addShoppingItem(): Promise<ShoppingItem> {
    throw new ValidationError("Shopping list arrives in Phase 4");
  }
  async setShoppingItemChecked(): Promise<void> {
    throw new ValidationError("Shopping list arrives in Phase 4");
  }
  async removeShoppingItem(): Promise<void> {
    throw new ValidationError("Shopping list arrives in Phase 4");
  }
  async listRecurring(): Promise<RecurringExpense[]> {
    return [];
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
