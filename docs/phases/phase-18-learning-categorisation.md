*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 18 — Learning categorisation engine 🟡 §1 LIVE (2026-10-20) · §2–§5 SPEC ONLY

> **§1 release check (2026-10-20, shipped in `9f366c2`).** Before release it
> was verified against production: no subcategory slug removed (six added);
> `expense.category` / `recurring_expense.category` are plain `text` with no
> CHECK constraint and no function or trigger validates the value, so the new
> slugs save; all 19 distinct category values across the 130 stored rows still
> resolve to a labelled category; the public API is additive and
> `autoCategory`'s signature is unchanged; all 62 categories have a vendored
> icon. Existing expenses are untouched — §1 only changes how *new*
> descriptions are auto-filed. Re-filing old ones is §5 (backfill), not built.

> **Effort:** XL · **Credits:** ~55–100 — a new engine, a new cross-tenant
> table with consensus logic, an ambiguity UI, report changes and a
> production backfill. Comparable to Phase 14 plus Phase 2's data risk. See
> [Estimating scale](../ROADMAP.md#estimating-scale).
>
> Read **[ADR-0019](../decisions/0019-learning-categorisation-engine.md)**
> first — it settles the engine swap, the two-tier global learning model, the
> ambiguity rule and the backfill safety rule.
>
> **Source of truth for the matcher:**
> [`docs/reference/categoryMatrix-2026-08-27.ts`](../reference/categoryMatrix-2026-08-27.ts)
> — Josh's rewritten engine, vendored so it can't be lost. Its public API is
> identical to the current `category.ts`, so it drops in.

## Status (2026-10-20)

**§1 (engine swap) and build-order steps 1 and 10 are done.** `category.ts`
now runs the scoring engine, the library grew from 439 to 2 339 entries, and
[`CATEGORY-MATRIX.md`](../CATEGORY-MATRIX.md) has been regenerated with a
full requirements audit. §2–§5 (learning, the ambiguity UI, report filters,
backfill) are still spec only. Remaining estimate: **Effort:** L ·
**Credits:** ~35–70.

**Where the build deviates from the vendored reference**, each change driven
by a failing case:

- **Four vocabulary tiers per subcategory** (`brands` / `keywords` / `weak` /
  `retailers`) replace the global `STRONG_BRANDS` / `RETAILER_BRANDS` sets, so
  a brand can't be listed in one place and forgotten in the other. The new
  `weak` tier (0.75) exists for ambiguous words: `dinner`, `bar`, `ticket`,
  `prepaid`, `subscription`.
- **Typo tolerance only for brands/retailers (≥6 letters) and keywords
  (≥7)**, never for weak words. The reference fuzzed every word of 5+
  letters, contradicting its own doc comment, and read "team" as "steam".
- **Separator-free matching respects word boundaries.** The reference matched
  the squashed text as a raw substring, so "laptop update" spelled *top up*
  and "drinking games" spelled *in-game*.
- **A word the library knows exactly is never re-read** as another keyword's
  plural, prefix or typo ("bolts" is hardware, not Bolt; "electrician" is not
  "electric").
- **Phrases claim their words.** Each token is credited once per subcategory
  at its strongest reading, so `car insurance` scores 3, not 3 + 1.
- **`scoreCategory` also returns `candidates`** (top three), which §3 needs.
- **Bare "coffee" stays Groceries.** The reference sent it to Café, which
  would have broken the existing test.
- **Taxonomy:** six subcategories were added under existing parents (clothing,
  personal care, electronics, online shopping, tax/legal/admin, loans & credit),
  despite this file's "no taxonomy change" non-goal. That spend was falling into
  *Other*, which is exactly the problem this phase targets. Parents, colours and
  glyphs are unchanged. Recorded in [ADR-0011](../decisions/0011-two-level-categories.md).
- **The legacy `other_insurance` alias is hidden from the picker**, which
  used to show two "Insurance" chips under Bills.

Tests: `category.test.ts` (including the six §1 regressions below) and
`category-corpus.test.ts` (a ~300-case golden corpus of real-world SA
descriptions, plus library-integrity checks: no word listed twice, and every
brand and keyword typed alone files under its own subcategory).

User-added assignments (an explicit rule editor, which reverses this phase's
"no user-facing rule editor" non-goal) are specced separately in
[Phase 19](phase-19-category-assignments.md).

## Why this is worth doing

Measured against the live database on 2026-08-28:

| Bucket | Count | Share |
|---|---|---|
| `other` | 22 | 39% |
| `groceries` (bare parent) | 14 | 25% |
| 12 real subcategories | 20 | 36% |

**64% of expenses are in a fallback bucket.** Reports' drill-down (the
headline of ADR-0011) currently opens onto a third of all spending labelled
"Other". This phase is what makes that feature real.

## 1 · Swap the matcher engine

