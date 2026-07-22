"use client";

/**
 * Excel export (scope §6.11, design "Reports → Export"): one tap produces an
 * .xlsx with every expense (date, description, category, amount, payer(s),
 * split method, each person's share) plus a Summary sheet with category and
 * per-person totals. Amounts are exported in Rands (decimal) so Excel can sum
 * them; the app itself never computes in floats — this is display/export only.
 *
 * SheetJS is dynamically imported so the ~400KB library only loads on demand.
 */

import { categoryMeta, type Expense, type GroupMember, type Settlement } from "./domain";

const METHOD_LABEL: Record<string, string> = {
  equal: "Equal",
  exact: "Exact amounts",
  salary: "Proportional (salary)",
  percent: "Percentage",
  shares: "Shares",
};

const rands = (cents: number) => Math.round(cents) / 100;

export async function exportExpensesXlsx(opts: {
  groupName: string;
  expenses: Expense[];
  settlements: Settlement[];
  members: GroupMember[];
  meUserId: string;
  memberName: (memberId: string) => string;
  /** Appended to the filename, e.g. a filter label like "Jun · Groceries". */
  labelSuffix?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");
  const { expenses, settlements, members, memberName, groupName } = opts;

  // --- Sheet 1: every expense, oldest first ---
  const rows = [...expenses]
    .sort((a, b) => a.spentAt.localeCompare(b.spentAt))
    .map((e) => {
      const cm = categoryMeta(e.category);
      const row: Record<string, string | number> = {
        Date: e.spentAt.slice(0, 10),
        Description: e.description,
        Category: cm.parentLabel,
        Subcategory: cm.label,
        "Amount (R)": rands(e.amountCents),
        "Paid by": e.payers.map((p) => `${memberName(p.memberId)} ${rands(p.paidCents)}`).join(", "),
        Split: METHOD_LABEL[e.splitMethod] ?? e.splitMethod,
      };
      for (const m of members) {
        const share = e.splits.find((s) => s.memberId === m.id)?.shareCents ?? 0;
        row[`${memberName(m.id)} share (R)`] = rands(share);
      }
      if (e.note) row.Note = e.note;
      return row;
    });

  // --- Sheet 2: summary — parent-category totals + per-person paid/share/net ---
  const catTotals = new Map<string, number>();
  for (const e of expenses) {
    const parentLabel = categoryMeta(e.category).parentLabel;
    catTotals.set(parentLabel, (catTotals.get(parentLabel) ?? 0) + e.amountCents);
  }
  const summary: Record<string, string | number>[] = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, cents]) => ({
      Section: "Category totals",
      Item: label,
      "Amount (R)": rands(cents),
    }));

  for (const m of members) {
    const paid = expenses.reduce(
      (a, e) => a + e.payers.filter((p) => p.memberId === m.id).reduce((x, p) => x + p.paidCents, 0),
      0
    );
    const share = expenses.reduce(
      (a, e) => a + (e.splits.find((s) => s.memberId === m.id)?.shareCents ?? 0),
      0
    );
    const settledOut = settlements
      .filter((s) => s.fromMemberId === m.id)
      .reduce((a, s) => a + s.amountCents, 0);
    const settledIn = settlements
      .filter((s) => s.toMemberId === m.id)
      .reduce((a, s) => a + s.amountCents, 0);
    summary.push({
      Section: "Per person",
      Item: memberName(m.id),
      "Paid (R)": rands(paid),
      "Share (R)": rands(share),
      "Settled paid (R)": rands(settledOut),
      "Settled received (R)": rands(settledIn),
      "Net (R)": rands(paid - share + settledOut - settledIn),
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Expenses");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = opts.labelSuffix ? ` ${opts.labelSuffix.replace(/[^\w\s·-]/g, "")}` : "";
  XLSX.writeFile(wb, `Tally ${groupName}${suffix} ${stamp}.xlsx`);
}
