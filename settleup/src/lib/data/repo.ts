/**
 * The single data-access boundary — the Phase-1 architecture guardrail.
 *
 * ALL UI code reads and writes through this interface and nothing else.
 * Phase 1 ships an online-first Supabase implementation; Phase 2 swaps in a
 * local-first IndexedDB (Dexie) implementation with an outbox/sync engine —
 * without touching any screen code.
 *
 * Rules encoded here:
 *  - ids are client-generated UUIDs (offline-safe, retry-idempotent)
 *  - money is integer cents
 *  - deletes are soft (tombstones), so they sync cleanly
 *  - balances are never stored: derive them via lib/domain/balance.ts
 */

import type {
  Activity,
  Expense,
  ExpensePayer,
  ExpenseSplit,
  Group,
  GroupMember,
  Profile,
  RecurringExpense,
  Settlement,
  ShoppingItem,
  SplitMethod,
  User,
  Category,
  Cents,
} from "../domain";

export interface NewExpenseInput {
  id?: string; // caller may pre-generate for optimistic UI
  groupId: string;
  description: string;
  category: Category;
  amountCents: Cents;
  spentAt: string;
  splitMethod: SplitMethod;
  payers: ExpensePayer[];
  splits: ExpenseSplit[];
  note?: string | null;
  recurringId?: string | null;
}

export interface NewRecurringInput {
  groupId: string;
  description: string;
  amountCents: Cents;
  frequency: "weekly" | "monthly";
  /** Weekly: day-of-week 0 (Sun)–6 (Sat). Monthly: day-of-month 1–28. */
  anchor: number;
  payerMemberId: string;
  splitMethod: "equal" | "salary" | "exact";
  participantMemberIds: string[];
  /** Required when splitMethod === "exact": the locked per-member shares. */
  fixedShares?: ExpenseSplit[];
}

export interface NewSettlementInput {
  id?: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: Cents;
  settledAt?: string;
}

/** Thrown by write methods when integrity validation fails. */
export class ValidationError extends Error {}

export interface Repo {
  // --- session / profile ---
  getCurrentUser(): Promise<User | null>;
  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(
    profile: Partial<Profile> & { userId: string; displayName?: string }
  ): Promise<Profile>;

  /**
   * Salary-proportional shares for a prospective expense, computed without
   * revealing anyone's salary (ADR-0010). Returns null when any participant
   * has no salary — caller falls back to an equal split with a warning.
   */
  getSalaryShares(
    groupId: string,
    totalCents: Cents,
    memberIds: string[]
  ): Promise<ExpenseSplit[] | null>;

  // --- groups & members ---
  listGroups(): Promise<Group[]>;
  createGroup(name: string): Promise<Group>;
  renameGroup(groupId: string, name: string): Promise<Group>;
  /** Soft-delete (archive) a space. Caller should switch to another space after. */
  deleteGroup(groupId: string): Promise<void>;
  setSimplifyDebts(groupId: string, on: boolean): Promise<Group>;
  listMembers(groupId: string): Promise<GroupMember[]>;
  addPlaceholderMember(groupId: string, name: string): Promise<GroupMember>;
  /**
   * Owner removes a member (not themselves, not another owner). Requires the
   * member's balance to be zero. Returns the removed user's id (null for a
   * placeholder) so the caller can send the "you were removed" email.
   */
  removeMember(memberId: string): Promise<string | null>;
  /** A non-owner member leaves the space (owner must delete instead). Zero-balance only. */
  leaveGroup(groupId: string): Promise<void>;
  /** Best-effort "you were removed" email to a removed user. Never throws. */
  notifyRemoved(removedUserId: string, groupId: string): Promise<void>;

  // --- invites (E3) ---
  /**
   * Creates a shareable invite code (e.g. "SAM-4K2Q"). If upgradesMemberId is
   * given, redeeming upgrades that placeholder member so their history
   * transfers to the joining account.
   */
  createInvite(groupId: string, upgradesMemberId?: string | null): Promise<{ code: string }>;
  /** Group + inviter names for a code, or null if invalid/expired. Works signed out. */
  previewInvite(code: string): Promise<{ groupName: string; inviterName: string } | null>;
  /** Joins (or upgrades into) the invite's group. Idempotent for existing members. */
  redeemInvite(code: string): Promise<{ groupId: string; groupName: string }>;

  // --- expenses ---
  listExpenses(groupId: string): Promise<Expense[]>; // live (non-deleted), newest first
  getExpense(id: string): Promise<Expense | null>;
  /**
   * Validates before writing: amount > 0, ≥1 participant,
   * Σ payers.paidCents === amount, Σ splits.shareCents === amount.
   */
  createExpense(input: NewExpenseInput): Promise<Expense>;
  updateExpense(id: string, input: NewExpenseInput): Promise<Expense>;
  /** Soft delete (sets deletedAt). Reversible with restoreExpense — drives the Undo toast. */
  deleteExpense(id: string): Promise<void>;
  restoreExpense(id: string): Promise<void>;

