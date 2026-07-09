"use client";

/**
 * Settle Up bottom sheet (design handoff, basic cut): "Fewest payments to
 * clear all balances" — the debt-simplified transactions, each with a
 * "Record this payment" button. Empty state when settled.
 */

import { useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, type GroupMember, type SettleTransaction } from "@/lib/domain";
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

  const name = (memberId: string, capital: boolean) => {
    const m = members.find((x) => x.id === memberId);
    if (!m) return "?";
    if (m.userId === meUserId) return capital ? "You" : "you";
    return m.placeholderName ?? "Member";
  };

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

  return (
    <Sheet open={open} onClose={onClose} title="Settle up">
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        Fewest payments to clear all balances.
      </p>
      {transactions.length === 0 && (
        <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--green)", padding: "10px 0 20px" }}>
          You&apos;re all settled ✓
        </p>
      )}
      {transactions.map((tx) => (
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
            {name(tx.fromMemberId, true)} pay{name(tx.fromMemberId, true) === "You" ? "" : "s"}{" "}
            {name(tx.toMemberId, false)}{" "}
            <span style={{ fontWeight: 800 }}>{fmt(tx.amountCents)}</span>
          </p>
          <Button
            variant="secondary"
            onClick={() => record(tx)}
            disabled={busyId === tx.fromMemberId + tx.toMemberId}
          >
            {busyId === tx.fromMemberId + tx.toMemberId ? "Recording…" : "Record this payment"}
          </Button>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
