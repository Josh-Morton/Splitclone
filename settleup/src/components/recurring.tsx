"use client";

/**
 * Recurring bills (design "Recurring" screen + "New recurring" sheet):
 * explainer, dashed "New recurring bill" button, rule cards with
 * "Monthly · <payer> pays", amount, next-run date (or "Paused"), and
 * Pause/Resume + "Add now" (generates immediately, advances next-run).
 * Sheet: amount, description, payer pills, Equal/Proportional split,
 * "repeats monthly on day N".
 */

import { useState } from "react";
import type { NewRecurringInput, Repo } from "@/lib/data";
import { fmt, parseCents, type GroupMember, type RecurringExpense } from "@/lib/domain";
import { WEEKDAYS } from "./add-expense-sheet";
import { memberDisplayName } from "./avatar";
import { CategoryTile } from "./expenses-tab";
import { Button, Card, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

export function RecurringOverlay({
  open,
  onClose,
  onChanged,
  repo,
  groupId,
  members,
  meUserId,
  rules,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: (msg: string) => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  rules: RecurringExpense[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const name = (memberId: string) =>
    memberDisplayName(members.find((m) => m.id === memberId), meUserId);

  async function act(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      onChanged(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }

  const shortDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.getDate() + " " + d.toLocaleDateString("en-ZA", { month: "short" });
  };
  const nextRunLabel = (r: RecurringExpense) => (r.paused ? "Paused" : "Next · " + shortDate(r.nextRun));

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 45, background: "var(--shell-gradient)", overflowY: "auto" }}
    >
      <div style={{ maxWidth: 430, margin: "0 auto", padding: "max(env(safe-area-inset-top), 24px) 18px 40px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <button
            onClick={onClose}
            aria-label="Back"
            style={{
              background: "var(--s2)",
              border: "1px solid var(--line2)",
              borderRadius: 999,
              color: "var(--ink)",
              fontSize: 15,
              fontWeight: 700,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            ‹ Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>Recurring bills</h1>
        </header>

        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
          Bills like rent and fibre repeat monthly — set them up once and the expense appears on
          schedule, split the way you chose.
        </p>

        <button
          onClick={() => setSheetOpen(true)}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "var(--r-card)",
            border: "2px dashed var(--line2)",
            background: "transparent",
            color: "var(--primary)",
            fontSize: 14.5,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          + New recurring bill
        </button>

        {rules.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--faint)" }}>No recurring bills yet.</p>
        )}

        {rules.map((r) => (
          <Card key={r.id} style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CategoryTile category={r.category} />
              <p style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700 }}>{r.description}</p>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 14.5, fontWeight: 800 }}>{fmt(r.amountCents ?? 0)}</p>
                <p
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: r.paused ? "var(--amber)" : "var(--faint)",
                  }}
                >
                  {nextRunLabel(r)}
                </p>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 12px" }}>
              {r.frequency === "weekly"
                ? `Every ${WEEKDAYS[r.anchor] ?? "week"}`
                : `Monthly on day ${r.anchor}`}{" "}
              · {name(r.payerMemberId)} {name(r.payerMemberId) === "You" ? "pay" : "pays"} ·{" "}
              {r.splitMethod === "exact"
                ? "fixed"
                : r.splitMethod === "salary"
                  ? "proportional"
                  : "equal"}{" "}
              split
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                style={{ flex: 1, padding: "10px 0" }}
                disabled={busyId === r.id}
                onClick={() =>
                  act(r.id, () => repo.setRecurringPaused(r.id, !r.paused), r.paused ? "Resumed" : "Paused")
                }
              >
                {r.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="secondary"
                style={{ flex: 1, padding: "10px 0" }}
                disabled={busyId === r.id || r.paused}
                onClick={() => act(r.id, () => repo.runRecurringNow(r.id), "Expense added from bill")}
              >
                Add now
              </Button>
              <button
                aria-label={`Delete ${r.description}`}
                disabled={busyId === r.id}
                onClick={() => act(r.id, () => repo.deleteRecurring(r.id), "Recurring bill deleted")}
                style={{
                  background: "var(--redbg)",
                  border: "1px solid var(--red)",
                  borderRadius: "var(--r-input)",
                  color: "var(--red)",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "0 14px",
                  cursor: "pointer",
                }}
              >
                🗑
              </button>
            </div>
          </Card>
        ))}
        <ErrorText>{error}</ErrorText>

        <NewRecurringSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            onChanged("Recurring bill created");
          }}
          repo={repo}
          groupId={groupId}
          members={members}
          meUserId={meUserId}
        />
      </div>
    </div>
  );
}

function NewRecurringSheet({
  open,
  onClose,
  onSaved,
  repo,
  groupId,
  members,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
}) {
  const meMember = members.find((m) => m.userId === meUserId);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [payerId, setPayerId] = useState(meMember?.id ?? members[0]?.id ?? "");
  const [method, setMethod] = useState<"equal" | "salary">("salary");
  const [freq, setFreq] = useState<"weekly" | "monthly">("monthly");
  const [day, setDay] = useState("1"); // day-of-month
  const [dow, setDow] = useState(new Date().getDay()); // day-of-week 0–6
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const total = parseCents(amount);
    if (total <= 0 || !desc.trim()) {
      setError("Add a name and amount");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const input: NewRecurringInput = {
        groupId,
        description: desc.trim(),
        amountCents: total,
        frequency: freq,
        anchor: freq === "weekly" ? dow : Math.max(1, Math.min(28, parseInt(day) || 1)),
        payerMemberId: payerId,
        splitMethod: method,
        participantMemberIds: members.map((m) => m.id),
      };
      await repo.createRecurring(input);
      setAmount("");
      setDesc("");
      setDay("1");
      setFreq("monthly");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New recurring bill">
      <Input value={amount} onChange={setAmount} placeholder="0,00" inputMode="decimal" prefix="R" autoFocus />
      <div style={{ height: 10 }} />
      <Input value={desc} onChange={setDesc} placeholder="e.g. Rent" />

      <div style={{ height: 16 }} />
      <Label>Paid by</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.map((m) => (
          <Pill key={m.id} active={payerId === m.id} onClick={() => setPayerId(m.id)}>
            {memberDisplayName(m, meUserId)}
          </Pill>
        ))}
      </div>

      <div style={{ height: 16 }} />
      <Label>Split</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <Pill active={method === "equal"} onClick={() => setMethod("equal")}>
          Equal
        </Pill>
        <Pill active={method === "salary"} onClick={() => setMethod("salary")}>
          Proportional
        </Pill>
      </div>

      <div style={{ height: 16 }} />
      <Label>Repeats</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Pill active={freq === "weekly"} onClick={() => setFreq("weekly")}>
          Weekly
        </Pill>
        <Pill active={freq === "monthly"} onClick={() => setFreq("monthly")}>
          Monthly
        </Pill>
      </div>
      {freq === "weekly" ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEKDAYS.map((label, i) => (
            <Pill key={i} active={dow === i} onClick={() => setDow(i)}>
              {label}
            </Pill>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>on day</span>
          <div style={{ width: 84 }}>
            <Input value={day} onChange={(v) => setDay(v.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" center />
          </div>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>of each month (1–28)</span>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div style={{ height: 14 }} />
      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Create recurring bill"}
      </Button>
    </Sheet>
  );
}
