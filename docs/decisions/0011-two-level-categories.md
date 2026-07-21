# ADR-0011: Two-level category taxonomy with auto-assign + manual override

**Status:** Accepted (2026-07-18) · **Amends:** ADR-0008 · **Source:** Josh (Phase 6); researched against Splitwise's parent/subcategory model and Plaid's Personal Finance Category taxonomy (16 primary / 104 detailed)

## Context
ADR-0008 established a flat 8-category list, auto-assigned from description
keywords with no manual picker. Real use wants finer categorisation (a grocery
run vs a liquor run vs household consumables) and the ability to correct a
wrong guess. Splitwise itself uses parent→subcategory; Plaid's researched PFC
taxonomy trimmed 600+ categories down to a practical two levels.

## Decision
- The **8 existing categories become parents**, keeping their slugs, accent
  colours and icons. Each holds a curated set of **subcategories** (~40 total),
  including South-Africa-specific ones: prepaid electricity, DSTV, airtime,
  e-tolls, domestic help, armed response, medical aid, municipal rates.
- `expense.category` continues to store a single text slug — now a
  **subcategory slug** (e.g. `groceries_liquor`) or a bare parent slug for
  legacy/general (`groceries`). **No DB migration**: the column is free text,
  and `parentOf()`/`categoryMeta()` resolve any slug (legacy bare slugs map to
  their parent's general bucket).
- **Auto-assign stays the default** (ADR-0008 preserved): `autoCategory()` now
  returns a subcategory slug, still order-sensitive (earlier entries win, so
  "uber eats" → takeaway before "uber" → rideshare). **New:** the detected chip
  in the Add/Edit sheet is tappable → a grouped category picker; a manual pick
  becomes an override for that expense.
- **Reports roll up by parent** with tap-to-drill-down into subcategories.
  The report **category filter is parent-level**. Excel export carries both
  parent (Category) and subcategory columns; summary totals roll up by parent.
- Single source of truth: `settleup/src/lib/domain/category.ts`
  (`SUBCATEGORIES` registry, `CATEGORY_TREE`, `CATEGORY_META` parents,
  `autoCategory`, `parentOf`, `categoryMeta`). Keep the keyword map here.

## Consequences
- Faster, more accurate everyday categorisation with a two-tap correction path.
- Adding/renaming a subcategory is a one-line change in the registry; parent
  colours/icons are unchanged so the visual language is stable.
- Mis-detection recourse is now a real picker, not just editing the description.
- The recurring-rule and cart→expense flows re-derive category from the
  description via `autoCategory` (subcategory-aware) — acceptable; a manual
  override on the seeding expense is not carried into the rule (minor).
