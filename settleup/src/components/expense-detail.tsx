"use client";

/**
 * Expense detail overlay (design: back / Edit / Delete header, big category
 * icon, amount, "Category · full date", Paid-by card with payer avatars +
 * amounts, Split card labeled by method with % pills, shares and nets).
 */

import { CATEGORY_META, fmt, type Expense, type GroupMember } from "@/lib/domain";
import { Avatar, memberDisplayName } from "./avatar";
import { CategoryTile } from "./expenses-tab";
import { Card } from "./ui";

const METHOD_LABEL: Record<string, string> = {
  equal: "Split equally",
  exact: "Exact amounts",
  salary: "Split proportionally",
  percent: "Split by percentage",
  shares: "Split by shares",
};

export function ExpenseDetail({
  expense,
  members,
  meUserId,
  onBack,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  members: GroupMember[];
  meUserId: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const member = (id: string) => members.find((m) => m.id === id);
  const fullDate = new Date(expense.spentAt).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 45,
        background: "var(--shell-gradient)",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 430, margin: "0 auto", padding: "max(env(safe-area-inset-top), 24px) 18px 40px" }}>
        <header
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}
        >
          <button
            onClick={onBack}
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
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onEdit}
              style={{
                background: "var(--bluebg)",
                border: "1px solid var(--primary)",
                borderRadius: 999,
                color: "var(--primary)",
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete expense"
              style={{
                background: "var(--redbg)",
                border: "1px solid var(--red)",
                borderRadius: 999,
                color: "var(--red)",
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              🗑
            </button>
          </div>
        </header>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <CategoryTile category={expense.category} size={64} />
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginTop: 14 }}>
            {expense.description}
          </h1>
          <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px", margin: "4px 0" }}>
            {fmt(expense.amountCents)}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {CATEGORY_META[expense.category].label} · {fullDate}
          </p>
        </div>

        <Card style={{ marginBottom: 14, padding: 16 }}>
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--faint)",
              marginBottom: 10,
            }}
          >
            Paid by
          </p>
          {expense.payers.map((p) => (
            <div key={p.memberId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <Avatar member={member(p.memberId)} meUserId={meUserId} size={30} />
              <p style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
                {memberDisplayName(member(p.memberId), meUserId)}
              </p>
              <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(p.paidCents)}</p>
            </div>
          ))}
        </Card>

        <Card style={{ padding: 16 }}>
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--faint)",
              marginBottom: 10,
            }}
          >
            {METHOD_LABEL[expense.splitMethod] ?? "Split"}
          </p>
          {expense.splits.map((s) => {
            const paid = expense.payers
              .filter((p) => p.memberId === s.memberId)
              .reduce((a, p) => a + p.paidCents, 0);
            const net = paid - s.shareCents;
            const pct = expense.amountCents > 0 ? Math.round((s.shareCents / expense.amountCents) * 100) : 0;
            return (
              <div key={s.memberId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                <Avatar member={member(s.memberId)} meUserId={meUserId} size={30} />
                <p style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>
                  {memberDisplayName(member(s.memberId), meUserId)}
                </p>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--faint)",
                    background: "var(--s2)",
                    borderRadius: 999,
                    padding: "3px 8px",
                  }}
                >
                  {pct}%
                </span>
                <p style={{ fontSize: 14, fontWeight: 700, minWidth: 78, textAlign: "right" }}>
                  {fmt(s.shareCents)}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    minWidth: 70,
                    textAlign: "right",
                    color: net > 0 ? "var(--green)" : net < 0 ? "var(--red)" : "var(--faint)",
                  }}
                >
                  {net === 0 ? "—" : (net > 0 ? "+" : "−") + fmt(Math.abs(net))}
                </p>
              </div>
            );
          })}
          {expense.note && (
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              {expense.note}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
