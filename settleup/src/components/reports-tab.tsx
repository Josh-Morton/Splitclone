"use client";

/**
 * Reports tab (design: Export button top-right, monthly trend bar chart with
 * gradient bars + amount labels, "By category" breakdown with progress bars
 * and % for the month, "Who paid what" — per member paid vs share this month).
 */

import { useState } from "react";
import {
  CATEGORY_META,
  fmt,
  fmtR,
  type Category,
  type Expense,
  type GroupMember,
  type Settlement,
} from "@/lib/domain";
import { exportExpensesXlsx } from "@/lib/export";
import { Avatar, memberDisplayName } from "./avatar";
import { Card } from "./ui";

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
}

export function ReportsTab({
  groupName,
  expenses,
  settlements,
  members,
  meUserId,
}: {
  groupName: string;
  expenses: Expense[];
  settlements: Settlement[];
  members: GroupMember[];
  meUserId: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const memberName = (id: string) => memberDisplayName(members.find((m) => m.id === id), meUserId);

  // --- Trend: last 6 months (including empty ones), oldest first ---
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthTotals = monthKeys.map((k) => ({
    key: k,
    total: expenses.filter((e) => monthKey(e.spentAt) === k).reduce((a, e) => a + e.amountCents, 0),
  }));
  const maxMonth = Math.max(1, ...monthTotals.map((m) => m.total));

  // --- This month ---
  const thisKey = monthKeys[monthKeys.length - 1];
  const monthExpenses = expenses.filter((e) => monthKey(e.spentAt) === thisKey);
  const monthTotal = monthExpenses.reduce((a, e) => a + e.amountCents, 0);

  const byCategory = new Map<Category, number>();
  for (const e of monthExpenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  const perMember = members.map((m) => ({
    member: m,
    paid: monthExpenses.reduce(
      (a, e) => a + e.payers.filter((p) => p.memberId === m.id).reduce((x, p) => x + p.paidCents, 0),
      0
    ),
    share: monthExpenses.reduce(
      (a, e) => a + (e.splits.find((s) => s.memberId === m.id)?.shareCents ?? 0),
      0
    ),
  }));

  async function doExport() {
    setExporting(true);
    setError("");
    try {
      await exportExpensesXlsx({ groupName, expenses, settlements, members, meUserId, memberName });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}
      >
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>Reports</h1>
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            This month · {fmt(monthTotal)} across {monthExpenses.length} expense
            {monthExpenses.length === 1 ? "" : "s"} · {groupName}
          </p>
        </div>
        <button
          onClick={doExport}
          disabled={exporting || expenses.length === 0}
          style={{
            background: "var(--bluebg)",
            border: "1px solid var(--primary)",
            borderRadius: 999,
            color: "var(--primary)",
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 14px",
            cursor: "pointer",
            opacity: exporting || expenses.length === 0 ? 0.55 : 1,
          }}
        >
          {exporting ? "Exporting…" : "Export ⬇"}
        </button>
      </header>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

      {/* Monthly trend */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Monthly spend</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
          {monthTotals.map((m) => (
            <div
              key={m.key}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
            >
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
                {m.total > 0 ? fmtR(m.total) : ""}
              </p>
              <div
                style={{
                  width: "100%",
                  maxWidth: 34,
                  height: Math.max(m.total > 0 ? 6 : 2, Math.round((m.total / maxMonth) * 92)),
                  borderRadius: 6,
                  background: m.total > 0 ? "var(--brand-gradient)" : "var(--s2)",
                }}
              />
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: m.key === thisKey ? "var(--primary)" : "var(--faint)",
                }}
              >
                {monthLabel(m.key)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* By category */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 12 }}>By category · this month</h2>
        {categories.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>No expenses this month yet.</p>
        )}
        {categories.map(([cat, cents]) => {
          const meta = CATEGORY_META[cat];
          const pct = monthTotal > 0 ? Math.round((cents / monthTotal) * 100) : 0;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {meta.icon} {meta.label}
                  <span style={{ color: "var(--faint)", fontWeight: 700, marginLeft: 8, fontSize: 11.5 }}>
                    {pct}%
                  </span>
                </p>
                <p style={{ fontSize: 13.5, fontWeight: 700 }}>{fmt(cents)}</p>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: "var(--s2)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: meta.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </Card>

      {/* Who paid what */}
      <Card style={{ padding: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 12 }}>Who paid what · this month</h2>
        {perMember.map(({ member, paid, share }) => (
          <div
            key={member.id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}
          >
            <Avatar member={member} meUserId={meUserId} size={32} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700 }}>{memberName(member.id)}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                paid {fmt(paid)} · share {fmt(share)}
              </p>
            </div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: paid - share > 0 ? "var(--green)" : paid - share < 0 ? "var(--red)" : "var(--faint)",
              }}
            >
              {paid - share === 0 ? "—" : (paid - share > 0 ? "+" : "−") + fmt(Math.abs(paid - share))}
            </p>
          </div>
        ))}
      </Card>
    </>
  );
}
