"use client";

/**
 * Receipt scanner (Phase 7): capture a till slip → extract line items via the
 * scan-receipt Edge Function → tick the items that belong to this expense →
 * "Add to expense" copies the ticked total + item note back into the Add-expense
 * sheet, where the normal flow (split, participants, space) continues. The image
 * is never stored — it's compressed, sent for extraction, and discarded.
 */

import { useRef, useState } from "react";
import type { Repo, ScanItem } from "@/lib/data";
import { fmt, parseCents } from "@/lib/domain";
import { compressImage } from "@/lib/image";
import { Button, ErrorText, Spinner } from "./ui";
import { Sheet } from "./sheet";

interface Row extends ScanItem {
  id: number;
  included: boolean;
  priceInput: string; // editable Rand string
}

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function ReceiptScanSheet({
  open,
  onClose,
  onAdd,
  repo,
}: {
  open: boolean;
  onClose: () => void;
  /** Ticked total + a note of the chosen items → prefill the expense. */
  onAdd: (result: { amountCents: number; merchant: string | null; note: string }) => void;
  repo: Repo;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "review">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setPhase("idle");
    setRows([]);
    setMerchant(null);
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
          priceInput: centsToInput(it.lineTotalCents),
        }))
      );
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  const tickedTotal = rows
    .filter((r) => r.included)
    .reduce((a, r) => a + parseCents(r.priceInput), 0);
  const tickedCount = rows.filter((r) => r.included).length;

  function addToExpense() {
    const chosen = rows.filter((r) => r.included);
    const note = chosen.map((r) => `${r.name} — ${fmt(parseCents(r.priceInput))}`).join("\n");
    onAdd({ amountCents: tickedTotal, merchant, note });
    reset();
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Scan a receipt"
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
            Snap the till slip — we&apos;ll pull out the items and their prices. Then tick the ones
            that belong to this expense. The photo isn&apos;t saved.
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
            {merchant ? `${merchant} · ` : ""}Tick the items for this expense. Tap a price to fix it.
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
                <button
                  onClick={() =>
                    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, included: !x.included } : x)))
                  }
                  aria-label={r.included ? `Exclude ${r.name}` : `Include ${r.name}`}
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
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                    color: r.included ? "var(--ink)" : "var(--faint)",
                    textDecoration: r.included ? "none" : "line-through",
                  }}
                >
                  {r.name}
                </span>
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
                    aria-label={`Price of ${r.name}`}
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
              {tickedCount} item{tickedCount === 1 ? "" : "s"} selected
            </span>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(tickedTotal)}</span>
          </div>

          <div style={{ height: 12 }} />
          <Button onClick={addToExpense} disabled={tickedTotal <= 0}>
            Add to expense · {fmt(tickedTotal)}
          </Button>
          <div style={{ height: 8 }} />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Retake photo
          </Button>
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
