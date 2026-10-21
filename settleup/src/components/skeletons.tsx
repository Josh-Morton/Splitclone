"use client";

/**
 * Skeleton placeholders (animation backlog: "Loading is a bare spinner").
 *
 * A placeholder shaped like the content that's coming makes the wait feel
 * shorter and stops the layout jumping when data lands — a centred spinner
 * gives no sense of either. Each skeleton below mirrors the real screen's
 * geometry closely enough that the swap is a fill-in, not a re-layout.
 *
 * The shimmer is decoration, so the global prefers-reduced-motion guard is
 * allowed to stop it; the blocks still show as static shapes.
 */

import type { CSSProperties } from "react";

export function Bone({
  w = "100%",
  h = 12,
  r = 6,
  tint,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  /** Override the block colour, e.g. on the accent card. */
  tint?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="skeleton"
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: r,
        ...(tint ? { background: tint } : null),
        ...style,
      }}
    />
  );
}

/** Shared wrapper: announces "loading" once, hides the shapes from readers. */
function Busy({ label, children, style }: { label: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} style={style}>
      {children}
    </div>
  );
}

/** One list row: icon tile, two lines of text, amount on the right. */
function RowBone({ first }: { first?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: first ? "none" : "1px solid var(--line)",
      }}
    >
      <Bone w={36} h={36} r={11} />
      <div style={{ flex: 1, display: "grid", gap: 7 }}>
        <Bone w="62%" h={12} />
        <Bone w="38%" h={10} />
      </div>
      <Bone w={64} h={13} />
    </div>
  );
}

/** The rows card alone — for nesting inside another skeleton's live region. */
function RowsCard({ rows }: { rows: number }) {
  return (
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--line)",
          padding: "2px 14px",
        }}
      >
        {Array.from({ length: rows }, (_, i) => (
          <RowBone key={i} first={i === 0} />
        ))}
      </div>
  );
}

export function RowsSkeleton({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <Busy label={label}>
      <RowsCard rows={rows} />
    </Busy>
  );
}

/** Splitty's bill cards: merchant + status, then the claimed line. */
export function CardsSkeleton({ cards = 3, label = "Loading" }: { cards?: number; label?: string }) {
  return (
    <Busy label={label}>
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          style={{
            background: "var(--surface)",
            borderRadius: "var(--r-card)",
            border: "1px solid var(--line)",
            padding: 16,
            marginBottom: 10,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <Bone w="48%" h={14} />
            <Bone w={46} h={11} />
          </div>
          <Bone w="58%" h={11} />
        </div>
      ))}
    </Busy>
  );
}

/**
 * Home, as it will look: header (Tally name + member count, bell + Settings),
 * the wave balance card, then Recent activity. Shown on every app open, which
 * is the single most-seen loading state in the app.
 */
export function HomeSkeleton() {
  return (
    <Busy label="Loading your Tally" style={{ paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ display: "grid", gap: 8, flex: 1 }}>
          <Bone w="52%" h={26} r={8} />
          <Bone w="34%" h={11} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Bone w={42} h={34} r="var(--r-pill)" />
          <Bone w={76} h={34} r="var(--r-pill)" />
        </div>
      </div>
      <div
        style={{
          borderRadius: "var(--r-card)",
          background: "var(--accentbg)",
          padding: "26px 22px",
          display: "grid",
          justifyItems: "center",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Bone w={96} h={11} tint="var(--accentbg)" />
        <Bone w="58%" h={40} r={10} tint="var(--accentbg)" />
        <Bone w="80%" h={11} tint="var(--accentbg)" />
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 6 }}>
          <Bone h={46} r="var(--r-pill)" tint="var(--accentbg)" style={{ flex: 1 }} />
          <Bone h={46} r="var(--r-pill)" tint="var(--accentbg)" style={{ flex: 1 }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <Bone w={118} h={14} />
        <Bone w={48} h={12} />
      </div>
      {/* Not RowsSkeleton: that has its own live region, and nesting two
          would make a screen reader announce "loading" twice. */}
      <RowsCard rows={4} />
    </Busy>
  );
}
