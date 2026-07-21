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
import {
  applyFilters,
  DEFAULT_FILTERS,
  filtersLabel,
  isDefault,
  type ReportFilters,
} from "@/lib/report-filters";
import { Avatar, memberDisplayName } from "./avatar";
import { ReportFilterSheet } from "./report-filter-sheet";
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
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const memberName = (id: string) => memberDisplayName(members.find((m) => m.id === id), meUserId);
  const categoryLabel = (c: Category) => CATEGORY_META[c].label;

  // All sections + export operate on the filtered set (Phase 6 report filters).
  const filtered = applyFilters(expenses, filters);
  const label = filtersLabel(filters, memberName, categoryLabel);
  const rangeTotal = filtered.reduce((a, e) => a + e.amountCents, 0);

  // --- Trend: months spanned by the filtered set, up to the last 6 present ---
  const presentMonths = [...new Set(filtered.map((e) => monthKey(e.spentAt)))].sort();
  const trendKeys = presentMonths.slice(-6);
  const monthTotals = trendKeys.map((k) => ({
    key: k,
    total: filtered.filter((e) => monthKey(e.spentAt) === k).reduce((a, e) => a + e.amountCents, 0),
  }));
  const maxMonth = Math.max(1, ...monthTotals.map((m) => m.total));

  const byCategory = new Map<Category, number>();
  for (const e of filtered) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  const perMember = members.map((m) => ({
    member: m,
    paid: filtered.reduce(
      (a, e) => a + e.payers.filter((p) => p.memberId === m.id).reduce((x, p) => x + p.paidCents, 0),
      0
    ),
    share: filtered.reduce(
      (a, e) => a + (e.splits.find((s) => s.memberId === m.id)?.shareCents ?? 0),
      0
    ),
  }));

  async function doExport() {
    setExporting(true);
    setError("");
    try {
      await exportExpensesXlsx({
        groupName,
        expenses: filtered,
        settlements,
        members,
        meUserId,
        memberName,
        labelSuffix: label,
      });
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
            {label} · {fmt(rangeTotal)} across {filtered.length} expense
            {filtered.length === 1 ? "" : "s"} · {groupName}
          </p>
        </div>
        <button
          onClick={doExport}
          disabled={exporting || filtered.length === 0}
          style={{
            background: "var(--bluebg)",
            border: "1px solid var(--primary)",
            borderRadius: 999,
            color: "var(--primary)",
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 14px",
            cursor: "pointer",
            opacity: exporting || filtered.length === 0 ? 0.55 : 1,
          }}
        >
          {exporting ? "Exporting…" : "Export ⬇"}
        </button>
      </header>

      <button
        onClick={() => setFilterOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          marginBottom: 16,
          background: isDefault(filters) ? "var(--s2)" : "var(--bluebg)",
          border: `1px solid ${isDefault(filters) ? "var(--line)" : "var(--primary)"}`,
          borderRadius: 999,
          padding: "10px 16px",
          cursor: "pointer",
          color: isDefault(filters) ? "var(--muted)" : "var(--primary)",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span>⚲</span>
        <span style={{ flex: 1, textAlign: "left" }}>{isDefault(filters) ? "Filter" : label}</span>
        {!isDefault(filters) && (
          <span
            role="button"
            aria-label="Clear filters"
            onClick={(ev) => {
              ev.stopPropagation();
              setFilters({ ...DEFAULT_FILTERS, categories: new Set() });
            }}
            style={{ color: "var(--faint)", fontWeight: 800 }}
          >
            ✕
          </span>
        )}
      </button>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

      {/* Monthly trend */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Monthly spend</h2>
        {monthTotals.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Nothing in this range.</p>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: monthTotals.length ? 140 : 0 }}>
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
                  color: "var(--faint)",
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
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 12 }}>By category</h2>
        {categories.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>No expenses in this range.</p>
        )}
        {categories.map(([cat, cents]) => {
          const meta = CATEGORY_META[cat];
          const pct = rangeTotal > 0 ? Math.round((cents / rangeTotal) * 100) : 0;
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
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 12 }}>Who paid what</h2>
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

      <ReportFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
        filters={filters}
        members={members}
        meUserId={meUserId}
      />
    </>
  );
}
