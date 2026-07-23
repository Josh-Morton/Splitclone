"use client";

/**
 * Splitty shared bill page (Phase 8) — the page BOTH guests and the admin land
 * on from /split/<code>. Deliberately NOT gated on a Tally session: a guest who
 * has never used the app taps a WhatsApp link, types a name, and claims their
 * items. Guest identity is a browser-local token (ADR-0013), not an auth
 * session. The admin (bill creator) additionally gets a share panel, a live
 * overview, and a "Close bill" action.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Repo, SplitBill, SplitBillGuest } from "@/lib/data";
import { fmt } from "@/lib/domain";
import {
  claimedSubtotalCents,
  coveredCents,
  guestContributionCents,
  loadGuestIdentity,
  saveGuestIdentity,
  unclaimedCents,
  type GuestIdentity,
} from "@/lib/splitty";
import { getDemoRepo, getSupabaseRepo, isSupabaseConfigured } from "@/lib/data";
import { isDemoMode } from "@/lib/session";
import { Button, Card, ErrorText, Input, Label, Logo, Screen, Spinner } from "@/components/ui";

const TIP_PRESETS = [0, 10, 15, 20];

export default function SplitPage() {
  const params = useParams<{ code: string }>();
  const shareCode = decodeURIComponent(params.code ?? "");

  const [repo, setRepo] = useState<Repo | null>(null);
  const [bill, setBill] = useState<SplitBill | null | "missing">(null);
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);

  // Resolve the repo once: a "Skip — explore the demo" visitor keeps the same
  // in-memory demo repo (so their demo bill opens); real guests use the anon
  // Supabase client (RPCs are granted to anon — ADR-0013); local dev without
  // env falls to demo.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const useDemo = isDemoMode() || !isSupabaseConfigured();
      const r = useDemo ? (await getDemoRepo()).repo : getSupabaseRepo();
      if (cancelled) return;
      setIdentity(loadGuestIdentity(shareCode));
      setRepo(r);
    });
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    const b = await repo.splittyGetBill(shareCode);
    setBill(b ?? "missing");
  }, [repo, shareCode]);

  useEffect(() => {
    if (!repo) return;
    void Promise.resolve().then(refresh);
    const unsub = repo.subscribeSplitBill(shareCode, () => void refresh());
    return unsub;
  }, [repo, refresh, shareCode]);

  if (!repo || bill === null) {
    return (
      <Screen center>
        <Spinner />
      </Screen>
    );
  }

  if (bill === "missing") {
    return (
      <Screen padding={26} center>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <Logo size={52} />
        </div>
        <Card style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Split not found</h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>
            This link is invalid or the split was removed. Ask whoever shared it for a new one.
          </p>
        </Card>
      </Screen>
    );
  }

  const me = identity ? bill.guests.find((g) => g.id === identity.guestId) ?? null : null;

  // Have a saved token but the guest row isn't on this bill → treat as not
  // joined (stale localStorage from another bill, or the row was cleared).
  if (!identity || !me) {
    return (
      <JoinForm
        shareCode={shareCode}
        bill={bill}
        onJoined={(id) => {
          saveGuestIdentity(shareCode, id);
          setIdentity(id);
          void refresh();
        }}
        repo={repo}
      />
    );
  }

  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Logo size={34} />
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>
            {bill.merchant ?? "Split the bill"}
          </h1>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            {me.isAdmin ? "You started this split" : `You're in as ${me.displayName}`}
          </p>
        </div>
      </div>

      {bill.status === "closed" && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            background: "var(--s2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "8px 12px",
            marginBottom: 14,
          }}
        >
          This split is closed — it&apos;s now read-only.
        </p>
      )}

      <ClaimCard bill={bill} me={me} identity={identity} shareCode={shareCode} repo={repo} onChange={refresh} />

      {me.isAdmin && (
        <>
          <SharePanel shareCode={shareCode} merchant={bill.merchant} />
          <OverviewCard bill={bill} />
          {bill.status === "open" && <CloseBillCard shareCode={shareCode} repo={repo} onClosed={refresh} />}
        </>
      )}

      {!me.isAdmin && <OverviewCard bill={bill} />}

      <div style={{ height: 24 }} />
    </Screen>
  );
}

function JoinForm({
  shareCode,
  bill,
  onJoined,
  repo,
}: {
  shareCode: string;
  bill: SplitBill;
  onJoined: (id: GuestIdentity) => void;
  repo: Repo;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (!name.trim()) return setError("Enter your name");
    setBusy(true);
    setError("");
    try {
      const id = await repo.splittyJoin(shareCode, name.trim());
      onJoined(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen padding={26} center>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <Logo size={52} />
      </div>
      <Card style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>
          Split {bill.merchant ? `the ${bill.merchant} bill` : "the bill"}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>
          Pick the items you had and add your tip — no account needed. What&apos;s your name?
        </p>
        <Input value={name} onChange={setName} placeholder="e.g. Thabo" autoFocus onEnter={join} center />
        <div style={{ height: 12 }} />
        <Button onClick={join} disabled={busy || !name.trim()}>
          {busy ? "Joining…" : "Join the split"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}

function ClaimCard({
  bill,
  me,
  identity,
  shareCode,
  repo,
  onChange,
}: {
  bill: SplitBill;
  me: SplitBillGuest;
  identity: GuestIdentity;
  shareCode: string;
  repo: Repo;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = bill.status === "open" && !me.lockedIn;

  const subtotal = claimedSubtotalCents(bill, me.id);
  const myTotal = guestContributionCents(bill, me.id);

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const toggleItem = (itemId: string, mine: boolean, claimed: boolean) => {
    if (!editable || (claimed && !mine)) return;
    void guarded(() =>
      mine
        ? repo.splittyUnclaimItem(shareCode, identity.guestToken, itemId)
        : repo.splittyClaimItem(shareCode, identity.guestToken, itemId)
    );
  };

  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <Label>Your items</Label>
      <div style={{ margin: "0 -2px" }}>
        {bill.items.map((it) => {
          const mine = it.claimedByGuestId === me.id;
          const claimed = it.claimedByGuestId !== null;
          const otherName = claimed && !mine ? bill.guests.find((g) => g.id === it.claimedByGuestId)?.displayName : null;
          return (
            <div
              key={it.id}
              onClick={() => toggleItem(it.id, mine, claimed)}
              role="button"
              aria-label={`${mine ? "Release" : "Claim"} ${it.name}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 2px",
                borderTop: "1px solid var(--line)",
                cursor: editable && (!claimed || mine) ? "pointer" : "default",
                opacity: claimed && !mine ? 0.55 : 1,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  flexShrink: 0,
                  border: `2px solid ${mine ? "var(--green)" : "var(--line2)"}`,
                  background: mine ? "var(--greenbg)" : "transparent",
                  color: "var(--green)",
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: "20px",
                  textAlign: "center",
                }}
              >
                {mine ? "✓" : ""}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>
                {it.name}
                {otherName && (
                  <span style={{ color: "var(--faint)", fontWeight: 600 }}> · {otherName}</span>
                )}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{fmt(it.lineTotalCents)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 16 }} />
      <Label>Your tip</Label>
      <TipSelector
        value={me.tipPercent}
        disabled={!editable || busy}
        onPick={(pct) => void guarded(() => repo.splittySetTip(shareCode, identity.guestToken, pct))}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--line2)",
          margin: "16px 0 0",
          paddingTop: 12,
        }}
      >
        <div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            {fmt(subtotal)} + {me.tipPercent}% tip
          </p>
          <p style={{ fontSize: 12.5, color: "var(--faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Your total
          </p>
        </div>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>{fmt(myTotal)}</span>
      </div>

      <div style={{ height: 14 }} />
      {bill.status === "open" &&
        (me.lockedIn ? (
          <>
            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--green)",
                marginBottom: 10,
              }}
            >
              ✓ Locked in
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void guarded(() => repo.splittySetLocked(shareCode, identity.guestToken, false))}
            >
              Edit my items
            </Button>
          </>
        ) : (
          <Button
            disabled={busy || subtotal <= 0}
            onClick={() => void guarded(() => repo.splittySetLocked(shareCode, identity.guestToken, true))}
          >
            {subtotal <= 0 ? "Pick an item first" : `Lock in · ${fmt(myTotal)}`}
          </Button>
        ))}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function TipSelector({
  value,
  disabled,
  onPick,
}: {
  value: number;
  disabled: boolean;
  onPick: (pct: number) => void;
}) {
  const isPreset = TIP_PRESETS.includes(value);
  const [customOpen, setCustomOpen] = useState(!isPreset && value > 0);
  const [custom, setCustom] = useState(isPreset ? "" : String(value));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TIP_PRESETS.map((pct) => {
          const on = !customOpen && value === pct;
          return (
            <button
              key={pct}
              disabled={disabled}
              onClick={() => {
                setCustomOpen(false);
                onPick(pct);
              }}
              style={{
                flex: 1,
                minWidth: 56,
                padding: "9px 0",
                borderRadius: "var(--r-pill)",
                border: `1px solid ${on ? "var(--primary)" : "var(--line2)"}`,
                background: on ? "var(--bluebg)" : "var(--s2)",
                color: on ? "var(--primary)" : "var(--ink)",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              {pct === 0 ? "No tip" : `${pct}%`}
            </button>
          );
        })}
        <button
          disabled={disabled}
          onClick={() => setCustomOpen(true)}
          style={{
            flex: 1,
            minWidth: 56,
            padding: "9px 0",
            borderRadius: "var(--r-pill)",
            border: `1px solid ${customOpen ? "var(--primary)" : "var(--line2)"}`,
            background: customOpen ? "var(--bluebg)" : "var(--s2)",
            color: customOpen ? "var(--primary)" : "var(--ink)",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <Input
              value={custom}
              onChange={setCustom}
              inputMode="decimal"
              placeholder="Tip %"
              onEnter={() => onPick(Math.max(0, Math.min(100, Number(custom) || 0)))}
            />
          </div>
          <Button
            variant="secondary"
            disabled={disabled}
            style={{ width: 90 }}
            onClick={() => onPick(Math.max(0, Math.min(100, Number(custom) || 0)))}
          >
            Set
          </Button>
        </div>
      )}
    </div>
  );
}

function SharePanel({ shareCode, merchant }: { shareCode: string; merchant: string | null }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/split/${shareCode}` : "";
  const message =
    `Let's split ${merchant ? `the ${merchant} bill` : "the bill"} on Tally.\n\n` +
    `1. Tap this link: ${link}\n` +
    `2. Type your name\n` +
    `3. Tick what you had, add a tip, and lock in.`;
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  async function share() {
    try {
      await navigator.share({ title: "Split the bill on Tally", text: message });
    } catch {
      /* dismissed — not an error */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }

  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <Label>Share with the table</Label>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, wordBreak: "break-all" }}>{link}</p>
      {canNativeShare && (
        <>
          <Button onClick={share}>Share link…</Button>
          <div style={{ height: 8 }} />
        </>
      )}
      <Button variant="secondary" onClick={copy}>
        {copied ? "Copied ✓" : "Copy share message"}
      </Button>
    </Card>
  );
}

