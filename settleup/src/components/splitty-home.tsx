"use client";

/**
 * Splitty's home (Phase 21): the intro with the live scan counter, "+ New
 * split", the splits you started and the ones you joined. Rendered by the
 * Tally tab ("tab") and the public /splitty page ("standalone") so the two
 * can't drift apart.
 *
 * Standalone visitors without a Tally account are asked their name once, and
 * only then get an anonymous session (ADR-0022) — so a visitor who just looks
 * creates nothing. Signed-in Tally users go straight to scanning; their
 * profile name is used, as before.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Repo, SplitBill, SplitBillItemInput, SplitBillSummary } from "@/lib/data";
import { fmt } from "@/lib/domain";
import {
  claimedItemsCents,
  itemsTotalCents,
  loadGuestIdentity,
  rememberSplittyName,
  saveGuestIdentity,
  savedSplitCodes,
  scansRemainingLabel,
  splittyDeviceId,
  splittyFirstRef,
  splittyName,
  tipsCents,
} from "@/lib/splitty";
import { ReceiptScanSheet } from "./receipt-scan-sheet";
import { Sheet } from "./sheet";
import { CardsSkeleton } from "./skeletons";
import { Button, Card, ErrorText, Input, Label, pressable } from "./ui";

type Mode = "tab" | "standalone";

export function SplittyHome({
  repo,
  mode,
  demo,
  hasTallyAccount,
}: {
  repo: Repo;
  mode: Mode;
  demo: boolean;
  /** Signed into Tally (or the demo): no name prompt, no anonymous session. */
  hasTallyAccount: boolean;
}) {
  const router = useRouter();
  const [started, setStarted] = useState<SplitBillSummary[] | null>(null);
  const [joined, setJoined] = useState<SplitBill[]>([]);
  const [details, setDetails] = useState<Record<string, SplitBill>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const list = await repo.splittyListMyBills().catch(() => [] as SplitBillSummary[]);
    setStarted(list);
    const mine = new Set(list.map((b) => b.shareCode));
    // Bills this browser joined as a guest (their tokens are saved locally).
    const joinedCodes = savedSplitCodes().filter((c) => !mine.has(c));
    const [own, others] = await Promise.all([
      Promise.all(list.map((b) => repo.splittyGetBill(b.shareCode).catch(() => null))),
      Promise.all(joinedCodes.map((c) => repo.splittyGetBill(c).catch(() => null))),
    ]);
    const map: Record<string, SplitBill> = {};
    for (const b of own) if (b) map[b.shareCode] = b;
    setDetails(map);
    setJoined(
      others.filter((b): b is SplitBill => {
        if (!b) return false;
        const id = loadGuestIdentity(b.shareCode);
        return Boolean(id && b.guests.some((g) => g.id === id.guestId && !g.isAdmin));
      })
    );
  }, [repo]);

  const loadRemaining = useCallback(async () => {
    const n = await repo.scansRemainingToday().catch(() => null);
    if (n !== null) setRemaining(n);
  }, [repo]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The counter is live: loaded on open, then moves whenever anyone scans.
  useEffect(() => {
    void Promise.resolve().then(loadRemaining);
    return repo.subscribeScanQuota(() => void loadRemaining());
  }, [repo, loadRemaining]);

  const outOfScans = remaining === 0;

  /** Get a session (if needed) and open the scanner. */
  async function beginScan() {
    setError("");
    if (mode === "standalone" && !hasTallyAccount) {
      setBusy(true);
      try {
        await repo.splittyEnsureSession();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setScanOpen(true);
  }

  function newSplit() {
    if (mode === "standalone" && !hasTallyAccount && !splittyName()) {
      setName("");
      setNameOpen(true);
      return;
    }
    void beginScan();
  }

  async function createSplit(result: { items: SplitBillItemInput[]; merchant: string | null; totalCents: number }) {
    const { shareCode, guestId, guestToken } = await repo.splittyCreateBill(
      result.merchant,
      result.totalCents,
      result.items,
      hasTallyAccount ? null : splittyName()
    );
    saveGuestIdentity(shareCode, { guestId, guestToken });
    void repo.trackSplittyEvent({
      event: "split_created",
      shareCode,
      source: mode === "tab" ? "tally_tab" : "splitty_page",
      ref: splittyFirstRef(),
      deviceId: splittyDeviceId(),
    });
    setScanOpen(false);
    router.push(`/split/${shareCode}`);
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--muted)", margin: "12px 0 16px", lineHeight: 1.5 }}>
        Scan a restaurant or bar bill, share the link, and everyone picks what they had. No account needed.
        {remaining !== null && (
          <>
            {" "}
            <span aria-live="polite">{scansRemainingLabel(remaining)}</span>
          </>
        )}
      </p>

      <Button onClick={newSplit} disabled={busy || outOfScans} style={{ marginBottom: outOfScans ? 8 : 18 }}>
        {busy ? "Starting…" : "+ New split"}
      </Button>
      {outOfScans && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
          Splitty has used today&apos;s scans. Back tomorrow.
        </p>
      )}
      <ErrorText>{error}</ErrorText>

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

      {started === null ? (
        <CardsSkeleton cards={3} label="Loading your splits" />
      ) : started.length === 0 && joined.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0" }}>
          No splits yet — tap <span style={{ color: "var(--ink)", fontWeight: 700 }}>New split</span> to scan
          your first bill.
        </p>
      ) : (
        <>
          {started.length > 0 && (
            <>
              {joined.length > 0 && <Label>Splits you started</Label>}
              {started.map((b, i) => (
                <BillCard
                  key={b.shareCode}
                  index={i}
                  merchant={b.merchant}
                  status={b.status}
                  bill={details[b.shareCode]}
                  onOpen={() => router.push(`/split/${b.shareCode}`)}
                />
              ))}
            </>
          )}
          {joined.length > 0 && (
            <>
              <div style={{ height: started.length > 0 ? 8 : 0 }} />
              <Label>Splits you joined</Label>
              {joined.map((b, i) => (
                <BillCard
                  key={b.shareCode}
                  index={i}
                  merchant={b.merchant}
                  status={b.status}
                  bill={b}
                  onOpen={() => router.push(`/split/${b.shareCode}`)}
                />
              ))}
            </>
          )}
        </>
      )}

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="What's your name?">
        <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>
          It&apos;s how the people you split with will see you. No account needed.
        </p>
        <Input
          label="Your name"
          value={name}
          onChange={setName}
          placeholder="e.g. Thabo"
          autoFocus
          onEnter={() => {
            if (!name.trim()) return;
            rememberSplittyName(name);
            setNameOpen(false);
            void beginScan();
          }}
        />
        <div style={{ height: 12 }} />
        <Button
          disabled={!name.trim()}
          onClick={() => {
            rememberSplittyName(name);
            setNameOpen(false);
            void beginScan();
          }}
        >
          Continue
        </Button>
      </Sheet>

      <ReceiptScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        mode="splitty"
        repo={repo}
        onCreateSplit={createSplit}
        onScanned={(left) => {
          if (left !== undefined) setRemaining(left);
        }}
      />
    </div>
  );
}

function BillCard({
  index,
  merchant,
  status,
  bill,
  onOpen,
}: {
  index: number;
  merchant: string | null;
  status: "open" | "closed";
  bill: SplitBill | undefined;
  onOpen: () => void;
}) {
  // Items vs items: the old figure added tips to one side only, so a fully
  // claimed bill read "R1 376,25 of R1 225,00" (BUG-019).
  const claimed = bill ? claimedItemsCents(bill) : 0;
  const tips = bill ? tipsCents(bill) : 0;
  const total = bill ? itemsTotalCents(bill) : 0;
  const closed = status === "closed";
  return (
    <div className="row-in press" style={{ animationDelay: `${Math.min(index, 8) * 32}ms`, marginBottom: 10 }}>
      <Card style={{ padding: 16, cursor: "pointer" }}>
        <div {...pressable(onOpen)} aria-label={`Open ${merchant ?? "split"}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{merchant ?? "Split"}</span>
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
                <span style={{ color: "var(--ink)", fontWeight: 700 }}>{fmt(claimed)}</span> of {fmt(total)} claimed
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
}
