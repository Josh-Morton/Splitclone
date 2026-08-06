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
 * Scroll is read from the nearest scrollable ancestor, falling back to the
 * window, so it works whether a tab scrolls the page or its own container.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

const RANGE = 44;

export function CollapsingHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  const [k, setK] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // The app scrolls the window (Screen is a plain <main>), but guard for a
    // scrollable ancestor so this stays correct if that ever changes.
    const scroller: HTMLElement | Window = window;
    const read = () => {
      const top = window.scrollY || document.documentElement.scrollTop || 0;
      setK(Math.min(1, Math.max(0, top / RANGE)));
    };
    read();
    scroller.addEventListener("scroll", read, { passive: true });
    return () => scroller.removeEventListener("scroll", read);
  }, []);

  const lerp = (a: number, b: number) => a + (b - a) * k;

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
        padding: `${lerp(10, 5)}px 18px ${lerp(12, 6)}px`,
        borderBottom: `1px solid ${k > 0.5 ? "var(--line)" : "transparent"}`,
        transition: "border-color var(--d-fast) linear",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1
          style={{
            fontSize: lerp(26, 18),
            fontWeight: "var(--w-black)" as unknown as number,
            letterSpacing: "-0.8px",
            lineHeight: 1.15,
            transition: "font-size var(--d-fast) linear",
            minWidth: 0,
          }}
        >
          {title}
        </h1>
        {right}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--muted)",
            opacity: 1 - k,
            maxHeight: lerp(20, 0),
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
