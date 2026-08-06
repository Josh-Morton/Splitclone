"use client";

/**
 * The wave motif (Phase 11, ADR-0016).
 *
 * Two pieces, both pure presentation and both token-driven so a future theme
 * restyles them for free:
 *
 *   <WaveHero>  a full-bleed accent panel with drifting wave lines and a
 *               curved lower edge — used on the welcome screen and the
 *               Splitty guest page, the two screens seen before sign-in.
 *   <WaveCard>  the same treatment scaled down for the Home balance block.
 *
 * The drift animation is ambient decoration; globals.css disables it under
 * `prefers-reduced-motion` along with everything else.
 */

import type { CSSProperties, ReactNode } from "react";

/** Repeating wave path, wide enough that a -160px drift never shows an end. */
function WaveLines({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <svg
          key={i}
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: 0,
            width: "200%",
            height: 120,
            top: `${18 + i * 22}%`,
            // Alternating speed/direction keeps it from reading as one block.
            animation: `waveDrift ${13 + i * 3}s linear infinite alternate`,
            opacity: 0.6 - i * 0.1,
          }}
        >
          <path
            d="M0,60 C150,10 300,110 450,60 C600,10 750,110 900,60 C1050,10 1200,110 1200,60"
            fill="none"
            stroke="var(--on-accent)"
            strokeWidth={2}
          />
        </svg>
      ))}
    </div>
  );
}

/** Curved edge that eases the accent panel into the page below it. */
function CurvedEdge() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
      style={{ position: "absolute", bottom: -1, left: 0, width: "100%", height: 40, display: "block" }}
    >
      <path d="M0,40 C120,0 280,0 400,40 L400,40 L0,40 Z" fill="var(--bg)" />
    </svg>
  );
}

export function WaveHero({
  children,
  height = 300,
  style,
}: {
  children?: ReactNode;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        // Full-bleed regardless of the Screen's padding.
        margin: "calc(-1 * max(env(safe-area-inset-top), 24px)) -18px 0",
        minHeight: height,
        background: "var(--primary)",
        color: "var(--on-accent)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 34px) 22px 46px",
        overflow: "hidden",
        ...style,
      }}
    >
      <WaveLines />
      <div style={{ position: "relative", zIndex: 1, width: "100%", textAlign: "center" }}>
        {children}
      </div>
      <CurvedEdge />
    </div>
  );
}

export function WaveCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        position: "relative",
        background: "var(--primary)",
        color: "var(--on-accent)",
        borderRadius: "var(--r-hero)",
        overflow: "hidden",
        padding: 22,
        ...style,
      }}
    >
      <WaveLines opacity={0.35} />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </section>
  );
}
