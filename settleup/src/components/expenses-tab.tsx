"use client";

/**
 * Expenses tab (design: title + "N expenses · Rtotal", date-grouped list —
 * Today / Yesterday / "5 Jun". Rows: category icon tile, description,
 * sub-line "you paid · your share 50%", amount, and a lent/borrowed net line).
 */

import { categoryMeta, fmt, type Expense, type GroupMember } from "@/lib/domain";
import { memberDisplayName } from "./avatar";

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function CategoryTile({ category, size = 40 }: { category: Expense["category"]; size?: number }) {
  const meta = categoryMeta(category);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `${meta.color}29`, // ~16% alpha tint of the accent
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        flexShrink: 0,
      }}
    >
      {meta.icon}
    </div>
  );
}

export function ExpensesTab({
  expenses,
  members,
  meUserId,
  groupName,
  onOpen,
}: {
  expenses: Expense[];
  members: GroupMember[];
  meUserId: string;
  groupName: string;
  onOpen: (e: Expense) => void;
}) {
  const meMember = members.find((m) => m.userId === meUserId);
  const total = expenses.reduce((a, e) => a + e.amountCents, 0);

  const groups: { label: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const label = dayLabel(e.spentAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>Expenses</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {expenses.length} expense{expenses.length === 1 ? "" : "s"} · {fmt(total)} · {groupName}
        </p>
      </header>

      {expenses.length === 0 && (
        <p style={{ fontSize: 13.5, color: "var(--muted)" }}>
          Nothing here yet — add your first expense with the + button.
        </p>
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
            {g.items.map((e, i) => {
              const myShare = e.splits.find((s) => s.memberId === meMember?.id)?.shareCents ?? 0;
              const myPaid = e.payers
                .filter((p) => p.memberId === meMember?.id)
                .reduce((a, p) => a + p.paidCents, 0);
              const net = myPaid - myShare;
              const sharePct = e.amountCents > 0 ? Math.round((myShare / e.amountCents) * 100) : 0;
              const payerNames =
                e.payers.length > 1
                  ? `${e.payers.length} payers`
                  : `${memberDisplayName(members.find((m) => m.id === e.payers[0]?.memberId), meUserId).toLowerCase() === "you" ? "you" : memberDisplayName(members.find((m) => m.id === e.payers[0]?.memberId), meUserId)} paid`;
              return (
                <div
                  key={e.id}
                  role="button"
                  aria-label={`Open ${e.description}`}
                  onClick={() => onOpen(e)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                >
                  <CategoryTile category={e.category} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600 }}>{e.description}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>
                      {payerNames} · your share {sharePct}%
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
                    {net !== 0 && (
                      <p
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: net > 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        you {net > 0 ? "lent" : "borrowed"} {fmt(Math.abs(net))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
