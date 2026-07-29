*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 13 — Shopping list rework: Sorted section, dates, drop cart→expense 📝 SPEC ONLY — NOT BUILT (2026-07-29)

## Goal
Simplify the shopping list's job to just: add things, cross them off, know
when. Remove the "turn checked items into an expense" flow entirely — Josh's
call, since it conflates two separate ideas (a shopping list vs. a
receipt/expense) and adding the resulting expense manually (or via receipt
scan, Phase 7) already covers it better.

## What changes
1. **Remove "Turn cart into an expense."** Checking an item off the list no
   longer builds toward an expense — it just means "bought." Delete:
   - `list-tab.tsx`'s `convertShop` handler + the "Turn cart into an expense
     · {fmt(cartEstimate)}" button + the `cartEstimate` sum.
   - `onCartToExpense` prop threading: `list-tab.tsx` → `page.tsx` →
     `CartDraft` type → `AddExpenseSheet`'s `draft` prefill path. If nothing
     else constructs a `CartDraft`, remove the type and the prefill branch
     too rather than leaving dead code.
2. **"In cart · N" becomes "Sorted."** Same underlying rows (checked items),
   renamed section, same struck-through treatment. "Clear" stays — it still
   soft-deletes everything in the section (today's `clearCheckedShoppingItems`,
   unchanged), so Sorted doesn't grow forever, per Josh's answer.
3. **Record both dates.** Every item already has `created_at` (when added —
   no change needed there). New: `completed_at`, set the moment an item is
   checked, cleared if unchecked back to active. Sorted rows show both:
   `Added {addedDate} · Bought {completedDate}`.
4. **The price-estimate field needs no code change.** Confirmed with Josh:
   it already doesn't touch balances/splits/anything financial — it's
   already "just an indicator." The only thing that goes away is the
   *cart total* sum (removed as part of #1), not the per-item estimate
   input itself.

## Data model
```sql
alter table shopping_item add column completed_at timestamptz;
```
Set client-side in `setShoppingItemChecked` (mirrors how `updated_by` is
already stamped there, added in the Phase 9 push-notifications work):
```ts
async setShoppingItemChecked(id: string, checked: boolean): Promise<void> {
  const userId = await this.uid();
  await this.sb.from("shopping_item").update({
    checked,
    completed_at: checked ? new Date().toISOString() : null,
    updated_by: userId,
  }).eq("id", id);
}
```
`ShoppingItem` domain type gains `completedAt: string | null`; map in both
`SupabaseRepo` and `MemoryRepo`.

**No change needed** to the Phase 9 push trigger
(`shopping_item_checked_push`, fires on `checked` false→true) — it already
watches the right column transition and keeps working unmodified.

## Non-goals
- No archiving/pagination of Sorted beyond the existing "Clear" soft-delete —
  Josh confirmed a manual Clear is enough, no auto-expiry needed.
- No change to the price-estimate field's behaviour (confirmed no-op, §4).
- No change to adding items, quantities, or the realtime subscription.

## Build order
1. Migration: `completed_at` column.
2. Repo: stamp `completed_at` in `setShoppingItemChecked`, both
   implementations; domain type update.
3. Remove cart→expense: `convertShop`, `cartEstimate`, `onCartToExpense`,
   `CartDraft` prefill path (check whether `CartDraft` is used anywhere else
   before deleting the type outright).
4. UI: rename "In cart · N" → "Sorted," add the added/bought date line to
   each Sorted row.
5. Verify: check/uncheck round-trips `completed_at` correctly; Clear still
   works; Splitty and receipt-scan flows (which are unrelated to this list)
   are untouched; `npm test` + build + lint green.
