# ADR-0010: Salary-proportional shares computed server-side (privacy-preserving)

**Status:** Accepted (2026-07-13) · **Source:** scope doc §7.5 ("shares are shown, not incomes"), design onboarding copy ("Your partner only ever sees the split amounts — never your income")

## Context
Computing a salary-proportional split needs every participant's salary, but
salaries are private by default (RLS: owner-only unless `salary_visible`).
Computing shares on the client would require shipping the partner's salary to
the requesting device — breaking the privacy promise.

## Decision
A `salary_split_shares(group_id, total_cents, member_ids[])` Postgres function
(SECURITY DEFINER, caller must be an active group member) reads the private
salaries server-side, runs the **same largest-remainder algorithm as the
domain layer** (floor shares, distribute remainder cents by largest fractional
part, ties broken by input order), and returns only the resulting share_cents
per member. If any participant has no salary (incl. all placeholder members),
it returns `has_salary=false` rows and the client falls back to equal with the
standard warning.

`profile_public.salary_visible` remains the opt-in for *showing* the salary
figure itself; it is not required for proportional splits to work.

## Consequences
- The privacy promise holds: only computed shares leave the database. (The
  salary *ratio* is inherently derivable from the shares — scope §7.5 accepts
  this; it is the feature.)
- The SQL and TypeScript implementations of largest-remainder must stay in
  lockstep; the flagship worked example (R12 000 at 40k/20k → R8 000/R4 000)
  is E2E-tested against the live RPC.
- Server dependency: when the offline phase lands (ADR-0009), salary splits
  need a fallback (equal + pending recompute, or cached shares).
- The expense sheet computes salary shares asynchronously (debounced RPC call)
  instead of synchronously; demo mode computes locally in MemoryRepo.
