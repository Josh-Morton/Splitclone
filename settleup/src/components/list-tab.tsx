"use client";

/**
 * Shopping List tab: add-item input + "+", a to-buy list (checkbox / name /
 * qty / price estimate), and a "Sorted" section of crossed-off items showing
 * when each was added and bought, with Clear to wipe it.
 *
 * Phase 13 removed "turn cart into an expense" — ticking an item just means
 * bought. The price estimate is an indicator only: it never touches balances,
 * splits or any expense.
 *
 * Realtime: another device's edits appear live.
 */

import { useCallback, useEffect, useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, parseCents, type ShoppingItem } from "@/lib/domain";
import { Card, Input } from "./ui";

/** Compact date like "12 Jul" — same day/month shape the app uses elsewhere. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

export function ListTab({
  repo,
  groupId,
  groupName,
  live,
}: {
  repo: Repo;
  groupId: string;
  groupName: string;
  /** True when backed by Supabase — enables the realtime subscription. */
  live: boolean;
}) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [name, setName] = useState("");
  const [est, setEst] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await repo.listShoppingItems(groupId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo, groupId]);

  useEffect(() => {
    void Promise.resolve().then(load);
    if (!live) return;
    const unsubscribe = repo.subscribeShoppingItems(groupId, () => void load());
    return unsubscribe;
  }, [load, live, repo, groupId]);

  /**
   * Applies a change to the on-screen list immediately, then writes it
   * (Phase 16). Every action here used to await the write AND a full re-list
   * before anything moved — two round trips of dead time on a tap that should
   * feel instant. On failure we surface the error and re-read the server's
   * truth, so a rejected write can't leave the UI lying.
   */
  async function optimistic(
    apply: (prev: ShoppingItem[]) => ShoppingItem[],
    write: () => Promise<unknown>
  ) {
    setItems((prev) => (prev ? apply(prev) : prev));
    setError("");
    try {
      await write();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  async function add() {
    if (!name.trim()) return;
    const estCents = parseCents(est);
    const itemName = name.trim();
    const estPriceCents = estCents > 0 ? estCents : undefined;
    // The input clears right away; the row appears once the server hands back
    // the real row (it owns the id and created_at, and the list is ordered by
    // created_at — so appending matches the order a re-list would produce).
    setName("");
    setEst("");
    setError("");
    try {
      const created = await repo.addShoppingItem({ groupId, name: itemName, estPriceCents });
      setItems((prev) => (prev ? [...prev, created] : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  async function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    // completedAt mirrors what the repo writes; both render as a day-level
    // date, and realtime replaces it with the server's exact value anyway.
    const completedAt = checked ? new Date().toISOString() : null;
    await optimistic(
      (prev) => prev.map((i) => (i.id === item.id ? { ...i, checked, completedAt } : i)),
      () => repo.setShoppingItemChecked(item.id, checked)
    );
  }

  async function remove(item: ShoppingItem) {
    await optimistic(
      (prev) => prev.filter((i) => i.id !== item.id),
      () => repo.removeShoppingItem(item.id)
    );
  }

  async function clearSorted() {
    await optimistic(
      (prev) => prev.filter((i) => !i.checked),
      () => repo.clearCheckedShoppingItems(groupId)
    );
  }

  if (!items) return null;
  const toBuy = items.filter((i) => !i.checked);
  const sorted = items.filter((i) => i.checked);

  const row = (item: ShoppingItem, done: boolean) => (
    <div
      key={item.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 0",
        borderTop: "1px solid var(--line)",
      }}
    >
      <button
        onClick={() => toggle(item)}
        aria-label={done ? `Put ${item.name} back on the list` : `Cross off ${item.name}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          flexShrink: 0,
          cursor: "pointer",
          border: `2px solid ${done ? "var(--green)" : "var(--line2)"}`,
          background: done ? "var(--greenbg)" : "transparent",
          color: "var(--green)",
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            textDecoration: done ? "line-through" : "none",
            color: done ? "var(--faint)" : "var(--ink)",
          }}
        >
          {item.name}
          {item.qty ? <span style={{ color: "var(--faint)", fontWeight: 500 }}> ×{item.qty}</span> : null}
        </p>
        {done && (
          <p style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>
            Added {shortDate(item.createdAt)}
            {item.completedAt ? ` · Bought ${shortDate(item.completedAt)}` : ""}
          </p>
        )}
      </div>
      {item.estPriceCents != null && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>{fmt(item.estPriceCents)}</p>
      )}
      <button
        onClick={() => remove(item)}
        aria-label={`Remove ${item.name}`}
        style={{
          background: "none",
          border: "none",
          color: "var(--faint)",
          fontSize: 14,
          cursor: "pointer",
          padding: 2,
        }}
      >
        ✕
      </button>
    </div>
  );

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>Shopping list</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {groupName} — you both see the same list{live ? ", live" : ""}.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Input value={name} onChange={setName} placeholder="Add an item…" onEnter={add} />
        </div>
        <div style={{ width: 96 }}>
          <Input value={est} onChange={setEst} placeholder="est." inputMode="decimal" prefix="R" onEnter={add} />
        </div>
        <button
          onClick={add}
          aria-label="Add item"
          style={{
            width: 48,
            borderRadius: "var(--r-input)",
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 14 }}>
        The estimate is just a rough guide — it isn&apos;t counted anywhere.
      </p>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

      <Card style={{ padding: "4px 14px", marginBottom: 16 }}>
        {toBuy.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "12px 0" }}>
            Nothing to buy — add items above, cross them off in the shop.
          </p>
        )}
        {toBuy.map((i) => row(i, false))}
      </Card>

      {sorted.length > 0 && (
        <>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <p
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--faint)",
              }}
            >
              Sorted · {sorted.length}
            </p>
            <button
              onClick={clearSorted}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
          <Card style={{ padding: "4px 14px", marginBottom: 14 }}>{sorted.map((i) => row(i, true))}</Card>
        </>
      )}
    </>
  );
}
