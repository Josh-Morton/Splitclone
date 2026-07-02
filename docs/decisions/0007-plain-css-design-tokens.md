# ADR-0007: Plain CSS with design-token custom properties (no Tailwind, no UI kit)

**Status:** Accepted (2026-07-02) · **Source:** design handoff README (tokens + "high fidelity")

## Context
The handoff is high-fidelity with exact color/type/radius/shadow tokens and a
dark-mode-only, mobile-first layout. It uses the system font stack and inline
SVG icons — no external assets or fonts.

## Decision
- Design tokens live as **CSS custom properties** in
  `settleup/src/app/globals.css`, copied verbatim from the handoff README.
  That file is the single source of styling truth; components reference
  `var(--…)` only and never hard-code colors.
- **No Tailwind, no component library.** The design is bespoke and small
  (~10 screens); a UI kit would fight the fidelity requirement, and utility
  classes add a dependency without removing work here.
- System font stack; icons recreated as inline SVG; category glyphs may use
  the tinted-tile + emoji approach from the prototype.

## Consequences
- Pixel-faithful recreation is straightforward; token changes propagate app-wide.
- Some CSS verbosity per component (accepted; scope is small).
- If the team ever grows, revisit — this is the easiest ADR to supersede.
