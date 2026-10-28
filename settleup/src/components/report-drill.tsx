"use client";

/**
 * The Reports drill view (Phase 20 §4.7): from any number down to the
 * expenses behind it.
 *
 * One view, driven by a scope — any mix of month, category, subcategory and a
 * "regular" description — with a breadcrumb (Reports › Oct 2026 › Groceries ›
 * Supermarket) where every crumb is tappable. It shows, for its scope: the
 * total and change, a 12-month trend when it isn't pinned to one month, the
 * next level down (categories for a month, subcategories for a category), and
 * the expenses themselves, grouped by day. Tapping an expense opens the
 * existing expense detail — which is how a user re-files the "Other" pile.
 *
 * A month in scope overrides the range preset; the person and category
 * filters always apply (they're already baked into `base`).
 */

import { useState } from "react";
import {
  CATEGORY_META,
  categoryMeta,
  fmt,
  fmtR,
  type Expense,
  type GroupMember,
} from "@/lib/domain";
import {
  addMonths,
  categoryRollup,
  dayOf,
  inBounds,
  inScope,
  monthLabel,
  monthOf,
  monthSeries,
  sumCents,
  trendWindow,
  type Bounds,
  type DrillScope,
} from "@/lib/reports";
import { memberDisplayName } from "./avatar";
import { MonthColumns } from "./charts/month-columns";
import { NumbersTable } from "./charts/numbers-table";
import { Glyph } from "./category-icon";
import { CategoryTile } from "./expenses-tab";
import { Card, pressable } from "./ui";

/** Remove the deepest level, in breadcrumb order: regular › sub › parent › month. */
function parentScope(s: DrillScope): DrillScope | null {
  const next = { ...s };
  if (next.regular) delete next.regular;
  else if (next.sub) delete next.sub;
  else if (next.parent) delete next.parent;
  else if (next.month) delete next.month;
  return Object.keys(next).length ? next : null;
}