Replace `src/lib/domain/category.ts` with the vendored matrix. What changes
inside, and why each part matters — none of this should be trimmed on the way
in:

- **Scoring replaces first-match-wins.** Priority now comes from evidence
  strength. Registry order is *only* a tie-breaker. This means keywords can be
  added freely without worrying about position — the single biggest
  maintainability win.
- **Separator/accent normalisation.** `lower` → accents stripped → tokenised →
  also `squash`ed (all separators removed). This is what makes
  `ster kinekor` / `ster-kinekor` / `sterkinekor` and `pick 'n pay` /
  `pick n pay` / `pnp` unify.
- **`RETAILER_BRANDS` weighted 0.5.** Retailers say *where*, not *what*. Keeps
  a bare `"checkers"` → Groceries while letting `"wine at checkers"` → Liquor
  and `"woolworths sushi"` → Restaurant.
- **`STRONG_BRANDS` weighted +1 and fuzzy-eligible.** Distinctive single
  tokens only; multi-word brands already score high via the phrase bonus.
- **`editWithin1` bounded Levenshtein**, applied only to tokens ≥5 chars,
  discounted ×0.75. Absorbs `netflx`, `nandoos`, `woolies` without letting a
  typo outrank a clean hit.
- **Per-token and per-phrase credit maps.** Each covered token is credited
  once at its strongest weight, so listing both `ticket` and `tickets` — or a
  keyword that both exact- and prefix-matches — never double-counts.
- **`scoreCategory()` returns `{ slug, score, runnerUp }`.** Keep this
  internal function exported or otherwise reachable: §3 depends on it.

**Tests.** The existing category tests must keep passing, and the engine's own
guarantees need coverage that would have caught the two bugs it was written to
fix: `"ster kinekor"` (space) → Movies, `"uber eats"` → Takeaway regardless of
registry order, `"wine at checkers"` → Liquor, `"netflx"` → Streaming,
`"car"` ✗ `"cardigan"`, `"tea"` ✗ `"steam"`.

## 2 · Learned rules (the shared brain)

### Schema
```sql
-- A correction event. Append-only; the raw description is NEVER stored.
create table category_correction (
  id uuid primary key,
  -- The extracted candidate term, normalised (lower, accent-stripped,
  -- squashed). Never free text from the user.
  term text not null,
  -- What the user chose instead.
  chosen_slug text not null,
  -- What the engine had guessed, for disagreement analysis. Null = no guess.
  engine_slug text,
  actor_id uuid not null references auth.users (id),
  group_id uuid not null references "group" (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (term, actor_id, group_id)   -- one vote per person per Tally per term
);

-- The aggregated, active rule set. Rebuilt from corrections; never written
-- directly by a client.
create table category_rule (
  term text primary key,
  slug text not null,
  -- Promotion evidence, so the threshold can be audited and retuned.
  distinct_users int not null default 0,
  distinct_groups int not null default 0,
  agreement numeric not null default 0,   -- 0..1
  status text not null default 'candidate'
    check (status in ('candidate', 'active', 'blocked')),
  updated_at timestamptz not null default now()
);
```

**RLS.** `category_rule` is `select` to `authenticated` (it's the shared
brain — everyone reads it) and has **no client write policy at all**.
`category_correction` allows a user to insert only their own row
(`actor_id = auth.uid()` and a membership check on `group_id`), and to select
only their own. Aggregation runs as `security definer`.

### Promotion
A term goes `candidate` → `active` only at **≥3 distinct users AND ≥3
distinct Tallies AND ≥70% agreement** (ADR-0019). Below that it still applies
**locally** to the correcting user's own Tally — instant benefit, no risk to
anyone else.

This threshold is also the PII filter: "Sarah" won't be corrected identically
by three unrelated households; "Builders" will. Do not weaken it without
re-reading that reasoning.

`blocked` exists so a bad term can be killed permanently without deleting the
correction history.

### Term extraction — the genuinely hard part
When a user overrides a category, we must decide *which word taught us*. Do
not skip this or the table fills with noise:

- Tokenise the description with the engine's own normaliser (reuse
  `buildCtx`, don't reimplement).
- Drop tokens already carrying strong evidence for the chosen slug — they
  taught nothing new.
- Drop stopwords, pure numbers, currency amounts, and any token matching a
  member's display or placeholder name in that Tally (cheap, high-value PII
  guard on top of the consensus one).
- Prefer the **longest remaining distinctive token or adjacent pair**. If
  nothing survives, record no correction rather than a junk one.

### Applying rules at match time
`autoCategory` gains an optional rule set: `autoCategory(desc, rules?)`.
Rules are checked *before* the static registry and win outright when they hit
— a learned correction should beat a keyword guess. The signature stays
backward-compatible so untouched call sites keep working.