function OverviewCard({ bill }: { bill: SplitBill }) {
  const covered = coveredCents(bill);
  const unclaimed = unclaimedCents(bill);
  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <Label>Who&apos;s in</Label>
      {bill.guests.map((g) => (
        <div
          key={g.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0",
            borderTop: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {g.displayName}
            {g.isAdmin && <span style={{ color: "var(--faint)", fontWeight: 600 }}> · host</span>}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: g.lockedIn ? "var(--green)" : "var(--faint)",
              }}
            >
              {g.lockedIn ? "Locked" : "Choosing"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(guestContributionCents(bill, g.id))}</span>
          </span>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid var(--line2)",
          marginTop: 6,
          paddingTop: 10,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Claimed so far</span>
        <span style={{ fontSize: 14, fontWeight: 800 }}>
          {fmt(covered)} of {fmt(bill.receiptTotalCents)}
        </span>
      </div>
      {unclaimed > 0 && (
        <p style={{ fontSize: 12, color: "var(--amber)", marginTop: 8, fontWeight: 600 }}>
          {fmt(unclaimed)} of items still unclaimed
        </p>
      )}
    </Card>
  );
}

function CloseBillCard({
  shareCode,
  repo,
  onClosed,
}: {
  shareCode: string;
  repo: Repo;
  onClosed: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function close() {
    setBusy(true);
    setError("");
    try {
      await repo.splittyCloseBill(shareCode);
      await onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      {!confirm ? (
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          Close this split
        </Button>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            Close the split? Everyone&apos;s picks are frozen and nobody can edit after this.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setConfirm(false)}>
              Keep open
            </Button>
            <Button style={{ flex: 1 }} disabled={busy} onClick={close}>
              {busy ? "Closing…" : "Close it"}
            </Button>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
