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
  type GroupMember,
  type SplitMethod,
} from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

type Method = Extract<SplitMethod, "equal" | "exact" | "salary">;

export function AddExpenseSheet({
  open,
  onClose,
  onSaved,
  repo,
  groupId,
  members,
  meUserId,
  salaries,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  salaries: Record<string, Cents>; // memberId -> salary cents (0 = unknown)
}) {
  const meMember = members.find((m) => m.userId === meUserId);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [payerId, setPayerId] = useState(meMember?.id ?? members[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("salary");
  const [parts, setParts] = useState<string[]>(members.map((m) => m.id));
  const [exact, setExact] = useState<Record<string, string>>({});
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
      await repo.createExpense({
        groupId,
        description: desc.trim(),
        category,
        amountCents: total,
        spentAt: new Date().toISOString(),
        // Proportional that fell back is stored as what it actually was.
        splitMethod: method === "salary" && proportionalFallsBack ? "equal" : method,
        payers: [{ memberId: payerId, paidCents: total }],
        splits,
      });
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
      title="Add expense"
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
        {busy ? "Saving…" : "Save expense"}
      </Button>
    </Sheet>
  );
}
