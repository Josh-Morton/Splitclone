"use client";

/**
 * Reports (Phase 20 — Reporting v2; ADR-0021 for the charts).
 *
 * Top to bottom: summary, insights, a 12-month trend, the within-month pace,
 * categories with their own small trends, the biggest expenses and the
 * "regulars", and who paid what. Every number drills down — via the
 * `ReportDrill` view — to the expenses behind it.
 *
 * All figures come from `src/lib/reports.ts` (pure, unit-tested); this file
 * only lays them out. The Phase 6 filter row still scopes everything, and the
 * export still uses exactly the filtered set, so it matches the screen.
 */

import { useState } from "react";
import { CollapsingHeader } from "./collapsing-header";
import { Glyph } from "./category-icon";
import {
  CATEGORY_META,
  fmt,
  fmtR,
  parentOf,
  type Expense,
  type GroupMember,
  type ParentCategory,
  type Settlement,
} from "@/lib/domain";
import { exportExpensesXlsx } from "@/lib/export";
import { DEFAULT_FILTERS, filtersLabel, isDefault, type ReportFilters } from "@/lib/report-filters";
import {
  addMonths,
  averageOfNonEmpty,
  biggest,
  categoryRollup,
  dayOf,
  daysInMonth,
  focusBounds,
  inBounds,
  insights,
  monthLabel,
  monthOf,
  monthSeries,
  paceSeries,
  previousBounds,
  previousLabel,
  regulars,
  sumCents,
  summarise,
  trendWindow,
  withoutDate,
  type DrillScope,
} from "@/lib/reports";
import { Avatar, memberDisplayName } from "./avatar";
import { MonthColumns } from "./charts/month-columns";
import { NumbersTable } from "./charts/numbers-table";
import { PaceLines } from "./charts/pace-lines";
import { Sparkline } from "./charts/sparkline";
import { CategoryTile } from "./expenses-tab";
import { ReportDrill } from "./report-drill";
import { ReportFilterSheet } from "./report-filter-sheet";
import { Card, pressable } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");

