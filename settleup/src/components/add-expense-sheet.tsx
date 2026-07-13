"use client";

/**
 * Add Expense bottom sheet (design handoff "Add / Edit Expense", basic cut):
 * amount, description with auto-detected category (no manual picker,
 * ADR-0008), paid-by pills, split segmented Equal · Exact · Proportional
 * (defaulting Proportional per the design; falls back to equal when salaries
 * are missing), participant chips, live per-member shares with % of total.
 * Multi-payer and editing land in the full E4 pass.
 */

import { useMemo, useState } from "react";
import type { Repo } from "@/lib/data";
import {
  autoCategory,
  CATEGORY_META,
  computeSplit,
  fmt,
  parseCents,
  salaryFallsBackToEqual,
  splitsReconcile,
  type Cents,
  type Expense,
  type GroupMember,
  type SplitMethod,
} from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

type Method = Extract<SplitMethod, "equal" | "exact" | "salary">;

const centsToInput = (c: Cents) => (c / 100).toFixed(2).replace(".", ",");
const isoToDateInput = (iso: string) => iso.slice(0, 10);
const todayDateInput = () => new Date().toISOString().slice(0, 10);

export function AddExpenseSheet({
  open,
  onClose,
  onSaved,
  repo,
  groupId,
  members,
  meUserId,
  salaries,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  salaries: Record<string, Cents>; // memberId -> salary cents (0 = unknown)
  /** When set, the sheet edits this expense instead of creating one. */
  editing?: Expense | null;
}) {
  const meMember = members.find((m) => m.userId === meUserId);
  // Initial values come straight from `editing`; the parent passes a `key`
  // (expense id or "new") so switching targets remounts with fresh state.
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amountCents) : "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [date, setDate] = useState(editing ? isoToDateInput(editing.spentAt) : todayDateInput());
  const [payerId, setPayerId] = useState(
    editing?.payers[0]?.memberId ?? meMember?.id ?? members[0]?.id ?? ""
  );
  const [method, setMethod] = useState<Method>(() => {
    if (!editing) return "salary";
    // percent/shares expenses edit as exact amounts
    return editing.splitMethod === "exact" || editing.splitMethod === "equal" || editing.splitMethod === "salary"
      ? editing.splitMethod
      : "exact";
  });
  const [parts, setParts] = useState<string[]>(
    editing ? editing.splits.map((s) => s.memberId) : members.map((m) => m.id)
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    editing
      ? Object.fromEntries(editing.splits.map((s) => [s.memberId, centsToInput(s.shareCents)]))
      : {}
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = parseCents(amount);
  const category = autoCategory(desc);

  const memberName = (m: GroupMember) =>
    m.userId === meUserId ? "You" : m.placeholderName ?? "Member";

  const splits = useMemo(() => {
    if (total <= 0 || parts.length === 0) return [];
    if (method === "exact") {
      return parts.map((id) => ({ memberId: id, shareCents: parseCents(exact[id] ?? "") }));
    }
    return computeSplit(method, total, parts, { salaries });
  }, [method, total, parts, exact, salaries]);

  const exactRemaining = total - splits.reduce((a, s) => a + s.shareCents, 0);
  const proportionalFallsBack = method === "salary" && salaryFallsBackToEqual(parts, salaries);

  function toggleParticipant(id: string) {
    setParts((p) => (p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : [...p, id]));
  }

  function reset() {
    setAmount("");
    setDesc("");
    setDate(todayDateInput());
    setMethod("salary");
    setParts(members.map((m) => m.id));
    setExact({});
    setError("");
  }

  async function save() {
    setError("");
    if (total <= 0) {
      setError("Enter an amount");
      return;
    }
    if (!desc.trim()) {
      setError("What was it for?");
      return;
    }
    if (!splitsReconcile(total, splits)) {
      setError(
        method === "exact"
          ? `Shares must add up to the total (${exactRemaining > 0 ? fmt(exactRemaining) + " left" : fmt(-exactRemaining) + " over"})`
          : "Split doesn't add up — check the amounts"
      );
      return;
    }
    setBusy(true);
    try {
      // Keep the original time-of-day when editing; noon for new back-dated
      // entries so timezones can't shift the calendar day.
      const spentAt =
        editing && isoToDateInput(editing.spentAt) === date
          ? editing.spentAt
          : `${date}T12:00:00.000Z`;
      const input = {
        groupId,
        description: desc.trim(),
        category,
        amountCents: total,
        spentAt,
        // Proportional that fell back is stored as what it actually was.
        splitMethod: (method === "salary" && proportionalFallsBack ? "equal" : method) as SplitMethod,
        payers: [{ memberId: payerId, paidCents: total }],
        splits,
      };
      if (editing) await repo.updateExpense(editing.id, input);
      else await repo.createExpense(input);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={editing ? "Edit expense" : "Add expense"}
      headerRight={
        <button
          onClick={save}
          disabled={busy}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            padding: 4,
            opacity: busy ? 0.5 : 1,
          }}
        >
          Save
        </button>
      }
    >
      <Input value={amount} onChange={setAmount} placeholder="0,00" inputMode="decimal" prefix="R" autoFocus />
      <div style={{ height: 10 }} />
      <Input value={desc} onChange={setDesc} placeholder="What was it for?" />
      {desc.trim() && (
        <p style={{ fontSize: 12.5, marginTop: 8, color: "var(--muted)" }}>
          Category:{" "}
          <span style={{ color: CATEGORY_META[category].color, fontWeight: 700 }}>
            {CATEGORY_META[category].label}
          </span>{" "}
          (auto-detected)
        </p>
      )}
      <div style={{ height: 10 }} />
      <input
        type="date"
        value={date}
        max={todayDateInput()}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Expense date"
        style={{
          width: "100%",
          background: "var(--s2)",
          border: "1px solid var(--line2)",
          borderRadius: "var(--r-input)",
          color: "var(--ink)",
          colorScheme: "dark",
          fontSize: 15,
          fontWeight: 600,
          padding: "12px 16px",
          fontFamily: "inherit",
        }}
      />

      <div style={{ height: 18 }} />
      <Label>Paid by</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.map((m) => (
          <Pill key={m.id} active={payerId === m.id} onClick={() => setPayerId(m.id)}>
            {memberName(m)}
          </Pill>
        ))}
      </div>

      <div style={{ height: 18 }} />
      <Label>Split</Label>
      <div
        style={{
          display: "flex",
          background: "var(--s2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-input)",
          padding: 4,
          gap: 4,
        }}
      >
        {(
          [
            ["equal", "Equal"],
            ["exact", "Exact"],
            ["salary", "Proportional"],
          ] as [Method, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMethod(k)}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: method === k ? "var(--primary)" : "transparent",
              color: method === k ? "#fff" : "var(--muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {proportionalFallsBack && (
        <p style={{ fontSize: 12, color: "var(--amber)", marginTop: 8 }}>
          Splitting equally for now — proportional needs everyone&apos;s salary (Settings, later build).
        </p>
      )}

      <div style={{ height: 14 }} />
      {members
        .filter((m) => parts.includes(m.id))
        .map((m) => {
          const share = splits.find((s) => s.memberId === m.id)?.shareCents ?? 0;
          const pct = total > 0 ? Math.round((share / total) * 100) : 0;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderTop: "1px solid var(--line)",
                gap: 10,
              }}
            >
              <p style={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>{memberName(m)}</p>
              {method === "exact" ? (
                <div style={{ width: 130 }}>
                  <Input
                    value={exact[m.id] ?? ""}
                    onChange={(v) => setExact((e) => ({ ...e, [m.id]: v }))}
                    placeholder="0,00"
                    inputMode="decimal"
                    prefix="R"
                  />
                </div>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "var(--faint)",
                      background: "var(--s2)",
                      borderRadius: 999,
                      padding: "3px 8px",
                    }}
                  >
                    {pct}%
                  </span>
                  <p style={{ fontSize: 14.5, fontWeight: 700, minWidth: 84, textAlign: "right" }}>
                    {fmt(share)}
                  </p>
                </>
              )}
            </div>
          );
        })}
      {method === "exact" && total > 0 && (
        <p
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            marginTop: 6,
            color: exactRemaining === 0 ? "var(--green)" : "var(--red)",
          }}
        >
          {exactRemaining === 0
            ? "Adds up ✓"
            : exactRemaining > 0
              ? `${fmt(exactRemaining)} left to allocate`
              : `${fmt(-exactRemaining)} over`}
        </p>
      )}

      <div style={{ height: 14 }} />
      <Label>Who&apos;s in</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.map((m) => (
          <Pill key={m.id} active={parts.includes(m.id)} onClick={() => toggleParticipant(m.id)}>
            {memberName(m)}
          </Pill>
        ))}
      </div>

      <ErrorText>{error}</ErrorText>
      <div style={{ height: 16 }} />
      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : editing ? "Save changes" : "Save expense"}
      </Button>
    </Sheet>
  );
}
