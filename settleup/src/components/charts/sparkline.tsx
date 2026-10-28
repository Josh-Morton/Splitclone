"use client";

/**
 * A category's own six-month trend — the "small multiples" of ADR-0021 §3.
 *
 * One hue, titled by the row it sits in, so it needs no legend and passes the
 * palette checks by construction (a stacked category chart didn't). The focus
 * month is the accent; earlier months are context grey. Decorative to a
 * screen reader: the row's own text and the drill-down carry the numbers.
 */

import { columnPath } from "./scale";

export function Sparkline({
  values,
  focusIndex,
  width = 58,
  height = 22,
}: {
  values: number[];
  focusIndex: number;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const gap = 2;
  const barW = (width - gap * (values.length - 1)) / values.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--chart-grid)" strokeWidth={1} />
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (height - 1)) : 0;
        return (
          <path
            key={i}
            d={columnPath(i * (barW + gap), height - 1 - h, barW, h, 2)}
            fill={i === focusIndex ? "var(--chart-accent)" : "var(--chart-context)"}
          />
        );
      })}
    </svg>
  );
}
