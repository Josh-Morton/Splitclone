"use client";

/**
 * Receipt scanner. Two modes share one capture → scan → editable-checklist UI:
 *
 *  - "expense" (Phase 7): tick the items that belong to this expense →
 *    "Add to expense" copies the ticked total + item note back into the
 *    Add-expense sheet, where the normal flow (split, participants, space)
 *    continues.
 *  - "splitty" (Phase 8): every scanned row becomes a real line item (rename,
 *    fix a price, or remove) → "Create split" hands the items back to the
 *    caller, which creates the shared bill and routes to /split/<code>.
 *
 * The image is never stored — it's compressed, sent for extraction, discarded.
 */

import { useRef, useState } from "react";
import type { Repo, ScanItem, SplitBillItemInput } from "@/lib/data";
import { fmt, parseCents } from "@/lib/domain";
import { compressImage } from "@/lib/image";
import { Button, ErrorText, Spinner } from "./ui";
import { Sheet } from "./sheet";

interface Row extends ScanItem {
  id: number;
  included: boolean;
  nameInput: string;
  priceInput: string; // editable Rand string
}

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function ReceiptScanSheet({
  open,
  onClose,
  onAdd,
  onCreateSplit,
  repo,
  mode = "expense",
}: {
  open: boolean;
  onClose: () => void;
  /** expense mode: ticked total + a note of the chosen items → prefill the expense. */
  onAdd?: (result: { amountCents: number; merchant: string | null; note: string }) => void;
  /** splitty mode: the edited line items + merchant + total → create the bill. */
  onCreateSplit?: (result: {
    items: SplitBillItemInput[];
    merchant: string | null;
    totalCents: number;
  }) => Promise<void> | void;
  repo: Repo;
  mode?: "expense" | "splitty";
}) {
  const splitty = mode === "splitty";
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "review">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setPhase("idle");
    setRows([]);
    setMerchant(null);
    setBusy(false);
    setError("");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setPhase("scanning");
    try {
      const blob = await compressImage(file, 1600, 0.8);
      const base64 = await blobToBase64(blob);
      const result = await repo.scanReceipt(base64, "image/jpeg");
      setMerchant(result.merchant);
      setRows(
        result.items.map((it, i) => ({
          ...it,
          id: i,
          included: true,
          nameInput: it.name,
          priceInput: centsToInput(it.lineTotalCents),
        }))
      );
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  // expense mode counts only ticked rows; splitty mode counts every row.
  const countedRows = rows.filter((r) => splitty || r.included);
  const total = countedRows.reduce((a, r) => a + parseCents(r.priceInput), 0);
  const countedCount = countedRows.length;

  function addToExpense() {
    const chosen = rows.filter((r) => r.included);
    const note = chosen.map((r) => `${r.nameInput} — ${fmt(parseCents(r.priceInput))}`).join("\n");
    onAdd?.({ amountCents: total, merchant, note });
    reset();
  }

  async function createSplit() {
    const items: SplitBillItemInput[] = rows
      .map((r) => ({ name: r.nameInput.trim(), lineTotalCents: parseCents(r.priceInput) }))
      .filter((it) => it.name && it.lineTotalCents > 0);
    if (items.length === 0) {
      setError("A split needs at least one item");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreateSplit?.({ items, merchant, totalCents: total });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      title={splitty ? "Scan the bill" : "Scan a receipt"}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {phase === "idle" && (
        <>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
            {splitty
              ? "Snap the bill — we'll pull out every item so your friends can each pick what they had. The photo isn't saved."
              : "Snap the till slip — we'll pull out the items and their prices. Then tick the ones that belong to this expense. The photo isn't saved."}
          </p>
          <Button onClick={() => fileRef.current?.click()}>📷 Take / choose a photo</Button>
          <ErrorText>{error}</ErrorText>
        </>
      )}

      {phase === "scanning" && (
        <div style={{ padding: "30px 0", textAlign: "center" }}>
          <Spinner />
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 14 }}>Reading the slip…</p>
        </div>
      )}

      {phase === "review" && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>
            {merchant ? `${merchant} · ` : ""}
            {splitty
              ? "Check the items — rename, fix a price, or remove any before you share."
              : "Tick the items for this expense. Tap a price to fix it."}
          </p>
          <div style={{ maxHeight: "46vh", overflowY: "auto", margin: "8px -4px" }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 4px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                {splitty ? (
                  <button
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                    aria-label={`Remove ${r.nameInput}`}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      flexShrink: 0,
                      cursor: "pointer",
                      border: "1px solid var(--line2)",
                      background: "transparent",
                      color: "var(--faint)",
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, included: !x.included } : x)))
                    }
                    aria-label={r.included ? `Exclude ${r.nameInput}` : `Include ${r.nameInput}`}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      flexShrink: 0,
                      cursor: "pointer",
                      border: `2px solid ${r.included ? "var(--green)" : "var(--line2)"}`,
                      background: r.included ? "var(--greenbg)" : "transparent",
                      color: "var(--green)",
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    {r.included ? "✓" : ""}
                  </button>
                )}
                {splitty ? (
                  <input
                    value={r.nameInput}
                    onChange={(e) =>
                      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, nameInput: e.target.value } : x)))
                    }
                    aria-label={`Name of ${r.nameInput}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--ink)",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 600,
                      color: r.included ? "var(--ink)" : "var(--faint)",
                      textDecoration: r.included ? "none" : "line-through",
                    }}
                  >
                    {r.nameInput}
                  </span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <span style={{ color: "var(--faint)", fontSize: 13, fontWeight: 700 }}>R</span>
                  <input
                    value={r.priceInput}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x) => (x.id === r.id ? { ...x, priceInput: e.target.value } : x))
                      )
                    }
                    inputMode="decimal"
                    aria-label={`Price of ${r.nameInput}`}
                    style={{
                      width: 72,
                      background: "var(--s2)",
                      border: "1px solid var(--line2)",
                      borderRadius: 8,
                      color: "var(--ink)",
                      fontSize: 13.5,
                      fontWeight: 700,
                      padding: "6px 8px",
                      textAlign: "right",
                    }}
                  />
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--line2)",
              padding: "12px 4px 4px",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
              {countedCount} item{countedCount === 1 ? "" : "s"}
              {splitty ? "" : " selected"}
            </span>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(total)}</span>
          </div>

          <div style={{ height: 12 }} />
          {splitty ? (
            <Button onClick={createSplit} disabled={busy || total <= 0}>
              {busy ? "Creating…" : `Create split · ${fmt(total)}`}
            </Button>
          ) : (
            <Button onClick={addToExpense} disabled={total <= 0}>
              Add to expense · {fmt(total)}
            </Button>
          )}
          <div style={{ height: 8 }} />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Retake photo
          </Button>
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Sheet>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1)); // strip "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