export function ReportsTab({
  groupName,
  expenses,
  settlements,
  members,
  meUserId,
  onOpenExpense,
}: {
  groupName: string;
  expenses: Expense[];
  settlements: Settlement[];
  members: GroupMember[];
  meUserId: string;
  onOpenExpense: (e: Expense) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [scope, setScopeState] = useState<DrillScope | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const setScope = (s: DrillScope | null) => {
    setScopeState(s);
    // Land at the top of the new level, where its breadcrumb is.
    window.scrollTo({ top: 0 });
  };

  const memberName = (id: string) => memberDisplayName(members.find((m) => m.id === id), meUserId);
  const categoryLabel = (c: ParentCategory) => CATEGORY_META[c].label;

  // --- slices ---------------------------------------------------------------
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const base = withoutDate(expenses, filters); // person + category, all dates
  const fb = focusBounds(filters, now);
  const pb = previousBounds(filters, now);
  const focus = base.filter((e) => inBounds(e, fb)); // == the Phase 6 filtered set
  const previous = pb ? base.filter((e) => inBounds(e, pb)) : null;
  const label = filtersLabel(filters, memberName, categoryLabel);
  const { short: prevShort } = previousLabel(filters.range);

  // --- figures --------------------------------------------------------------
  const summary = summarise(focus);
  const prevTotal = previous ? sumCents(previous) : null;

  const latest = base.reduce<string | null>((m, e) => {
    const k = monthOf(dayOf(e));
    return !m || k > m ? k : m;
  }, null);
  let endMonth = fb.to ? monthOf(fb.to) : (latest ?? currentMonth);
  if (endMonth > currentMonth) endMonth = currentMonth; // "this year" runs to December
  const win = trendWindow(base, endMonth);
  const months = monthSeries(base, win.start, win.end);
  const focusFrom = fb.from ? monthOf(fb.from) : "0000-01";
  const focusTo = fb.to ? monthOf(fb.to) : "9999-12";
  const isFocusMonth = (k: string) => k >= focusFrom && k <= focusTo;
  const average = averageOfNonEmpty(months);
  const sel = months.find((m) => m.key === selectedMonth) ?? months.find((m) => m.key === endMonth) ?? months[months.length - 1];

  const paceMonth =
    filters.range === "this_month" ? currentMonth : filters.range === "last_month" ? addMonths(currentMonth, -1) : null;
  const pace = paceMonth
    ? (() => {
        const prevKey = addMonths(paceMonth, -1);
        const prev = paceSeries(base, prevKey);
        return {
          month: paceMonth,
          prevKey,
          current: paceSeries(base, paceMonth, filters.range === "this_month" ? now.getDate() : undefined),
          previous: (prev.at(-1) ?? 0) > 0 ? prev : null,
        };
      })()
    : null;

  const rollup = categoryRollup(focus, previous);
  const sparkStart = addMonths(endMonth, -5);
  const sparks = new Map(
    rollup.map((r) => [
      r.parent,
      monthSeries(
        base.filter((e) => parentOf(e.category) === r.parent),
        sparkStart,
        endMonth
      ).map((p) => p.total),
    ])
  );
  const regs = regulars(focus).slice(0, 5);
  const regAll = regulars(base);
  const big = biggest(focus, 5);
  const monthsWithSpend = new Set(focus.map((e) => monthOf(dayOf(e)))).size;
  const notes = insights({ range: filters.range, focus, previous, rollup, categoryLabel, monthsWithSpend });

  const perMember = members.map((m) => ({
    member: m,
    paid: focus.reduce((a, e) => a + e.payers.filter((p) => p.memberId === m.id).reduce((x, p) => x + p.paidCents, 0), 0),
    share: focus.reduce((a, e) => a + (e.splits.find((s) => s.memberId === m.id)?.shareCents ?? 0), 0),
  }));

  async function doExport() {
    setExporting(true);
    setError("");
    try {
      await exportExpensesXlsx({ groupName, expenses: focus, settlements, members, meUserId, memberName, labelSuffix: label });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const sectionTitle = (t: string) => <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>{t}</h2>;
  const delta = (cents: number | null, vs: string) =>
    cents === null ? null : cents === 0 ? `Same as ${vs}` : `${cents > 0 ? "▲" : "▼"} ${fmtR(Math.abs(cents))} ${cents > 0 ? "more" : "less"} than ${vs}`;

  return (
    <>
      <CollapsingHeader
        title="Reports"
        subtitle={`${label} · ${groupName}`}
        right={
          <button
            onClick={doExport}
            disabled={exporting || focus.length === 0}
            className="press"
            style={{
              background: "var(--accentbg)",
              border: "1px solid var(--primary)",
              borderRadius: 999,
              color: "var(--primary)",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 14px",
              cursor: "pointer",
              opacity: exporting || focus.length === 0 ? 0.55 : 1,
            }}
          >
            {exporting ? "Exporting…" : "Export ⬇"}
          </button>
        }
      />
      <div style={{ height: 12 }} />

      {/* The one filter row — scopes everything below it, drill included. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setFilterOpen(true)}
          className="press"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: isDefault(filters) ? "var(--s2)" : "var(--accentbg)",
            border: `1px solid ${isDefault(filters) ? "var(--line)" : "var(--primary)"}`,
            borderRadius: 999,
            padding: "10px 16px",
            cursor: "pointer",
            color: isDefault(filters) ? "var(--muted)" : "var(--primary)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span aria-hidden>⚲</span>
          <span style={{ flex: 1, textAlign: "left" }}>{isDefault(filters) ? "This month · Filter" : label}</span>
        </button>
        {!isDefault(filters) && (
          <button
            aria-label="Clear filters"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, categories: new Set() })}
            className="press"
            style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 999, padding: "0 14px", color: "var(--muted)", fontWeight: 800, cursor: "pointer" }}
          >
            ✕
          </button>
        )}
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

      {scope ? (
        <ReportDrill
          scope={scope}
          onScope={setScope}
          base={base}
          focus={fb}
          previous={pb}
          previousShort={prevShort}
          focusTotal={summary.total}
          focusLabel={label}
          endMonth={endMonth}
          isFocusMonth={isFocusMonth}
          regularLabel={(k) => regAll.find((r) => r.key === k)?.label ?? k}
          members={members}
          meUserId={meUserId}
          onOpenExpense={onOpenExpense}
        />
      ) : base.length === 0 ? (
        <Card style={{ padding: 18 }}>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            No expenses {isDefault(filters) ? "yet" : "match these filters"} — once there are some, your trends and
            breakdowns appear here.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary: the one hero figure, then two supporting tiles. */}
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>Spent · {label}</p>
            <p style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-1.2px", margin: "2px 0 4px" }}>{fmt(summary.total)}</p>
            {prevTotal !== null && (
              <p style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{delta(summary.total - prevTotal, prevShort)}</p>
            )}
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Card style={{ padding: 14 }}>
              <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Expenses</p>
              <p style={{ fontSize: 22, fontWeight: 800, margin: "2px 0" }}>{summary.count}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>{summary.count ? `avg ${fmtR(summary.average)} each` : "—"}</p>
            </Card>
            <div
              {...pressable(summary.biggest ? () => onOpenExpense(summary.biggest!) : undefined)}
              className={summary.biggest ? "press" : undefined}
              style={{ cursor: summary.biggest ? "pointer" : "default" }}
            >
              <Card style={{ padding: 14, height: "100%" }}>
                <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Biggest</p>
                <p style={{ fontSize: 22, fontWeight: 800, margin: "2px 0" }}>{summary.biggest ? fmtR(summary.biggest.amountCents) : "—"}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {summary.biggest?.description ?? ""}
                </p>
              </Card>
            </div>
          </div>

          {/* Insights — the "what's interesting" sentences */}
          <Card style={{ padding: "8px 16px", marginBottom: 16 }}>
            {notes.map((n, i) => (
              <div
                key={i}
                {...pressable(n.scope ? () => setScope(n.scope!) : undefined)}
                className={n.scope ? "press" : undefined}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "9px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                  cursor: n.scope ? "pointer" : "default",
                }}
              >
                <span aria-hidden style={{ color: "var(--primary)", fontWeight: 900, lineHeight: "20px" }}>✦</span>
                <p style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45 }}>{n.text}</p>
                {n.scope && <span aria-hidden style={{ color: "var(--faint)", lineHeight: "20px" }}>›</span>}
              </div>
            ))}
          </Card>

          {/* Monthly trend: 12-month window, focus months emphasised */}
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>Monthly spend</h2>
            <p style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 6 }}>
              Last {months.length} months · {filters.range === "all" ? "all highlighted" : `${label.split(" · ")[0].toLowerCase()} highlighted`}
            </p>
            <p aria-live="polite" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, minHeight: 18 }}>
              <span style={{ color: "var(--ink)", fontWeight: 800 }}>{monthLabel(sel.key, true)}</span> ·{" "}
              <span style={{ color: "var(--ink)", fontWeight: 800 }}>{fmtR(sel.total)}</span> · {sel.count} expense
              {sel.count === 1 ? "" : "s"}
              {sel.count > 0 && (
                <button
                  onClick={() => setScope({ month: sel.key })}
                  className="hit"
                  style={{ marginLeft: 10, background: "none", border: "none", padding: 0, color: "var(--primary)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
                >
                  See expenses ›
                </button>
              )}
            </p>
            <MonthColumns
              points={months}
              isFocus={isFocusMonth}
              selected={sel.key}
              onSelect={setSelectedMonth}
              onActivate={(k) => setScope({ month: k })}
              average={average}
              label="Monthly spend"
            />
            <NumbersTable
              caption="Monthly spend"
              columns={["Month", "Spent", "Expenses"]}
              rows={months.map((p) => [monthLabel(p.key, true), fmtR(p.total), p.count])}
            />
          </Card>

          {/* Spending pace — single-month ranges only */}
          {pace && (
            <Card style={{ padding: 16, marginBottom: 16 }}>
              <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>Spending pace</h2>
              <p style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 6 }}>
                Running total through the month, against {monthLabel(pace.prevKey)}
              </p>
              <PaceLines
                key={pace.month}
                current={pace.current}
                previous={pace.previous}
                days={daysInMonth(pace.month)}
                currentLabel={monthLabel(pace.month)}
                previousLabel={monthLabel(pace.prevKey)}
              />
              <NumbersTable
                caption="Spending pace"
                columns={["Day", monthLabel(pace.month), monthLabel(pace.prevKey)]}
                rows={Array.from({ length: daysInMonth(pace.month) }, (_, i) => i)
                  .filter((i) => (i + 1) % 5 === 0 || i === daysInMonth(pace.month) - 1)
                  .map((i) => [
                    i + 1,
                    i < pace.current.length ? fmtR(pace.current[i]) : "—",
                    pace.previous ? fmtR(pace.previous[Math.min(i, pace.previous.length - 1)]) : "—",
                  ])}
              />
            </Card>
          )}

          {/* Categories — each with its own six-month trend (small multiples) */}
          <Card style={{ padding: 16, marginBottom: 16 }}>
            {sectionTitle("Where it went")}
            {rollup.length === 0 && <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Nothing in this range.</p>}
            {rollup.map((r) => {
              const meta = CATEGORY_META[r.parent];
              return (
                <div
                  key={r.parent}
                  {...pressable(() => setScope({ parent: r.parent }))}
                  aria-label={`${meta.label}, ${fmt(r.total)}, ${Math.round(r.share * 100)}% — see expenses`}
                  className="press"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600 }}>
                        <Glyph codepoint={meta.codepoint} alt={meta.icon} size={16} />
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{fmt(r.total)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--chart-grid)" }}>
                        <div style={{ width: `${Math.max(2, r.share * 100)}%`, height: "100%", borderRadius: 999, background: "var(--chart-accent)" }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, minWidth: 30, textAlign: "right" }}>
                        {Math.round(r.share * 100)}%
                      </span>
                      {r.delta !== null && r.delta !== 0 && (
                        <span style={{ fontSize: 11.5, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.delta > 0 ? "▲" : "▼"} {fmtR(Math.abs(r.delta))}
                        </span>
                      )}
                    </div>
                  </div>
                  <Sparkline values={sparks.get(r.parent) ?? []} focusIndex={5} />
                  <span aria-hidden style={{ color: "var(--faint)" }}>›</span>
                </div>
              );
            })}
            {rollup.length > 0 && (
              <p style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8 }}>
                Bars: share of {label.split(" · ")[0].toLowerCase()}. Mini charts: the last 6 months. ▲▼ vs {prevShort || "—"}.
              </p>
            )}
          </Card>

          {/* Biggest expenses */}
          {big.length > 0 && (
            <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
              {sectionTitle("Biggest expenses")}
              {big.map((e, i) => (
                <div
                  key={e.id}
                  {...pressable(() => onOpenExpense(e))}
                  className="press"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer" }}
                >
                  <CategoryTile category={e.category} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.description}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(e.spentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
                </div>
              ))}
            </Card>
          )}

          {/* Regulars — things bought again and again */}
          {regs.length > 0 && (
            <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
              {sectionTitle("Regulars")}
              {regs.map((r, i) => (
                <div
                  key={r.key}
                  {...pressable(() => setScope({ regular: r.key }))}
                  className="press"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer" }}
                >
                  <p style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.label}
                  </p>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{r.count}×</span>
                  <p style={{ fontSize: 14, fontWeight: 700, minWidth: 84, textAlign: "right" }}>{fmt(r.total)}</p>
                  <span aria-hidden style={{ color: "var(--faint)" }}>›</span>
                </div>
              ))}
            </Card>
          )}

          {/* Who paid what */}
          <Card style={{ padding: 16 }}>
            {sectionTitle("Who paid what")}
            {perMember.map(({ member, paid, share }) => (
              <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
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
      )}

      <ReportFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          // The drill stays where it is — filters scope it too.
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
