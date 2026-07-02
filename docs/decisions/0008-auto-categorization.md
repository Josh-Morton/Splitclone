# ADR-0008: Categories auto-detected from description; no manual picker

**Status:** Accepted (2026-07-02) · **Source:** design handoff (Add Expense screen + `autoCategory()`)

## Context
The designed Add-Expense sheet deliberately has **no category picker** — the
category is inferred from the description ("Woolworths groceries" → Groceries).
This is an intentional friction-reduction choice, not an omission.

## Decision
- The keyword map from the prototype's `autoCategory()` is ported verbatim to
  `settleup/src/lib/domain/category.ts` and is the single source of truth.
  Map order matters (earlier categories win — e.g. "uber eats" hits Eating out
  before Transport); preserve it when adding keywords.
- Fixed category list for v1: Groceries, Rent, Utilities, Eating out,
  Transport, Household, Entertainment, Other — with the accent colors from the
  design tokens. User-editable categories are deferred (scope §14 #4).
- The computed category is stored on the expense (not recomputed on read), so
  future keyword changes don't rewrite history.

## Consequences
- Fastest possible expense entry; ZA-specific merchants (Checkers, PnP,
  Woolies, Bolt, DSTV…) categorize correctly out of the box.
- Mis-categorization is possible; the recourse is editing the description (or
  a manual override field later — would need a small design addition).
