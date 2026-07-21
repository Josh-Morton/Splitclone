"use client";

/**
 * Report filter sheet (Phase 6): date range presets + custom, person, and
 * multi-select category. Edits a draft locally; applies on "Show results".
 */

import { useState } from "react";
import { CATEGORY_META, PARENT_CATEGORIES, type GroupMember, type ParentCategory } from "@/lib/domain";
import {
  DEFAULT_FILTERS,
  type RangePreset,
  type ReportFilters,
} from "@/lib/report-filters";
import { memberDisplayName } from "./avatar";
import { Button, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

const RANGES: [RangePreset, string][] = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["last_3_months", "Last 3 months"],
  ["this_year", "This year"],
  ["all", "All time"],
  ["custom", "Custom"],
];

export function ReportFilterSheet({
  open,
  onClose,
  onApply,
  filters,
  members,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (f: ReportFilters) => void;
  filters: ReportFilters;
  members: GroupMember[];
  meUserId: string;
}) {
  const [draft, setDraft] = useState<ReportFilters>(filters);

  // Re-seed the draft each time the sheet opens from the live filters.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setDraft({ ...filters, categories: new Set(filters.categories) });
  }
  if (!open && seenOpen) setSeenOpen(false);

  const toggleCategory = (c: ParentCategory) =>
    setDraft((d) => {
      const next = new Set(d.categories);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { ...d, categories: next };
    });

  return (
    <Sheet open={open} onClose={onClose} title="Filter reports">
      <Label>Date range</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {RANGES.map(([k, label]) => (
          <Pill key={k} active={draft.range === k} onClick={() => setDraft((d) => ({ ...d, range: k }))}>
            {label}
          </Pill>
        ))}
      </div>
      {draft.range === "custom" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>From</span>
            <Input
              value={draft.customFrom}
              onChange={(v) => setDraft((d) => ({ ...d, customFrom: v }))}
              type="date"
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>To</span>
            <Input
              value={draft.customTo}
              onChange={(v) => setDraft((d) => ({ ...d, customTo: v }))}
              type="date"
            />
          </div>
        </div>
      )}

      <div style={{ height: 18 }} />
      <Label>Person</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill active={draft.memberId === null} onClick={() => setDraft((d) => ({ ...d, memberId: null }))}>
          Everyone
        </Pill>
        {members.map((m) => (
          <Pill
            key={m.id}
            active={draft.memberId === m.id}
            onClick={() => setDraft((d) => ({ ...d, memberId: m.id }))}
          >
            {memberDisplayName(m, meUserId)}
          </Pill>
        ))}
      </div>

      <div style={{ height: 18 }} />
      <Label>Categories {draft.categories.size > 0 ? `(${draft.categories.size})` : "(all)"}</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PARENT_CATEGORIES.map((c) => (
          <Pill key={c} active={draft.categories.has(c)} onClick={() => toggleCategory(c)}>
            {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
          </Pill>
        ))}
      </div>

      <div style={{ height: 20 }} />
      <Button onClick={() => onApply(draft)}>Show results</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={() => onApply({ ...DEFAULT_FILTERS, categories: new Set() })}>
        Reset filters
      </Button>
    </Sheet>
  );
}
