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
import { coveredCents, saveGuestIdentity } from "@/lib/splitty";
import { ReceiptScanSheet } from "./receipt-scan-sheet";
import { Button, Card, Spinner } from "./ui";

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>Splitty</h1>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
        Scan a restaurant or bar bill, share the link, and everyone picks what they had — no account
        needed for them. It stays separate from your spaces and balances.
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
        <div style={{ padding: "24px 0" }}>
          <Spinner />
        </div>
      ) : bills.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0" }}>
          No splits yet — tap <span style={{ color: "var(--ink)", fontWeight: 700 }}>New split</span> to scan
          your first bill.
        </p>
      ) : (
        bills.map((b) => {
          const bill = details[b.shareCode];
          const covered = bill ? coveredCents(bill) : 0;
          const total = bill?.receiptTotalCents ?? 0;
          const closed = b.status === "closed";
          return (
            <Card
              key={b.shareCode}
              style={{ padding: 16, marginBottom: 10, cursor: "pointer" }}
            >
              <div
                role="button"
                aria-label={`Open ${b.merchant ?? "split"}`}
                onClick={() => router.push(`/split/${b.shareCode}`)}
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
                      <span style={{ color: "var(--ink)", fontWeight: 700 }}>{fmt(covered)}</span> of {fmt(total)}{" "}
                      claimed
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </Card>
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
