# ADR-0003: Integer cents everywhere; largest-remainder split algorithms

**Status:** Accepted (2026-07-02) · **Source:** Scope doc §7 ("the golden rule")

## Context
Floating-point money produces cent drift; a wrong balance erodes trust in the
whole app faster than any missing feature.

## Decision
- All monetary values are **integer ZAR cents** end-to-end (TypeScript `Cents`
  type, Postgres `bigint`). Formatting to `R1 200,00` (space thousands, comma
  decimals) happens only at display time (`lib/domain/money.ts`).
- Every split distributes the **exact** total: equal splits give the remainder
  cents to the first participants in order; weighted splits (percent / shares /
  salary) use the **largest-remainder (Hamilton) method** with deterministic
  tie-breaking (`lib/domain/split.ts`).
- Salary-proportional split is a weighted split with salaries as weights; if
  any participant lacks a salary it **falls back to equal** and the UI warns.
- Invariants enforced three times: domain functions construct-correct splits,
  the Repo validates on write, and deferred Postgres triggers reject any
  expense whose payers or splits don't sum to the total.

## Consequences
- Zero cent drift by construction; balances always net to zero.
- ZAR only (multi-currency is an explicit non-goal).
- Any new split method must route through `splitWeighted`/`splitEqual` rather
  than doing its own arithmetic.
