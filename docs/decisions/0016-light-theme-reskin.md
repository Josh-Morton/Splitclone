# ADR-0016: Light "wave" theme + Nunito — a token-level reskin

**Status:** Accepted (2026-07-28) · **Source:** Josh (Phase 11); `design_handoff_tally/`
· **Amends [ADR-0007](0007-plain-css-design-tokens.md)** (dark-mode-only + system fonts)

## Context
Josh produced a new design in Claude Design (`design_handoff_tally/Tally.dc.html`
plus a written `Reskin-Guide.dc.html`) moving Tally from the dark, dense
SettleUp look to a light, warm, rounded one: off-white background, white
cards, deep-teal ink, a single switchable teal accent, pill buttons, a
hand-drawn wave motif, and scroll-collapsing headers.

Two structural facts shape how this lands:

- **ADR-0007 committed to "dark-mode-only" and the "system font stack"**, and
  those are repeated as iron rules in `CLAUDE.md` and `docs/ARCHITECTURE.md`.
  The new design contradicts both. ADR-0007's *core* decision (plain CSS +
  design-token custom properties, no Tailwind/UI kit) is unaffected and still
  correct — in fact it's what makes this reskin cheap. Only its palette and
  typeface clauses are superseded.
- **The design covers roughly the Phase-5 app.** Verified by inspection: the
  prototype has four tabs and **zero** coverage of Splitty (Phase 8), receipt
  scanning (Phase 7), push-notification settings (Phase 9), the category
  picker, spaces management, member management, or the current
  password-first login (all Phase 6+). The guide's "explicitly unchanged"
  list also references things that don't exist here (CSV export — Tally
  exports `.xlsx`; offline/pending-sync — Phase 2 is deferred and unbuilt;
  OTP-first onboarding — replaced by password-first in Phase 6) and claims
  percentage/shares split methods are user-facing when the design
  deliberately surfaces only three.

## Decision
- **Reskin by swapping design tokens, not by rewriting components.** ADR-0007
  put every colour, radius and shadow in `globals.css` custom properties and
  banned hard-coded colours in components. That holds — so the palette change
  is mostly one file. Components change only where *shape* changes (pill
  buttons, larger radii) or where new structure is required (wave motif,
  collapsing headers).
- **Light theme replaces dark. No toggle.** Josh's call. One palette to
  maintain and verify; no dark variant of the new look has been designed and
  inventing one would double the QA surface for no asked-for benefit. This
  supersedes ADR-0007's "dark-mode-only" clause — the app becomes
  light-only, not dual-theme.
- **Nunito replaces the system font stack**, per the guide and the prototype
  (400/600/700/800/900). Josh initially preferred keeping system fonts, then
  chose Nunito on the tradeoff that the rounded warmth of the redesign comes
  largely from the typeface. **Self-hosted via `next/font`**, not the Google
  CDN — keeps the "no external asset dependency at runtime" spirit of
  ADR-0007, avoids a third-party request on every load, and gives automatic
  subsetting plus a stable fallback.
- **Twemoji SVGs are vendored locally**, not loaded from jsDelivr. The guide
  itself flags the CDN as a pre-production concern; vendoring ~11 small SVGs
  removes a runtime dependency and a privacy leak, consistent with how this
  project treats every other external asset.
- **Undesigned screens are extrapolated, not redesigned.** Josh's call. The
  token system, radii, pill geometry, icon treatment and header behaviour are
  applied to Splitty, receipt scanning, push settings, category picker,
  spaces and membership screens by following the established patterns.
  Reviewed on a Vercel preview URL before production.
- **This is presentation-only. No behaviour, data, schema, RPC, Edge
  Function or route changes.** Where the reskin guide implies a behavioural
  difference, the guide is treated as a documentation error and existing
  behaviour wins (the guide says as much itself).
- **"Splitty" keeps its name.** Josh confirmed the "make it Tally, not
  Splitty" remark meant removing legacy `splitclone` naming (already scoped
  in Phase 10), not renaming the guest bill-splitting feature he named.
- **The wave motif is decorative only** — never interactive, never carrying
  information, always `aria-hidden`. It must not become a way of encoding
  state.

## Consequences
- **`design_handoff_tally/` becomes the UI reference; `design_handoff_settleup/`
  becomes historical.** Both stay in the repo (this project doesn't rewrite
  history), but `CLAUDE.md` and `docs/ARCHITECTURE.md` must point at the new
  one, and the old `support.js` "never port this" warning applies equally to
  the new prototype's runtime.
- **A meaningful slice of the app has no target design.** Extrapolation is a
  judgement call per screen, so those screens carry more review risk than the
  designed ones — called out explicitly in the phase file so review attention
  goes where it's actually needed.
- **Contrast needs verifying, not assuming.** The guide flags white-on-accent
  at ~3.1:1 for the 46px balance figure (acceptable at that size under WCAG
  large-text rules) but explicitly leaves smaller labels unverified. Light
  themes also make the `--faint` tier easy to under-contrast. This is a real
  accessibility regression risk that the dark theme didn't have.
- **Zero production-data risk.** No migration, no schema touch, no Edge
  Function redeploy. The only stateful surfaces are the service worker cache
  (bumped so clients pick up new CSS) and `theme_color` in the manifest.
- ADR-0007 stays "Accepted" for its architectural core; this ADR is recorded
  as amending only its palette/typeface clauses, so future readers don't have
  to guess which parts still bind.
