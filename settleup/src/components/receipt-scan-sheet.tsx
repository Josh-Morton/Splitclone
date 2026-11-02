"use client";

/**
 * Receipt scanner. Two modes share one capture → scan → editable-checklist UI:
 *
 *  - "expense" (Phase 7): tick the items that belong to this expense →
 *    "Add to expense" copies the ticked total + item note back into the
 *    Add-expense sheet, where the normal flow (split, participants, space)
 *    continues.
 *  - "splitty" (Phase 8): every scanned row becomes a real line item → "Create
 *    split" hands the items back to the caller, which creates the shared bill
 *    and routes to /split/<code>. Since Phase 21 the scanner's per-unit rows
 *    ("Jack Black (1 of 5)") are folded back into one line with a quantity, so
 *    the host can fix the name, the price each and the number before sharing;
 *    they're expanded back to one claimable item per unit on create.
 *
 * The image is never stored — it's compressed, sent for extraction, discarded.
 */

import { useRef, useState } from "react";
import type { Repo, ScanItem, SplitBillItemInput } from "@/lib/data";
import { fmt, parseCents } from "@/lib/domain";
import { compressImage } from "@/lib/image";
import { editedLineCents, expandRows, groupScanItems } from "@/lib/splitty";
import { Button, ErrorText, Spinner } from "./ui";
import { Sheet } from "./sheet";

interface Row extends ScanItem {
  id: number;
  included: boolean;
  nameInput: string;
  priceInput: string; // editable Rand string
}

/** Splitty review: one product, edited as qty × price each (Phase 21). */
interface Line {
  id: number;
  nameInput: string;
  qty: number;
  unitInput: string; // editable Rand string, price EACH
  scanned: { qty: number; unitCents: number; lineCents: number };
}

const MAX_QTY = 50; // same guard as the scanner's mis-read quantity cap
const lineCents = (l: Line) => editedLineCents(l.qty, parseCents(l.unitInput), l.scanned);

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function ReceiptScanSheet({
  open,
  onClose,
  onAdd,
  onCreateSplit,
  repo,
  mode = "expense",
  onScanned,
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
  /** After a successful scan: today's scans left, when the server says. */
  onScanned?: (scansRemaining?: number) => void;
}) {
  const splitty = mode === "splitty";
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "review">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setPhase("idle");
    setRows([]);
    setLines([]);
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
      onScanned?.(result.scansRemaining);
      setMerchant(result.merchant);
      setLines(
        groupScanItems(result.items).map((l, i) => {
          const unitCents = Math.round(l.lineCents / l.qty);
          return {
            id: i,
            nameInput: l.name,
            qty: l.qty,
            unitInput: centsToInput(unitCents),
            scanned: { qty: l.qty, unitCents, lineCents: l.lineCents },
          };
        })
      );
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

  // expense mode counts only ticked rows; splitty mode counts every line × qty.
  const countedRows = rows.filter((r) => r.included);
  const total = splitty
    ? lines.reduce((a, l) => a + lineCents(l), 0)
    : countedRows.reduce((a, r) => a + parseCents(r.priceInput), 0);
  const countedCount = splitty ? lines.reduce((a, l) => a + l.qty, 0) : countedRows.length;

  const updateLine = (id: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  function addToExpense() {
    const chosen = rows.filter((r) => r.included);
    const note = chosen.map((r) => `${r.nameInput} — ${fmt(parseCents(r.priceInput))}`).join("\n");
    onAdd?.({ amountCents: total, merchant, note });
    reset();
  }

  async function createSplit() {
    const items: SplitBillItemInput[] = expandRows(
      lines.map((l) => ({ name: l.nameInput, qty: l.qty, lineCents: lineCents(l) }))
    );
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
          {splitty ? (
            <>
              {/* Josh's words (Phase 21): this is the host's one chance to
                  make the bill right before anyone claims from it. */}
              <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5, marginBottom: 4 }}>
                This is where you can configure your split. Someone paid already? The value or number of
                items incorrect? Fix it now before sharing with the others.
              </p>
              {merchant && <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>{merchant}</p>}
              <div style={{ maxHeight: "46vh", overflowY: "auto", margin: "8px -4px" }}>
                {lines.map((l) => (
                  <LineEditor
                    key={l.id}
                    line={l}
                    onChange={(patch) => updateLine(l.id, patch)}
                    onRemove={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                  />
                ))}
              </div>
            </>
          ) : (
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
                    <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ color: "var(--faint)", fontSize: 13, fontWeight: 700 }}>R</span>
                      <input
                        value={r.priceInput}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, priceInput: e.target.value } : x)))
                        }
                        inputMode="decimal"
                        aria-label={`Price of ${r.nameInput}`}
                        style={priceInputStyle}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

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

const priceInputStyle = {
  width: 72,
  background: "var(--s2)",
  border: "1px solid var(--line2)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 16, // ≥16px or iOS zooms in on focus now that pinch-zoom is allowed
  fontWeight: 700,
  padding: "6px 8px",
  textAlign: "right" as const,
};

/** One product on the Splitty review screen: name, qty stepper, price each. */
function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: Line;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const label = line.nameInput || "item";
  return (
    <div style={{ padding: "10px 4px", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="hit"
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
        <input
          className="inline-input"
          value={line.nameInput}
          onChange={(e) => onChange({ nameInput: e.target.value })}
          aria-label={`Name of ${label}`}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            // Underline on focus comes from .inline-input (WCAG 2.4.7).
            borderBottom: "2px solid transparent",
            color: "var(--ink)",
            fontSize: 16, // ≥16px or iOS zooms in on focus
            fontWeight: 600,
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 32 }}>
        <div
          role="group"
          aria-label={`Number of ${label}`}
          style={{ display: "flex", alignItems: "center", border: "1px solid var(--line2)", borderRadius: 999 }}
        >
          <StepButton
            label={`One fewer ${label}`}
            disabled={line.qty <= 1}
            onClick={() => onChange({ qty: Math.max(1, line.qty - 1) })}
          >
            −
          </StepButton>
          <span
            aria-live="polite"
            style={{ minWidth: 26, textAlign: "center", fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
          >
            {line.qty}
          </span>
          <StepButton
            label={`One more ${label}`}
            disabled={line.qty >= MAX_QTY}
            onClick={() => onChange({ qty: Math.min(MAX_QTY, line.qty + 1) })}
          >
            +
          </StepButton>
        </div>
        <span style={{ color: "var(--faint)", fontSize: 13, fontWeight: 700 }}>× R</span>
        <input
          value={line.unitInput}
          onChange={(e) => onChange({ unitInput: e.target.value })}
          inputMode="decimal"
          aria-label={`Price each of ${label}`}
          style={priceInputStyle}
        />
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {fmt(lineCents(line))}
        </span>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        border: "none",
        background: "transparent",
        color: disabled ? "var(--faint)" : "var(--ink)",
        fontSize: 18,
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        borderRadius: 999,
      }}
    >
      {children}
    </button>
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
