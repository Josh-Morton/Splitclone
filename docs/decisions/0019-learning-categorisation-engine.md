# ADR-0019: Scoring categorisation engine + a globally-learned rule set

**Status:** Accepted, not yet built (2026-08-28) · **Source:** Josh · ROADMAP Phase 18

**Extends** [ADR-0011](0011-two-level-categories.md) (two-level taxonomy). The
taxonomy itself is unchanged — seven parents, subcategories underneath. What
changes is *how a description becomes a slug*, and the fact that the mapping
now learns.

## Context

Three separate problems, one phase.

**1. The matcher is order-dependent and punctuation-literal.** Today's
`autoCategory` walks the registry and returns the FIRST subcategory whose raw
substring appears in the text. So `"uber eats"` only beats `"uber"` because
takeaway happens to sit above transport in the file — reordering the list
silently changes results. And `"ster kinekor"` (space) matches nothing because
the keyword is stored hyphenated, falling through to Other: the exact cinema
case the taxonomy exists to handle.

**2. It never learns.** A user who corrects a category teaches the app
nothing. The same description mis-files identically forever, for them and for
everyone else.

**3. It is measurably not working.** Against the live database today:

| Bucket | Count | Share |
|---|---|---|
| `other` | 22 | 39% |
| `groceries` (bare parent) | 14 | 25% |
| everything else (12 real subcategories) | 20 | 36% |

**64% of real expenses sit in a fallback bucket**, which makes the Reports
drill-down (ADR-0011's headline feature) close to useless — you drill into
"Other" and find a third of your spending.

## Decision

### The engine becomes a scorer, not a first-match walker
Adopt the rewritten matcher supplied by Josh (vendored at
[`docs/reference/categoryMatrix-2026-08-27.ts`](../reference/categoryMatrix-2026-08-27.ts)).
Every subcategory is scored; the strongest evidence wins; **registry order
survives only as a tie-breaker.** Specifically:

- **Normalisation** — lower-case, accents stripped (`café`→`cafe`), tokenised,
  and *squashed* (all separators removed) so `ster kinekor` ==
  `ster-kinekor` == `sterkinekor`, `e-toll` == `e toll`, `pick 'n pay` ==
  `pick n pay`.
- **Weighted evidence** — multi-word phrases and distinctive brands score
  high; generic multi-category **retailers** (Checkers, PnP, Woolworths,
  Makro) score 0.5, so *what* was bought beats *where*: `"wine at checkers"`
  → Liquor, not a bare supermarket line.
- **Bounded fuzz** — distinctive tokens ≥5 chars match within Levenshtein-1,
  so `netflx`, `nandoos`, `woolies` land. Fuzzy hits are discounted ×0.75 so
  they can never beat a clean match.
- **Word-awareness** — single words must hit a whole token, a simple plural,
  or a ≥6-char prefix. Never a bare substring (`car` ✗ `cardigan`,
  `tea` ✗ `steam`).

The public API is unchanged (`autoCategory(desc): Category`), so this is a
drop-in for every existing call site.

### Learned corrections are global, gated by consensus
Josh's call: corrections feed **one shared brain** across all users, not a
per-Tally silo. That is the strongest long-term engine, but a naive global
table has two failure modes that must be designed out, not discovered:

- **Poisoning** — one person mis-teaching a mapping would change categories
  for strangers.
- **Leakage** — descriptions contain personal text ("Gift for Sarah", "Mom's
  meds"), and a global keyword table built from raw descriptions would expose
  one household's vocabulary to everyone.

So the rule set is **two-tier**:

| Tier | Applies to | Takes effect | Purpose |
|---|---|---|---|
| **Local** | the correcting user's Tally | immediately, on the next expense | the user gets instant benefit from their own correction |
| **Global** | everyone | only after **≥3 distinct users** across **≥3 distinct Tallies** agree, with **≥70% agreement** among corrections for that term | protects the shared brain from one bad or idiosyncratic teacher |

**The consensus threshold is also the privacy mechanism, which is the elegant
part.** A personal name ("Sarah") will never be corrected the same way by
three unrelated households; a merchant ("Builders", "Vida") will. Requiring
cross-household agreement filters PII out structurally rather than relying on
a blocklist. Raw descriptions are **never** stored in the global table — only
the extracted candidate term and vote counts.

### Corrections are recorded as events, not direct rule writes
Clients never INSERT into the rule table. They call an RPC that records a
*correction event* (term, chosen slug, actor, Tally). Aggregation into active
rules happens server-side. This keeps RLS simple — the rule table is
world-readable to authenticated users and writable only by the RPC/service
role — and means the promotion logic can be retuned without a client release.

### Ambiguity asks instead of guessing
The scorer already returns `score` and `runnerUp`. When the winner is weak
(below a floor) or the margin over the runner-up is thin, the add-expense
sheet **presents the top candidates for the user to pick** rather than
silently choosing. Every such choice is also a correction event, so the
ambiguous cases are exactly the ones that teach fastest.

### Retrospective backfill only touches fallback buckets
There is **no record of which existing categories were chosen by a human**
versus guessed by the matcher — no provenance was ever stored. A blind
re-run would silently overwrite deliberate corrections.

So the backfill re-categorises **only rows currently in `other` or a bare
parent slug** (36 of 56 today), and leaves any specific subcategory alone.
Going forward a `category_source` column records provenance (`auto` |
`manual` | `learned`), so a future backfill *can* be precise.

## Consequences

- **`expense.category` stays free text.** No enum, no FK, no migration of
  existing values beyond the targeted backfill. Legacy slugs continue to
  resolve because they remain in the registry re-parented to their new home.
- **A new global table introduces the project's first cross-tenant data.**
  Everything to date has been strictly Tally-scoped by RLS. This is a
  deliberate exception with a narrow shape (term → slug → counts) and no
  free text. **It must be named in the privacy policy** — which is currently
  an open [backlog](../BACKLOG.md) item and becomes a harder dependency for
  public launch because of this ADR.
- **Reports gain subcategory filtering.** Today `ReportFilters.categories` is
  `Set<ParentCategory>` — parent-only — while the breakdown already drills
  down. That asymmetry is why the drill-down feels half-built, and it only
  becomes worth fixing once categorisation is accurate enough to drill into.
- **Matching stays client-side.** It is synchronous, needs no round trip, and
  the add-expense sheet already calls it on every keystroke. Learned rules
  ride along in the existing parallel home-screen load (Phase 16), so this
  adds no round trip. Only the backfill and the aggregation run server-side.
- **The 11-glyph icon mapping from Phase 11 is unaffected** — it maps
  *parents*, and the taxonomy's parents don't change.
