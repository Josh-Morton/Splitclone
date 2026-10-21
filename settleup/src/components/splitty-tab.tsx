"use client";

/**
 * Splitty tab (Phase 8): the bills the signed-in user has created, each with a
 * live "covered of total" line, plus the entry point to scan a new bill. Tapping
 * a bill opens the shared /split/<code> page (same page guests see). Creating a
 * split scans the bill, creates it, remembers the admin's guest identity, and
 * routes into that page. Standalone from the expense ledger (ADR-0013).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Repo, SplitBill, SplitBillSummary } from "@/lib/data";
import { fmt } from "@/lib/domain";
import { claimedItemsCents, itemsTotalCents, saveGuestIdentity, tipsCents } from "@/lib/splitty";
import { CollapsingHeader } from "./collapsing-header";
import { ReceiptScanSheet } from "./receipt-scan-sheet";
import { CardsSkeleton } from "./skeletons";
import { Button, Card, pressable } from "./ui";

export function SplittyTab({ repo, demo }: { repo: Repo; demo: boolean }) {
  const router = useRouter();
  const [bills, setBills] = useState<SplitBillSummary[] | null>(null);
  const [details, setDetails] = useState<Record<string, SplitBill>>({});
  const [scanOpen, setScanOpen] = useState(false);

  const load = useCallback(async () => {
    const list = await repo.splittyListMyBills();
    setBills(list);
    const entries = await Promise.all(
      list.map(async (b) => [b.shareCode, await repo.splittyGetBill(b.shareCode)] as const)
    );
    const map: Record<string, SplitBill> = {};
    for (const [code, bill] of entries) if (bill) map[code] = bill;
    setDetails(map);
  }, [repo]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createSplit(result: {
    items: { name: string; lineTotalCents: number }[];
    merchant: string | null;
    totalCents: number;
  }) {
    const { shareCode, guestId, guestToken } = await repo.splittyCreateBill(
      result.merchant,
      result.totalCents,
      result.items
    );
    saveGuestIdentity(shareCode, { guestId, guestToken });
    setScanOpen(false);
    router.push(`/split/${shareCode}`);
  }

  return (
    <div style={{ marginBottom: 90 }}>
      {/* Splitty was the last tab still rendering its own <h1> — 22px/800 and
          non-sticky, against 26px/900 sticky everywhere else (BUG-017). */}
      <CollapsingHeader title="Splitty" />
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "12px 0 16px", lineHeight: 1.5 }}>
        Scan a restaurant or bar bill, share the link, and everyone picks what they had — no account
        needed for them. It stays separate from your Tallies and balances.
      </p>

      <Button onClick={() => setScanOpen(true)} style={{ marginBottom: 18 }}>
        + New split
      </Button>

      {demo && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            background: "var(--s2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "8px 12px",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Demo mode — you can create and claim on this device, but the share link can&apos;t be opened
          on a second phone (there&apos;s no server behind the demo).
        </p>
      )}

      {bills === null ? (
        <CardsSkeleton cards={3} label="Loading your splits" />
      ) : bills.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0" }}>
          No splits yet — tap <span style={{ color: "var(--ink)", fontWeight: 700 }}>New split</span> to scan
          your first bill.
        </p>
      ) : (
        bills.map((b, i) => {
          const bill = details[b.shareCode];
          // Items vs items: the old figure added tips to one side only, so a
          // fully claimed bill read "R1 376,25 of R1 225,00" (BUG-019).
          const claimed = bill ? claimedItemsCents(bill) : 0;
          const tips = bill ? tipsCents(bill) : 0;
          const total = bill ? itemsTotalCents(bill) : 0;
          const closed = b.status === "closed";
          return (
            <div
              key={b.shareCode}
              className="row-in press"
              style={{ animationDelay: `${Math.min(i, 8) * 32}ms`, marginBottom: 10 }}
            >
              <Card style={{ padding: 16, cursor: "pointer" }}>
                <div
                  {...pressable(() => router.push(`/split/${b.shareCode}`))}
                  aria-label={`Open ${b.merchant ?? "split"}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{b.merchant ?? "Split"}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: closed ? "var(--faint)" : "var(--green)",
                      }}
                    >
                      {closed ? "Closed" : "Open"}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
                    {bill ? (
                      <>
                        <span style={{ color: "var(--ink)", fontWeight: 700 }}>{fmt(claimed)}</span> of {fmt(total)}{" "}
                        claimed
                        {tips > 0 && <span style={{ color: "var(--faint)" }}> · +{fmt(tips)} tips</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
              </Card>
            </div>
          );
        })
      )}

      <ReceiptScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        mode="splitty"
        repo={repo}
        onCreateSplit={createSplit}
      />
    </div>
  );
}