Rules load with the existing home-screen parallel batch (Phase 16), so this
costs **no extra round trip**. An empty or failed rule fetch degrades to the
static engine — categorisation must never be blocked on the network.

## 3 · Ambiguity: ask instead of guessing

Using `scoreCategory`'s `{ score, runnerUp }`:

- **Confident** — `score ≥ 2` and `score − runnerUp ≥ 1`: assign silently, as
  now.
- **Ambiguous** — a winner exists but the margin is thin: assign it, but show
  an inline chip row of the top 3 candidates so one tap re-files it.
- **No idea** — `score === 0`: land in `other` as now, but surface the picker
  affordance more prominently.

Thresholds must be **named constants in the domain layer with tests**, not
magic numbers inline — they will need tuning against real data.

Every pick from this row is a correction event. Ambiguous cases are exactly
the ones that teach fastest, which is why this UI is part of the learning
system rather than cosmetic.

## 4 · Reporting

- **Subcategory filtering.** `ReportFilters.categories` is
  `Set<ParentCategory>` — parent-only — while the breakdown already drills
  down. Widen to accept subcategory slugs, keeping parent selection as
  "select all children" so existing saved behaviour is unchanged.
- **Drill-down stays as-is structurally** (ADR-0011) — it only becomes useful
  once §1 and §2 land.
- **Export already emits a `Subcategory` column** (`src/lib/export.ts`) —
  verify it still reads correctly after the swap; no change expected.

## 5 · Retrospective backfill

**Only rows in a fallback bucket** — `category = 'other'` or a bare parent
slug — are re-categorised. Anything already in a specific subcategory is left
alone, because there is no provenance record distinguishing a human's
deliberate choice from a matcher guess (ADR-0019).

- Add `expense.category_source text` (`auto` | `manual` | `learned`),
  defaulting to `auto`, so this ambiguity never recurs. Set `manual` whenever
  a user overrides.
- The backfill is a **one-off script run through the Management API**, not a
  migration that runs on deploy — it must be observable and repeatable.
- **Record the previous value** (`category_before`) or dump a CSV first, so
  the whole operation is reversible.
- Run against a **throwaway copy of the rows first**, diff the before/after
  distribution, and eyeball it before touching real data.
- 56 rows today, so it's fast — but write it to be re-runnable, because it
  will be run again after the rule set has learned something.

## Non-goals

- **No taxonomy change.** Seven parents, same subcategories, same Phase 11
  parent glyphs.
- **No change to `expense.category`'s type.** Still free text; legacy slugs
  still resolve.
- **No ML/LLM categorisation.** This is deterministic scoring plus counted
  human corrections — debuggable and explainable, which an embedding model
  would not be.
- **No user-facing rule editor.** Corrections are implicit, from normal use.
- **No re-categorisation of specific subcategories** without the review
  screen, which is explicitly deferred.

## Build order

1. ✅ Swap the engine + tests (self-contained, shippable alone; §1). *Done 2026-10-20.*
2. Migration: two tables, RLS, `category_source`, and the
   `record_category_correction` RPC.
3. Term extraction + correction recording on every manual override.
4. Aggregation/promotion function + a scheduled job to refresh `category_rule`.
5. Rule loading into the home batch; `autoCategory(desc, rules?)`.
6. Ambiguity chip row in add-expense.
7. Report subcategory filtering.
8. Backfill script — dry run, diff, then apply.
9. Update the privacy-policy backlog item to name the global rule table.
10. ✅ **Regenerate [`docs/CATEGORY-MATRIX.md`](../CATEGORY-MATRIX.md).** *Done 2026-10-20.* That
    readable snapshot currently documents the OLD engine — it states that
    `autoCategory` "walks the subcategory registry **in the order below** and
    returns the first subcategory with a keyword hit", and that order is
    therefore meaningful. Both stop being true the moment §1 lands: scoring
    replaces first-match, and order degrades to a tie-breaker. Leaving it
    would actively mislead the next reader.

## Verify

- Engine: the six regression cases in §1, plus every existing category test.
- Learning: a correction applies to your own next expense immediately;
  a second unrelated Tally does **not** see it until the 3/3/70% threshold is
  met; crossing the threshold flips `status` to `active` and it then applies
  to a third, uninvolved account.
- PII: a description containing a member's name never produces a correction
  row for that name.
- Security: a client cannot INSERT into `category_rule` directly (expect an
  RLS rejection), and cannot insert a `category_correction` for another user.
- Ambiguity: a deliberately ambiguous description ("checkers") offers
  candidates; a clean one ("netflix") does not.
- Backfill: dry-run diff reviewed; specific subcategories untouched; the
  before/after distribution improves the 64%-in-fallback figure materially.
- `npm test` + build + lint green; the whole flow browser-verified in the
  demo and spot-checked against live Postgres on a throwaway group.
