"use client";

/**
 * Activity screen (design: back header, date-grouped feed of expense and
 * settlement events — icon tile, title, actor + date, amount; expense rows
 * tap into detail). The append-only audit log for "what changed".
 */

import { useEffect, useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, type Activity, type Expense, type GroupMember, type Settlement } from "@/lib/domain";
import { memberDisplayName } from "./avatar";
import { dayLabel } from "./expenses-tab";
import { Spinner } from "./ui";

interface FeedRow {
  id: string;
  createdAt: string;
  glyph: string;
  tint: string;
  title: string;
  meta: string;
  amount: string | null;
  expense: Expense | null; // tap-through when the expense still exists
}

export function ActivityOverlay({
  open,
  onClose,
  onOpenExpense,
  repo,
  groupId,
  members,
  meUserId,
  expenses,
}: {
  open: boolean;
  onClose: () => void;
  onOpenExpense: (e: Expense) => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  /** Live (non-deleted) expenses from the app shell, for lookups. */
  expenses: Expense[];
}) {
  const [rows, setRows] = useState<FeedRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [activity, settlements] = await Promise.all([
          repo.listActivity(groupId),
          repo.listSettlements(groupId),
        ]);
        if (cancelled) return;
        setRows(activity.map((a) => toRow(a, expenses, settlements, members, meUserId)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, repo, groupId, expenses, members, meUserId]);

  if (!open) return null;

  const groups: { label: string; items: FeedRow[] }[] = [];
  for (const r of rows ?? []) {
    const label = dayLabel(r.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 45, background: "var(--shell-gradient)", overflowY: "auto" }}
    >
      <div style={{ maxWidth: 430, margin: "0 auto", padding: "max(env(safe-area-inset-top), 24px) 18px 40px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <button
            onClick={onClose}
            aria-label="Back"
            style={{
              background: "var(--s2)",
              border: "1px solid var(--line2)",
              borderRadius: 999,
              color: "var(--ink)",
              fontSize: 15,
              fontWeight: 700,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            ‹ Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>Activity</h1>
        </header>

        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        {!rows && !error && <Spinner />}
        {rows && rows.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Nothing has happened yet.</p>
        )}

        {groups.map((g) => (
          <section key={g.label} style={{ marginBottom: 18 }}>
            <p
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--faint)",
                marginBottom: 8,
              }}
            >
              {g.label}
            </p>
            <div
              style={{
                background: "var(--surface)",
                borderRadius: "var(--r-card)",
                border: "1px solid var(--line)",
                padding: "2px 14px",
              }}
            >
              {g.items.map((r, i) => (
                <div
                  key={r.id}
                  role={r.expense ? "button" : undefined}
                  onClick={r.expense ? () => onOpenExpense(r.expense!) : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    cursor: r.expense ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: r.tint,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {r.glyph}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</p>
                    <p style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.meta}</p>
                  </div>
                  {r.amount && <p style={{ fontSize: 14, fontWeight: 700 }}>{r.amount}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function toRow(
  a: Activity,
  expenses: Expense[],
  settlements: Settlement[],
  members: GroupMember[],
  meUserId: string
): FeedRow {
  const actorMember = members.find((m) => m.userId === a.actorId);
  const actor = actorMember ? memberDisplayName(actorMember, meUserId) : "Someone";
  const when = new Date(a.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  const expense = expenses.find((e) => e.id === a.targetId) ?? null;

  switch (a.type) {
    case "expense_added":
    case "recurring_generated": {
      const auto = a.type === "recurring_generated";
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: auto ? "🔁" : "🧾",
        tint: "var(--bluebg)",
        title: expense ? expense.description : "Expense (since deleted)",
        meta: `${auto ? "Generated from a recurring bill" : `${actor} added`} · ${when}`,
        amount: expense ? fmt(expense.amountCents) : null,
        expense,
      };
    }
    case "expense_edited":
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: "✏️",
        tint: "var(--bluebg)",
        title: expense ? expense.description : "Expense (since deleted)",
        meta: `${actor} edited · ${when}`,
        amount: expense ? fmt(expense.amountCents) : null,
        expense,
      };
    case "expense_deleted":
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: "🗑",
        tint: "var(--redbg)",
        title: "Expense deleted",
        meta: `${actor} · ${when}`,
        amount: null,
        expense,
      };
    case "settled": {
      const s = settlements.find((x) => x.id === a.targetId);
      const from = memberDisplayName(members.find((m) => m.id === s?.fromMemberId), meUserId);
      const to = memberDisplayName(members.find((m) => m.id === s?.toMemberId), meUserId);
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: "✓",
        tint: "var(--greenbg)",
        title: "Payment recorded",
        meta: `${from} → ${to} · ${when}`,
        amount: s ? fmt(s.amountCents) : null,
        expense: null,
      };
    }
    case "member_joined":
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: "👋",
        tint: "var(--greenbg)",
        title: `${actor} joined the household`,
        meta: when,
        amount: null,
        expense: null,
      };
    default:
      return {
        id: a.id,
        createdAt: a.createdAt,
        glyph: "•",
        tint: "var(--s2)",
        title: a.type,
        meta: `${actor} · ${when}`,
        amount: null,
        expense: null,
      };
  }
}
