"use client";

/**
 * Add Expense bottom sheet (design handoff "Add / Edit Expense", basic cut):
 * amount, description with auto-detected category (no manual picker,
 * ADR-0008), paid-by pills, split segmented Equal · Exact · Proportional
 * (defaulting Proportional per the design; falls back to equal when salaries
 * are missing), participant chips, live per-member shares with % of total.
 * Multi-payer and editing land in the full E4 pass.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Repo } from "@/lib/data";
import {
  autoCategory,
  categoryMeta,
  fmt,
  parseCents,
  splitEqual,
  splitsReconcile,
  type Category,
  type Expense,
  type ExpenseSplit,
  type GroupMember,
  type SplitMethod,
} from "@/lib/domain";
import { CategoryPickerSheet } from "./category-picker-sheet";
import { Button, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

type Method = Extract<SplitMethod, "equal" | "exact" | "salary">;

/** Sun–Sat labels indexed by Date.getDay() (0–6). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");
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
  editing = null,
  draft = null,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  /** When set, the sheet edits this expense instead of creating one. */
  editing?: Expense | null;
  /** Prefill for a new expense (cart→expense). Ignored when editing. */
  draft?: { amountCents: number | null; description: string; note: string } | null;
}) {
  const meMember = members.find((m) => m.userId === meUserId);
  // Initial values come straight from `editing`/`draft`; the parent passes a
  // `key` (expense id / "cart" / "new") so switching targets remounts fresh.
  const [amount, setAmount] = useState(
    editing ? centsToInput(editing.amountCents) : draft?.amountCents ? centsToInput(draft.amountCents) : ""
  );
  const [desc, setDesc] = useState(editing?.description ?? draft?.description ?? "");
  const [date, setDate] = useState(editing ? isoToDateInput(editing.spentAt) : todayDateInput());
  const [payerId, setPayerId] = useState(
    editing?.payers[0]?.memberId ?? meMember?.id ?? members[0]?.id ?? ""
  );
  const [multiPayer, setMultiPayer] = useState((editing?.payers.length ?? 0) > 1);
  const [paidBy, setPaidBy] = useState<Record<string, string>>(() =>
    editing && editing.payers.length > 1
      ? Object.fromEntries(editing.payers.map((p) => [p.memberId, centsToInput(p.paidCents)]))
      : {}
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
  // "Repeats monthly" (new expenses only): also creates a recurring rule with
  // the split shown at save time locked in verbatim (Josh, Phase 6).
  const [repeats, setRepeats] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<"weekly" | "monthly">("monthly");
  const [repeatDom, setRepeatDom] = useState(String(new Date().getDate())); // day-of-month
  const [repeatDow, setRepeatDow] = useState(new Date().getDay()); // day-of-week 0–6
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = parseCents(amount);
  // Category auto-detects from the description unless the user overrides it
  // (ADR-0011). Editing seeds the override with the stored value.
  const [categoryOverride, setCategoryOverride] = useState<Category | null>(
    editing ? editing.category : null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const category: Category = categoryOverride ?? autoCategory(desc);
  const catMeta = categoryMeta(category);

  const memberName = (m: GroupMember) =>
    m.userId === meUserId ? "You" : m.profileName || m.placeholderName || "Member";

  // Salary-proportional shares come from the server (ADR-0010: salaries never
  // leave the database). Debounced; null = someone has no salary -> equal.
  const [salaryShares, setSalaryShares] = useState<ExpenseSplit[] | null>(null);
  const salaryReq = useRef(0);
  const partsKey = parts.join(",");
  useEffect(() => {
    if (!open || method !== "salary" || total <= 0 || parts.length === 0) return;
    const reqId = ++salaryReq.current;
    const timer = setTimeout(async () => {
      try {
        const shares = await repo.getSalaryShares(groupId, total, parts);
        if (salaryReq.current === reqId) setSalaryShares(shares);
      } catch {
        if (salaryReq.current === reqId) setSalaryShares(null);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parts tracked via partsKey
  }, [open, method, total, partsKey, groupId, repo]);

  const splits = useMemo(() => {
    if (total <= 0 || parts.length === 0) return [];
    if (method === "exact") {
      return parts.map((id) => ({ memberId: id, shareCents: parseCents(exact[id] ?? "") }));
    }
    if (method === "salary") {
      const valid =
        salaryShares &&
        salaryShares.length === parts.length &&
        parts.every((id) => salaryShares.some((s) => s.memberId === id)) &&
        salaryShares.reduce((a, s) => a + s.shareCents, 0) === total;
      return valid ? salaryShares : splitEqual(total, parts);
    }
    return splitEqual(total, parts);
  }, [method, total, parts, exact, salaryShares]);

  const exactRemaining = total - splits.reduce((a, s) => a + s.shareCents, 0);
  const proportionalFallsBack = method === "salary" && total > 0 && salaryShares === null;

  const payers = multiPayer
    ? members
        .map((m) => ({ memberId: m.id, paidCents: parseCents(paidBy[m.id] ?? "") }))
        .filter((p) => p.paidCents > 0)
    : [{ memberId: payerId, paidCents: total }];
  const paidRemaining = total - payers.reduce((a, p) => a + p.paidCents, 0);

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
    setMultiPayer(false);
    setPaidBy({});
    setRepeats(false);
    setRepeatFreq("monthly");
    setRepeatDom(String(new Date().getDate()));
    setRepeatDow(new Date().getDay());
    setCategoryOverride(null);
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
    if (multiPayer && paidRemaining !== 0) {
      setError(
        `Payments must add up to the total (${paidRemaining > 0 ? fmt(paidRemaining) + " left" : fmt(-paidRemaining) + " over"})`
      );
      return;
    }
    setBusy(true);
    try {
      // New expenses are stamped "now" (no date field — Josh, Phase 6 quick
      // win); editing keeps the original time unless the date was changed,
      // in which case noon prevents timezones shifting the calendar day.
      const spentAt = !editing
        ? new Date().toISOString()
        : isoToDateInput(editing.spentAt) === date
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
        payers,
        splits,
        note: editing ? editing.note : (draft?.note ?? null),
      };
      if (editing) {
        await repo.updateExpense(editing.id, input);
      } else {
        await repo.createExpense(input);
        // Lock the split shown right now into a recurring rule, if requested.
        if (repeats && !multiPayer) {
          await repo.createRecurring({
            groupId,
            description: desc.trim(),
            amountCents: total,
            frequency: repeatFreq,
            anchor:
              repeatFreq === "weekly"
                ? repeatDow
                : Math.max(1, Math.min(28, parseInt(repeatDom) || 1)),
            payerMemberId: payerId,
            splitMethod: "exact",
            participantMemberIds: parts,
            fixedShares: splits,
          });
        }
      }
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
      <button
        onClick={() => setPickerOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          background: `${catMeta.color}1f`,
          border: `1px solid ${catMeta.color}`,
          borderRadius: 999,
          padding: "7px 12px",
          cursor: "pointer",
          color: catMeta.color,
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span>{catMeta.icon}</span>
        <span>
          {catMeta.parentLabel}
          <span style={{ opacity: 0.85 }}> · {catMeta.label}</span>
        </span>
        <span style={{ color: "var(--faint)", fontSize: 11, fontWeight: 600 }}>
          {categoryOverride ? "· tap to change" : "· auto · tap to change"}
        </span>
      </button>
      {editing && (
        <>
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
        </>
      )}

      <div style={{ height: 18 }} />
      <Label>Paid by</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.map((m) => (
          <Pill
            key={m.id}
            active={!multiPayer && payerId === m.id}
            onClick={() => {
              setMultiPayer(false);
              setPayerId(m.id);
            }}
          >
            {memberName(m)}
          </Pill>
        ))}
        <Pill active={multiPayer} onClick={() => setMultiPayer(true)}>
          Multiple
        </Pill>
      </div>
      {multiPayer && (
        <div style={{ marginTop: 10 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}
            >
              <p style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{memberName(m)}</p>
              <div style={{ width: 130 }}>
                <Input
                  value={paidBy[m.id] ?? ""}
                  onChange={(v) => setPaidBy((p) => ({ ...p, [m.id]: v }))}
                  placeholder="0,00"
                  inputMode="decimal"
                  prefix="R"
                />
              </div>
            </div>
          ))}
          {total > 0 && (
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                marginTop: 4,
                color: paidRemaining === 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {paidRemaining === 0
                ? "Adds up ✓"
                : paidRemaining > 0
                  ? `${fmt(paidRemaining)} left to assign`
                  : `${fmt(-paidRemaining)} over`}
            </p>
          )}
        </div>
      )}

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
          Splitting equally for now — proportional needs every participant to have a salary set
          (in Settings), and doesn&apos;t work with placeholder members.
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

      {!editing && !multiPayer && (
        <>
          <div style={{ height: 16 }} />
          <button
            onClick={() => setRepeats((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--s2)",
              border: `1px solid ${repeats ? "var(--primary)" : "var(--line)"}`,
              borderRadius: "var(--r-input)",
              padding: "13px 16px",
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, textAlign: "left" }}>
              Repeating expense
              <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", fontWeight: 500 }}>
                Locks in this exact split, generated automatically
              </span>
            </span>
            <span
              role="switch"
              aria-checked={repeats}
              style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                background: repeats ? "var(--primary)" : "var(--s3)",
                position: "relative",
                flexShrink: 0,
                transition: "background .16s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: repeats ? 20 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .16s",
                }}
              />
            </span>
          </button>
          {repeats && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <Pill active={repeatFreq === "weekly"} onClick={() => setRepeatFreq("weekly")}>
                  Weekly
                </Pill>
                <Pill active={repeatFreq === "monthly"} onClick={() => setRepeatFreq("monthly")}>
                  Monthly
                </Pill>
              </div>
              {repeatFreq === "weekly" ? (
                <>
                  <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Every</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {WEEKDAYS.map((label, i) => (
                      <Pill key={i} active={repeatDow === i} onClick={() => setRepeatDow(i)}>
                        {label}
                      </Pill>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>on day</span>
                  <div style={{ width: 84 }}>
                    <Input
                      value={repeatDom}
                      onChange={(v) => setRepeatDom(v.replace(/\D/g, ""))}
                      inputMode="numeric"
                      placeholder="1"
                      center
                    />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>of each month (1–28)</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <div style={{ height: 16 }} />
      <Button onClick={save} disabled={busy}>
        {busy
          ? "Saving…"
          : editing
            ? "Save changes"
            : repeats && !multiPayer
              ? "Save & repeat"
              : "Save expense"}
      </Button>

      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={category}
        onPick={(slug) => {
          setCategoryOverride(slug);
          setPickerOpen(false);
        }}
      />
    </Sheet>
  );
}
