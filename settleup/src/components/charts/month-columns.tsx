"use client";

/**
 * Monthly spend columns (Phase 20 §4.3, ADR-0021).
 *
 * One series, so one hue: months inside the focus use the accent, the rest
 * are context grey (emphasis). Columns are ≤ 24px with a rounded data-end,
 * gridlines are solid hairlines, and only the highest and the selected month
 * carry a value label — the readout (rendered by the parent) and the "Show
 * numbers" table carry the rest.
 *
 * Interaction is built for a phone: tap or drag across the plot to move the
 * selection (the whole month band is the hit target, not the painted bar),
 * hover does the same with a mouse, and ← / → / Enter work from the keyboard.
 * Nothing is hover-gated.
 *
 * Fixed viewBox, scaled to the container: Tally's content column is 340–430px
 * wide, so text stays within a few percent of its design size.
 */

import { useRef } from "react";
import { fmtR } from "@/lib/domain";
import type { MonthPoint } from "@/lib/reports";
import { columnPath, compactRand, niceMax } from "./scale";

const W = 360;
const H = 172;
const PAD_L = 40;
const PAD_R = 10;
const PAD_T = 22;
const PAD_B = 24;

export function MonthColumns({
  points,
  isFocus,
  selected,
  onSelect,
  onActivate,
  average,
  label,
}: {
  points: MonthPoint[];
  isFocus: (key: string) => boolean;
  selected: string | null;
  onSelect: (key: string) => void;
  /** Enter / the readout's action: drill into the selected month. */
  onActivate?: (key: string) => void;
  /** Hairline reference at the average of months with spending. */
  average?: number;
  /** Accessible name for the chart. */
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pressed = useRef(false);
  if (points.length === 0) return null;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const max = niceMax(Math.max(...points.map((p) => p.total), average ?? 0));
  const band = plotW / points.length;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const peak = points.reduce((a, p) => (p.total > a.total ? p : a), points[0]);
  const selIndex = Math.max(0, points.findIndex((p) => p.key === selected));

  const indexAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(points.length - 1, Math.floor((x - PAD_L) / band)));
  };
  const pick = (clientX: number) => {
    const p = points[indexAt(clientX)];
    if (p && p.key !== selected) onSelect(p.key);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-roledescription="chart"
      aria-label={`${label}. Use the left and right arrow keys to choose a month${onActivate ? ", Enter to see its expenses" : ""}.`}
      tabIndex={0}
      style={{ display: "block", touchAction: "pan-y", outlineOffset: 4 }}
      onPointerDown={(e) => {
        pressed.current = true;
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        // A finger must be down (drag-to-scrub); a mouse just hovers.
        if (pressed.current || e.pointerType === "mouse") pick(e.clientX);
      }}
      onPointerUp={() => (pressed.current = false)}
      onPointerCancel={() => (pressed.current = false)}
      onPointerLeave={() => (pressed.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const i = Math.max(0, Math.min(points.length - 1, selIndex + (e.key === "ArrowLeft" ? -1 : 1)));
          onSelect(points[i].key);
        } else if ((e.key === "Enter" || e.key === " ") && onActivate && selected) {
          e.preventDefault();
          onActivate(selected);
        }
      }}
    >
      {/* Gridlines + y ticks: 0, half, max. Solid hairlines, never dashed. */}
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text
            x={PAD_L - 6}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize={9.5}
            fill="var(--muted)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {compactRand(t)}
          </text>
        </g>
      ))}

      {points.map((p, i) => {
        const cx = PAD_L + i * band + band / 2;
        const h = p.total > 0 ? Math.max(2, (p.total / max) * plotH) : 0;
        const isSel = i === selIndex;
        const showValue = p.total > 0 && (isSel || p.key === peak.key);
        return (
          <g key={p.key}>
            <path
              d={columnPath(cx - barW / 2, PAD_T + plotH - h, barW, h)}
              fill={isFocus(p.key) ? "var(--chart-accent)" : "var(--chart-context)"}
            />
            {showValue && (
              <text
                x={cx}
                y={PAD_T + plotH - h - 6}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={isSel ? 800 : 600}
                fill={isSel ? "var(--ink)" : "var(--muted)"}
              >
                {fmtR(p.total)}
              </text>
            )}
            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={isSel ? 800 : 600}
              fill={isSel ? "var(--ink)" : "var(--muted)"}
            >
              {p.label}
            </text>
            {/* The selected month gets a small marker under its label. */}
            {isSel && <rect x={cx - 7} y={H - 3} width={14} height={2} rx={1} fill="var(--ink)" />}
          </g>
        );
      })}

      {/* Average of months with spending: a labelled solid hairline. */}
      {average !== undefined && average > 0 && (
        <g>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(average)}
            y2={y(average)}
            stroke="var(--muted)"
            strokeWidth={1}
            opacity={0.55}
          />
          <text x={W - PAD_R} y={y(average) - 4} textAnchor="end" fontSize={9} fill="var(--muted)">
            avg {compactRand(average)}
          </text>
        </g>
      )}
    </svg>
  );
}
