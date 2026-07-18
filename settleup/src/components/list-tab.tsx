"use client";

/**
 * Shopping List tab (design: add-item input + "+", to-buy list with checkbox /
 * name / qty / estimate / adder avatar, "In cart · N" struck-through section
 * with Clear, and "Turn cart into an expense · Restimate" which prefills the
 * Add-expense sheet). Realtime: another device's edits appear live.
 */

import { useCallback, useEffect, useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, parseCents, type ShoppingItem } from "@/lib/domain";
import { Button, Card, Input } from "./ui";

export interface CartDraft {
  amountCents: number | null;
  description: string;
  note: string;
}

export function ListTab({
  repo,
  groupId,
  groupName,
  live,
  onCartToExpense,
}: {
  repo: Repo;
  groupId: string;
  groupName: string;
  /** True when backed by Supabase — enables the realtime subscription. */
  live: boolean;
  onCartToExpense: (draft: CartDraft) => void;
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

  async function add() {
    if (!name.trim()) return;
    const estCents = parseCents(est);
    await repo.addShoppingItem({
      groupId,
      name: name.trim(),
      estPriceCents: estCents > 0 ? estCents : undefined,
    });
    setName("");
    setEst("");
    await load();
  }

  async function toggle(item: ShoppingItem) {
    await repo.setShoppingItemChecked(item.id, !item.checked);
    await load();
  }

  async function clearCart() {
    await repo.clearCheckedShoppingItems(groupId);
    await load();
  }

  if (!items) return null;
  const toBuy = items.filter((i) => !i.checked);
  const cart = items.filter((i) => i.checked);
  const cartEstimate = cart.reduce((a, i) => a + (i.estPriceCents ?? 0), 0);

  const row = (item: ShoppingItem, inCart: boolean) => (
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
        aria-label={inCart ? `Uncheck ${item.name}` : `Check ${item.name}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          flexShrink: 0,
          cursor: "pointer",
          border: `2px solid ${inCart ? "var(--green)" : "var(--line2)"}`,
          background: inCart ? "var(--greenbg)" : "transparent",
          color: "var(--green)",
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {inCart ? "✓" : ""}
      </button>
      <p
        style={{
          flex: 1,
          fontSize: 14.5,
          fontWeight: 600,
          textDecoration: inCart ? "line-through" : "none",
          color: inCart ? "var(--faint)" : "var(--ink)",
        }}
      >
        {item.name}
        {item.qty ? <span style={{ color: "var(--faint)", fontWeight: 500 }}> ×{item.qty}</span> : null}
      </p>
      {item.estPriceCents != null && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>{fmt(item.estPriceCents)}</p>
      )}
      <button
        onClick={() => repo.removeShoppingItem(item.id).then(load)}
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
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}

      <Card style={{ padding: "4px 14px", marginBottom: 16 }}>
        {toBuy.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "12px 0" }}>
            Nothing to buy — add items above, tick them off in the shop.
          </p>
        )}
        {toBuy.map((i) => row(i, false))}
      </Card>

      {cart.length > 0 && (
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
              In cart · {cart.length}
            </p>
            <button
              onClick={clearCart}
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
          <Card style={{ padding: "4px 14px", marginBottom: 14 }}>{cart.map((i) => row(i, true))}</Card>
          <Button
            onClick={() =>
              onCartToExpense({
                amountCents: cartEstimate > 0 ? cartEstimate : null,
                description: "Groceries",
                note: cart
                  .map((i) => `${i.name}${i.qty ? ` ×${i.qty}` : ""}${i.estPriceCents != null ? ` — ${fmt(i.estPriceCents)}` : ""}`)
                  .join("\n"),
              })
            }
          >
            Turn cart into an expense{cartEstimate > 0 ? ` · ${fmt(cartEstimate)}` : ""}
          </Button>
        </>
      )}
    </>
  );
}
