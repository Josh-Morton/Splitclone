"use client";

/**
 * "Clear the tally" bottom sheet.
 *
 * Rules (Josh): you can only record a payment for money YOU owe — clearing your
 * own debt. Money owed *to* you is shown for information only; the other person
 * clears it on their side (it reflects against their ledger). For 3+ members the
 * amounts owed to you are broken down per person.
 */

import { useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, type GroupMember, type SettleTransaction } from "@/lib/domain";
import { memberDisplayName } from "./avatar";
import { Button, ErrorText } from "./ui";
import { Sheet } from "./sheet";

export function SettleSheet({
  open,
  onClose,
  onRecorded,
  repo,
  groupId,
  members,
  meUserId,
  transactions,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: () => void;
  repo: Repo;
  groupId: string;
  members: GroupMember[];
  meUserId: string;
  transactions: SettleTransaction[];
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const meMember = members.find((m) => m.userId === meUserId);
  const name = (id: string) => memberDisplayName(members.find((m) => m.id === id), meUserId);

  // Only my own debts are actionable; amounts owed to me are info-only.
  const iOwe = transactions.filter((t) => t.fromMemberId === meMember?.id);
  const owedToMe = transactions.filter((t) => t.toMemberId === meMember?.id);
  const owedTotal = owedToMe.reduce((a, t) => a + t.amountCents, 0);

  async function record(tx: SettleTransaction) {
    setBusyId(tx.fromMemberId + tx.toMemberId);
    setError("");
    try {
      await repo.recordSettlement({
        groupId,
        fromMemberId: tx.fromMemberId,
        toMemberId: tx.toMemberId,
        amountCents: tx.amountCents,
      });
      onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }

  const nothing = iOwe.length === 0 && owedToMe.length === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Clear the tally">
      {nothing && (
        <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--green)", padding: "10px 0 20px" }}>
          You&apos;re all settled ✓
        </p>
      )}

      {/* What I owe — the only thing I can record */}
      {iOwe.length > 0 && (
        <>
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--faint)",
              marginBottom: 8,
            }}
          >
            You owe
          </p>
          {iOwe.map((tx) => (
            <div
              key={tx.fromMemberId + tx.toMemberId}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-card)",
                padding: 16,
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>
                Pay {name(tx.toMemberId)} <span style={{ fontWeight: 800, color: "var(--red)" }}>{fmt(tx.amountCents)}</span>
              </p>
              <Button
                onClick={() => record(tx)}
                disabled={busyId === tx.fromMemberId + tx.toMemberId}
              >
                {busyId === tx.fromMemberId + tx.toMemberId ? "Recording…" : "I've paid — record it"}
              </Button>
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--faint)", marginBottom: 18 }}>
            Recording marks the payment against the ledger. Settle outside the app (EFT, cash) first.
          </p>
        </>
      )}

      {/* What's owed to me — information only */}
      {owedToMe.length > 0 && (
        <>
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--faint)",
              marginBottom: 8,
            }}
          >
            Owed to you · {fmt(owedTotal)}
          </p>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-card)",
              padding: "4px 16px",
              marginBottom: 10,
            }}
          >
            {owedToMe.map((tx) => (
              <div
                key={tx.fromMemberId + tx.toMemberId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "11px 0",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name(tx.fromMemberId)} owes you</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--green)" }}>{fmt(tx.amountCents)}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--faint)" }}>
            {owedToMe.length === 1 ? "They" : "Each person"} clears this on their side — it&apos;ll
            record once they mark it paid.
          </p>
        </>
      )}

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