  // --- settlements ---
  listSettlements(groupId: string): Promise<Settlement[]>;
  recordSettlement(input: NewSettlementInput): Promise<Settlement>;

  // --- shopping list ---
  listShoppingItems(groupId: string): Promise<ShoppingItem[]>;
  addShoppingItem(
    item: Pick<ShoppingItem, "groupId" | "name"> & Partial<Pick<ShoppingItem, "qty" | "estPriceCents">>
  ): Promise<ShoppingItem>;
  setShoppingItemChecked(id: string, checked: boolean): Promise<void>;
  removeShoppingItem(id: string): Promise<void>;
  /** Soft-remove all checked ("in cart") items — used by Clear and cart→expense. */
  clearCheckedShoppingItems(groupId: string): Promise<void>;
  /** Realtime: invoke cb when another device changes the list. Returns unsubscribe. */
  subscribeShoppingItems(groupId: string, cb: () => void): () => void;

  // --- recurring bills ---
  listRecurring(groupId: string): Promise<RecurringExpense[]>;
  createRecurring(input: NewRecurringInput): Promise<RecurringExpense>;
  setRecurringPaused(id: string, paused: boolean): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  /** "Add now": generate the expense immediately and advance next-run. */
  runRecurringNow(id: string): Promise<void>;
  /** Catch-up: generate any missed occurrences for this group. Returns count. */
  processDueRecurring(groupId: string): Promise<number>;

  // --- activity ---
  listActivity(groupId: string): Promise<Activity[]>;

  // --- receipts (one image per expense; pre-compressed by the caller) ---
  attachReceipt(expenseId: string, image: Blob): Promise<void>;
  removeReceipt(expenseId: string): Promise<void>;
  /** Short-lived viewable URL for an expense's stored receipt path. */
  getReceiptUrl(receiptPath: string): Promise<string>;

  // --- receipt scanning (Phase 7; image never stored) ---
  /**
   * Extract line items + total from a receipt image (base64, no data: prefix).
   * Runs server-side via the scan-receipt Edge Function; the image is used only
   * for extraction and discarded.
   */
  scanReceipt(imageBase64: string, mimeType: string): Promise<ScanResult>;

  // --- Splitty (Phase 8; standalone from the expense ledger — ADR-0013) ---
  /** Admin only (signed in). Creates the bill + the admin's own guest row. */
  splittyCreateBill(
    merchant: string | null,
    receiptTotalCents: Cents,
    items: SplitBillItemInput[]
  ): Promise<{ shareCode: string; guestId: string; guestToken: string }>;
  /** No auth required. */
  splittyJoin(shareCode: string, displayName: string): Promise<{ guestId: string; guestToken: string }>;
  /** No auth required. Null if the code doesn't exist. */
  splittyGetBill(shareCode: string): Promise<SplitBill | null>;
  splittyClaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
  splittyUnclaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
  splittySetTip(shareCode: string, guestToken: string, tipPercent: number): Promise<void>;
  splittySetLocked(shareCode: string, guestToken: string, locked: boolean): Promise<void>;
  /** Admin only (signed in, must be the creator). */
  splittyCloseBill(shareCode: string): Promise<void>;
  /** Admin only — bills the signed-in user created, newest first. */
  splittyListMyBills(): Promise<SplitBillSummary[]>;
  /** Realtime: invoke cb when items/guests change on this bill. Returns unsubscribe. */
  subscribeSplitBill(shareCode: string, cb: () => void): () => void;
}

export interface ScanItem {
  name: string;
  qty: number | null;
  lineTotalCents: Cents;
}

export interface ScanResult {
  merchant: string | null;
  totalCents: Cents;
  items: ScanItem[];
}

export interface SplitBillItemInput {
  name: string;
  lineTotalCents: Cents;
}

export interface SplitBillGuest {
  id: string;
  displayName: string;
  tipPercent: number;
  lockedIn: boolean;
  isAdmin: boolean;
}

export interface SplitBillItem {
  id: string;
  name: string;
  lineTotalCents: Cents;
  claimedByGuestId: string | null;
}

export interface SplitBill {
  billId: string;
  shareCode: string;
  merchant: string | null;
  receiptTotalCents: Cents;
  status: "open" | "closed";
  items: SplitBillItem[];
  guests: SplitBillGuest[];
}

export interface SplitBillSummary {
  shareCode: string;
  merchant: string | null;
  status: "open" | "closed";
  createdAt: string;
}
