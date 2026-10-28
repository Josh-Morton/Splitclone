*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 18 — Learning categorisation engine 🟡 §1 LIVE (2026-10-20) · §5 LIVE (2026-10-28) · §2–§4 SPEC ONLY

> **§1 release check (2026-10-20, shipped in `9f366c2`).** Before release it
> was verified against production: no subcategory slug removed (six added);
> `expense.category` / `recurring_expense.category` are plain `text` with no
> CHECK constraint and no function or trigger validates the value, so the new
> slugs save; all 19 distinct category values across the 130 stored rows still
> resolve to a labelled category; the public API is additive and
> `autoCategory`'s signature is unchanged; all 62 categories have a vendored
> icon. Existing expenses are untouched — §1 only changes how *new*
> descriptions are auto-filed. Re-filing old ones is §5 (backfill), shipped
> 2026-10-28; see [§5b](#5b--shipped-2026-10-28).

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
  once §1 and §2 land. *(2026-10-28: [Phase 20](phase-20-reporting-v2.md) adds
  the drill from category → subcategory → individual expenses. This section's
  filter-sheet widening is still separate and still optional.)*
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

### 5a · Build spec (2026-10-28)

> **Effort:** M · **Credits:** ~12–20. That's more than the S–M first
> quoted, because the measurement below showed the engine alone barely
> dents *Other*, so two more evidence sources were added.
>
> Josh's constraints for this run: **no spending information may be lost**;
> legacy categories may be changed.

**What the live data says (2026-10-28, aggregates only; the repo is
public).** There are 136 live expenses across 4 Tallies. *Other* holds 46 rows
and R16 701, which is 38% of all spend. A further 47 rows sit in a bare
parent bucket, almost all of them `groceries` (now labelled *Supermarket*). A
dry run of the §1 engine over the 46 *Other* rows re-files only **6**. The
rest break down like this:

- **One recurring payee's name, about half of Other by value.** The engine
  can't know a person's name, and must never be taught one in a public
  library. But the same Tally already filed one identical entry under a
  specific subcategory by hand, which is exactly the household's own
  evidence that §2's local tier is meant to use.
- **Ordinary words the library lacks:** Afrikaans meal and toiletry words,
  a few common dishes, pet, garden and hardware odds and ends, a Cape Town
  cinema, and emphasis spellings with stretched letters ("driiinks").
- **Things that genuinely are Other:** cash, a balance-equaliser entry, test
  rows and keyboard mash. These stay put.

**Rules, in precedence order.** `planRefiles()` in
`src/lib/domain/category-backfill.ts` is pure and unit-tested.

1. **Only fallback rows are candidates:** `other`, an unknown slug, or a
   *general* bucket (each parent's "(other)" bucket, including `groceries`,
   `utilities` and `entertainment`). Specific subcategories are never
   touched (ADR-0019), even where the engine now disagrees. Tombstoned rows
   are skipped.
2. **The household's own filing wins.** If other live rows in the **same
   Tally** with the identical normalised description are all filed under one
   specific subcategory, use it. If they disagree, there's no household rule
   and the row falls through to the engine. Nothing crosses Tallies, so this
   is ADR-0019's local tier, applied backwards.
3. **Otherwise the engine** (`scoreCategory`), with a bar that depends on
   how much the move changes:
   - from `other`: any match. That's what the app would file today.
   - within the same parent (e.g. Supermarket → Liquor): any match. Parent
     totals don't move; the row only gains detail.
   - to a **different** parent: only when the engine is confident
     (`CONFIDENT_MIN_SCORE` 2 and `CONFIDENT_MIN_MARGIN` 1, named constants
     §3 will reuse). This keeps a hand-picked "Groceries" for *Dinner Friday*
     from becoming *Restaurant* on one weak word.
4. **Never move a row to `other`**, to the slug it already has, or from one
   general bucket to another.
5. **Recurring templates** are included under the same rules, so the next
   generated expense inherits the better category.

**Library additions (§1 follow-up).** These are generic vocabulary only:
never a personal name, and nothing a stranger couldn't have typed. Stretched
letters are collapsed during normalisation (`driiinks` → `drinks`). Runs of 3
or more letters only, so `coffee` and `bottle` are untouched. The corpus test
gains the new cases, and an integrity check makes sure no library entry
itself contains such a run.

**Provenance.** A migration adds `expense.category_source`
(`auto` | `manual` | `learned`, default `auto`). `create_expense` and
`update_expense` read it from `p_expense`; on update a missing key keeps the
stored value, so old clients change nothing. The Add/Edit sheet sends
`manual` only when the person actually picked from the category picker in
that session. Re-running the backfill skips anything not `auto`.

**Safety.** Spending information is never touched:

- The apply step is **one SQL statement**: a CTE updates `category` only,
  guarded by `category = before` (and `category_source = 'auto'`), and logs
  every change to `category_backfill`. A row edited since the plan was made
  is skipped, not overwritten.
- **Spending fingerprint.** Inside the same transaction, an md5 is taken over
  every expense column except `category`, `category_source`, `version` and
  `updated_at`, plus every payer and split row, before and after. If they
  differ, an exception aborts the transaction and nothing is written.
- **Dry run = the real statement inside `begin … rollback`.** It exercises
  the constraints, triggers and fingerprint against live data and leaves no
  trace. This replaces "a throwaway copy".
- **Reversible.** `category_backfill` holds (run id, table, row id, before,
  after, reason) with RLS on and no policies (service-only). `revert <run>`
  restores `before` wherever the row still holds `after`.
- Updating a row bumps its `version` and `updated_at` (the sync trigger),
  which is correct: the category did change. No activity rows and no push
  notifications are written.

**Running it.** `npm run backfill:categories -- plan | apply | revert <run-id>`
in `settleup/`, with `SUPABASE_ACCESS_TOKEN` in the environment (the
logged-in Supabase CLI's token). `plan` prints the diff and the before/after
distribution and proves the statement in a rolled-back transaction.

### 5b · Shipped (2026-10-28)

Built as specced in §5a. Migration `20261028000000_category_provenance`
applied to production (rehearsed first inside a rolled-back transaction) and
recorded in `supabase_migrations.schema_migrations`.

**Run `e4279c0d-1602-4263-b0b5-9273057e97f6`** re-filed **36 rows**: 35
expenses and 1 recurring template.

| | Before | After |
|---|---|---|
| *Other* (the slug itself) | 46 rows · R16 701 · **38%** of spend | 13 rows · R4 766 · **11%** |
| Any general bucket | 93 rows | 59 rows |
| Total live spend | R43 727,37 | R43 727,37 |

- **13 by the household rule** (12 expenses + the template that generates
  them): one recurring payee the Tally had already filed specifically once.
- **23 by the engine.** 21 came from *Other*; one *Supermarket* → *Pets* was
  confident (3 vs 0.75); one *Transport (other)* → *Public* was same-parent.
  Sixteen of the 23 only matched because of the §5a library additions.
- **What's left in Other** is genuinely unknowable to a deterministic
  matcher: cash, a balance-equaliser entry, test rows, keyboard mash,
  misspellings, a bare name, and a few one-off places. Each can be fixed by
  hand from the Reports drill-down; a hand fix is now recorded as `manual`,
  so no future run will undo it.
- **Left alone on purpose:** 4 specific-subcategory rows the new engine
  disagrees with (ADR-0019: no provenance, so no overwrite), and two
  *Supermarket* rows with a single weak meal word, which would have needed
  a cross-parent move.

**Verification.**

- **Spending untouched, two ways.** The in-transaction fingerprint matched,
  and a full before/after snapshot diff of all 605 expense, payer, split and
  template rows found **zero** differences outside `category`, `version`
  and `updated_at`.
- **Reversible.** `revert --dry-run` restored the exact original
  distribution, 36 of 36 rows, then rolled back.
- **Idempotent.** A second `plan` finds nothing to re-file.
- **Provenance.** As a signed-in user in a rolled-back transaction, an edit
  that sends `manual` stores it, and a later edit that doesn't send it keeps
  `manual`. The `MemoryRepo` test covers the same contract. Audit-table
  privileges: `authenticated` and `anon` have none.
- **App.** 471 tests, tsc, lint and build are green. In the demo, the Add
  sheet auto-files `Driiinks with friends` as *Bars & drinks*, and a
  hand-picked category saves with no console errors.

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
8. ✅ Backfill script — dry run, diff, then apply. *Done 2026-10-28 (§5b).*
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
  ✅ 2026-10-28: *Other* fell from 38% to 11% of spend (§5b).
- `npm test` + build + lint green; the whole flow browser-verified in the
  demo and spot-checked against live Postgres on a throwaway group.
