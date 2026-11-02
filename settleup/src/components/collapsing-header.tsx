"use client";

/**
 * Sticky header that minimises as you scroll (Phase 11, ADR-0016).
 *
 * This is the "text should move dynamically instead of feeling like a
 * website" behaviour. It **minimises, never disappears** — the title and any
 * header controls stay reachable at every scroll position, which is the rule
 * that separates this from the usual hide-on-scroll pattern.
 *
 * Interpolation is driven by `k` = scrollTop ÷ 44, clamped 0–1:
 *   title      26px → 18px
 *   subtitle   opacity 1 → 0, max-height 20px → 0
 *   padding    tightens
 *   hairline   fades in past k > 0.5
 *
 * Scroll is read from the window.
 *
 * PERFORMANCE (BUG-013): `k` is deliberately NOT React state. This header is
 * on every screen, and storing `k` in state re-rendered it — and the whole
 * `right` subtree — on every scroll event, while a backdrop-filter blur
 * repainted underneath. That was the app-wide scroll jank. Now the scroll
 * listener is rAF-throttled and writes the handful of changed properties
 * straight to the DOM, so scrolling costs no React work at all.
 */

import { useEffect, useRef, type ReactNode } from "react";

const RANGE = 44;

export function CollapsingHeader({
  title,
  subtitle,
  right,
  onTitleClick,
  titleLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  /**
   * Makes the title itself a control — Home uses this for the Tally switcher,
   * which is why Home couldn't use this component before (BUG-011). The ▾ is
   * added automatically so every collapsing title that acts as a menu looks
   * the same.
   */
  onTitleClick?: () => void;
  /** Accessible name for the title button; required when onTitleClick is set. */
  titleLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    let frame = 0;
    let last = -1;

    const paint = () => {
      frame = 0;
      const top = window.scrollY || document.documentElement.scrollTop || 0;
      const k = Math.min(1, Math.max(0, top / RANGE));
      // Sub-pixel changes aren't visible but still cost a style recalc.
      if (Math.abs(k - last) < 0.01) return;
      last = k;
      const lerp = (a: number, b: number) => a + (b - a) * k;
      header.style.padding = `${lerp(10, 5)}px 18px ${lerp(12, 6)}px`;
      header.style.borderBottomColor = k > 0.5 ? "var(--line)" : "transparent";
      if (titleRef.current) titleRef.current.style.fontSize = `${lerp(26, 18)}px`;
      if (subRef.current) {
        subRef.current.style.opacity = String(1 - k);
        subRef.current.style.maxHeight = `${lerp(20, 0)}px`;
      }
    };

    const onScroll = () => {
      // Coalesce a burst of scroll events into one write per frame.
      if (!frame) frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      ref={ref}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--surface-blur)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        margin: "0 -18px",
        // Resting (k = 0) values; the effect above owns these once scrolled.
        padding: "10px 18px 12px",
        borderBottom: "1px solid transparent",
        transition: "border-color var(--d-fast) linear",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1
          ref={titleRef}
          style={{
            fontSize: 26,
            fontWeight: "var(--w-black)" as unknown as number,
            letterSpacing: "-0.8px",
            lineHeight: 1.15,
            transition: "font-size var(--d-fast) linear",
            minWidth: 0,
          }}
        >
          {onTitleClick ? (
            <button
              onClick={onTitleClick}
              aria-label={titleLabel}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                letterSpacing: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {title} <span style={{ color: "var(--faint)", fontSize: "0.62em" }}>▾</span>
            </button>
          ) : (
            title
          )}
        </h1>
        {right}
      </div>
      {subtitle && (
        <div
          ref={subRef}
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--muted)",
            opacity: 1,
            maxHeight: 20,
            overflow: "hidden",
            transition: "opacity var(--d-fast) linear, max-height var(--d-fast) linear",
          }}
        >
          {subtitle}
        </div>
      )}
    </header>
  );
}
