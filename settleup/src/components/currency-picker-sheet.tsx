"use client";

/**
 * Currency picker for the Add-expense amount field (Phase 14).
 *
 * Lists only currencies we hold a cached rate for — offering one we can't
 * convert would be worse than leaving it out. Recently-used float to the top
 * (ADR-0017), with ZAR pinned just under them so getting back to Rand is
 * never a search.
 */

import { useState } from "react";
import { orderCurrencies, searchCurrencies, type ExchangeRate } from "@/lib/domain";
import { Input } from "./ui";
import { Sheet } from "./sheet";

export function CurrencyPickerSheet({
  open,
  onClose,
  onPick,
  rates,
  recent,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (code: string) => void;
  rates: ExchangeRate[];
  recent: string[];
  selected: string;
}) {
  const [query, setQuery] = useState("");

  const ordered = orderCurrencies(rates.map((r) => r.code), recent);
  const shown = searchCurrencies(ordered, query);
  const recentSet = new Set(recent.map((c) => c.toUpperCase()));
  const rateOf = (code: string) => rates.find((r) => r.code === code)?.rateToZar;

  return (
    <Sheet
      open={open}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      title="Currency"
    >
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
        Enter the amount in any of these. It&apos;s converted to Rand and recorded in Rand —
        splits and balances never change.
      </p>
      <Input value={query} onChange={setQuery} placeholder="Search currency or code…" />
      <div style={{ height: 10 }} />

      <div style={{ maxHeight: "50vh", overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>
        {shown.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--faint)", padding: "16px 2px" }}>
            No currency matches “{query.trim()}”.
          </p>
        )}
        {shown.map((c, i) => {
          const active = c.code === selected;
          const rate = rateOf(c.code);
          // Only label the run of recent ones at the very top, and only when
          // the list isn't being filtered (the order stops meaning "recent").
          const showRecentLabel = !query.trim() && i === 0 && recentSet.has(c.code);
          return (
            <div key={c.code}>
              {showRecentLabel && (
                <p
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    color: "var(--faint)",
                    margin: "2px 0 6px",
                  }}
                >
                  RECENTLY USED
                </p>
              )}
              <button
                onClick={() => {
                  setQuery("");
                  onPick(c.code);
                }}
                aria-label={`${c.name} (${c.code})`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  marginBottom: 6,
                  borderRadius: "var(--r-card)",
                  background: active ? "var(--accentbg)" : "var(--surface)",
                  border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--ink)",
                }}
              >
                <span style={{ fontSize: 20, width: 26, flexShrink: 0 }}>{c.flag || "💱"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)" }}>
                    {c.code} · {c.symbol}
                    {rate != null && c.code !== "ZAR" ? ` · R${rate.toFixed(2)}` : ""}
                  </span>
                </span>
                {active && (
                  <span style={{ color: "var(--primary)", fontWeight: 800, fontSize: 15 }}>✓</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