export function ReportDrill({
  scope,
  onScope,
  base,
  focus,
  previous,
  previousShort,
  focusTotal,
  focusLabel,
  endMonth,
  isFocusMonth,
  regularLabel,
  members,
  meUserId,
  onOpenExpense,
}: {
  scope: DrillScope;
  onScope: (s: DrillScope | null) => void;
  /** Every expense matching the person/category filters, all dates. */
  base: Expense[];
  focus: Bounds;
  previous: Bounds | null;
  previousShort: string;
  focusTotal: number;
  focusLabel: string;
  endMonth: string;
  isFocusMonth: (key: string) => boolean;
  /** Display text for a regular's normalised key. */
  regularLabel: (key: string) => string;
  members: GroupMember[];
  meUserId: string;
  onOpenExpense: (e: Expense) => void;
}) {
  const { month, parent, sub, regular } = scope;
  const scoped = base.filter((e) => inScope(e, { parent, sub, regular }));
  const rows = (month ? scoped.filter((e) => monthOf(dayOf(e)) === month) : scoped.filter((e) => inBounds(e, focus)))
    .slice()
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  const prevRows = month
    ? scoped.filter((e) => monthOf(dayOf(e)) === addMonths(month, -1))
    : previous
      ? scoped.filter((e) => inBounds(e, previous))
      : null;
  const total = sumCents(rows);
  const prevTotal = prevRows ? sumCents(prevRows) : null;
  const vs = month ? `${monthLabel(addMonths(month, -1))}` : previousShort;

  // Breadcrumb, in order: month › category › subcategory › regular.
  const crumbs: { label: string; scope: DrillScope | null }[] = [{ label: "Reports", scope: null }];
  const acc: DrillScope = {};
  if (month) crumbs.push({ label: monthLabel(month, true), scope: { ...Object.assign(acc, { month }) } });
  if (parent) crumbs.push({ label: CATEGORY_META[parent].label, scope: { ...Object.assign(acc, { parent }) } });
  if (sub) crumbs.push({ label: categoryMeta(sub).label, scope: { ...Object.assign(acc, { sub }) } });
  if (regular) crumbs.push({ label: regularLabel(regular), scope: { ...Object.assign(acc, { regular }) } });
  const title = crumbs[crumbs.length - 1].label;

  // Trend for the scope, unless it's pinned to one month.
  const win = trendWindow(scoped, endMonth);
  const series = monthSeries(scoped, win.start, win.end);
  // Start the readout on the latest month this scope actually has spending in
  // — defaulting to the window's end showed "R0 · 0 expenses" for anything not
  // bought this month (e.g. a regular last bought in September).
  const latestLive = [...series].reverse().find((p) => p.count > 0)?.key ?? endMonth;
  const [selected, setSelected] = useState<string | null>(null);
  const selPoint = series.find((p) => p.key === (selected ?? latestLive)) ?? series[series.length - 1];

  // The next level down.
  const rollup = categoryRollup(rows, prevRows);
  const breakdown = !parent
    ? rollup.map((r) => ({
        key: r.parent,
        label: CATEGORY_META[r.parent].label,
        glyph: CATEGORY_META[r.parent],
        total: r.total,
        count: r.count,
        go: { ...scope, parent: r.parent } as DrillScope,
      }))
    : !sub && !regular
      ? (rollup.find((r) => r.parent === parent)?.subs ?? []).map((s) => ({
          key: s.slug,
          label: categoryMeta(s.slug).label,
          glyph: categoryMeta(s.slug),
          total: s.total,
          count: s.count,
          go: { ...scope, sub: s.slug } as DrillScope,
        }))
      : [];
  const breakdownMax = Math.max(1, ...breakdown.map((b) => b.total));

  // Expenses grouped by day.
  const byDay = new Map<string, Expense[]>();
  for (const e of rows) {
    const d = dayOf(e);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const dayLabel = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  };
  const payerText = (e: Expense) => {
    if (e.payers.length !== 1) return "Shared payment";
    const name = memberDisplayName(members.find((m) => m.id === e.payers[0].memberId), meUserId);
    return `${name} paid`;
  };

  return (
    <>
      {/* Breadcrumb + back */}
      <nav aria-label="Report breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={() => onScope(parentScope(scope))}
          className="press hit"
          // Named for where it goes: the expense detail opened from here has
          // its own "Back", and two identically named controls is ambiguous.
          aria-label={`Back to ${crumbs[crumbs.length - 2]?.label ?? "Reports"}`}
          style={{
            background: "var(--s2)",
            border: "1px solid var(--line2)",
            borderRadius: 999,
            padding: "5px 11px",
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          ‹ Back
        </button>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              {i > 0 && <span aria-hidden style={{ color: "var(--faint)" }}>›</span>}
              {last ? (
                <span aria-current="page" style={{ fontWeight: 800, color: "var(--ink)" }}>{c.label}</span>
              ) : (
                <button
                  onClick={() => onScope(c.scope)}
                  className="hit"
                  style={{ background: "none", border: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                >
                  {c.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Header figures */}
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>
          {title}
          {!month && ` · ${focusLabel}`}
        </p>
        <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1px", margin: "2px 0 4px" }}>{fmt(total)}</p>
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {rows.length} expense{rows.length === 1 ? "" : "s"}
          {!month && focusTotal > 0 && total > 0 && ` · ${Math.round((total / focusTotal) * 100)}% of all spending`}
        </p>
        {prevTotal !== null && (prevTotal > 0 || total > 0) && (
          <p style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600, marginTop: 4 }}>
            {total === prevTotal
              ? `Same as ${vs}`
              : `${total > prevTotal ? "▲" : "▼"} ${fmtR(Math.abs(total - prevTotal))} ${total > prevTotal ? "more" : "less"} than ${vs}`}
          </p>
        )}
      </Card>

      {/* Trend for this scope (not when pinned to a month) */}
      {!month && series.some((p) => p.total > 0) && (
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>{title} by month</h2>
          <p aria-live="polite" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6, minHeight: 18 }}>
            <span style={{ color: "var(--ink)", fontWeight: 800 }}>{monthLabel(selPoint.key, true)}</span> ·{" "}
            <span style={{ color: "var(--ink)", fontWeight: 800 }}>{fmtR(selPoint.total)}</span> · {selPoint.count} expense
            {selPoint.count === 1 ? "" : "s"}
            {selPoint.count > 0 && (
              <button
                onClick={() => onScope({ ...scope, month: selPoint.key })}
                className="hit"
                style={{ marginLeft: 10, background: "none", border: "none", padding: 0, color: "var(--primary)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
              >
                See {monthLabel(selPoint.key)} ›
              </button>
            )}
          </p>
          <MonthColumns
            points={series}
            isFocus={isFocusMonth}
            selected={selPoint.key}
            onSelect={setSelected}
            onActivate={(k) => onScope({ ...scope, month: k })}
            label={`${title} by month`}
          />
          <NumbersTable
            caption={`${title} by month`}
            columns={["Month", "Spent", "Expenses"]}
            rows={series.map((p) => [monthLabel(p.key, true), fmtR(p.total), p.count])}
          />
        </Card>
      )}

      {/* The next level down */}
      {breakdown.length > 1 && (
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>{!parent ? "By category" : "By subcategory"}</h2>
          {breakdown.map((b) => (
            <div key={b.key} {...pressable(() => onScope(b.go))} className="press" style={{ padding: "7px 0", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600 }}>
                  <Glyph codepoint={b.glyph.codepoint} alt={b.glyph.icon} size={16} />
                  {b.label}
                  <span style={{ color: "var(--faint)", fontSize: 11.5, fontWeight: 700 }}>{b.count}×</span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {fmt(b.total)} <span style={{ color: "var(--faint)" }}>›</span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--chart-grid)" }}>
                <div style={{ width: `${Math.max(2, (b.total / breakdownMax) * 100)}%`, height: "100%", borderRadius: 999, background: "var(--chart-accent)" }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* The expenses themselves */}
      <Card style={{ padding: "6px 14px 10px" }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: "10px 0 4px" }}>
          {rows.length ? "Expenses" : "No expenses here"}
        </h2>
        {[...byDay.entries()].map(([d, list]) => (
          <section key={d}>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 2px" }}>
              {dayLabel(d)}
            </p>
            {list.map((e, i) => (
              <div
                key={e.id}
                {...pressable(() => onOpenExpense(e))}
                aria-label={`${e.description}, ${fmt(e.amountCents)}`}
                className="press"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer" }}
              >
                <CategoryTile category={e.category} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.description}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    {categoryMeta(e.category).label} · {payerText(e)}
                  </p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
              </div>
            ))}
          </section>
        ))}
      </Card>
    </>
  );
}
