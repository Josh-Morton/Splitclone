"use client";

/**
 * Spending pace (Phase 20 §4.4, ADR-0021): cumulative spend by day of month,
 * this month against last month.
 *
 * Emphasis, not categorical: this month is the accent (2px line, a soft wash
 * beneath, an end-dot), last month is context grey. A legend is always shown
 * (two series) and the line ends are direct-labelled unless they'd collide.
 *
 * The readout above the plot follows a crosshair that snaps to the nearest
 * day — drag or tap on a phone, hover with a mouse, ← / → from the keyboard —
 * so a value is never hover-gated. This month's line stops at today.
 */

import { useRef, useState } from "react";
import { fmtR } from "@/lib/domain";
import { compactRand, niceMax } from "./scale";

const W = 360;
const H = 170;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 22;

export function PaceLines({
  current,
  previous,
  days,
  currentLabel,
  previousLabel,
}: {
  /** Cumulative cents, index 0 = end of day 1. Shorter than `days` mid-month. */
  current: number[];
  /** The comparison month, or null when it had no spending at all. */
  previous: number[] | null;
  /** Days on the x-axis (the focus month's length). */
  days: number;
  currentLabel: string;
  previousLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pressed = useRef(false);
  const lastCur = Math.max(0, current.length - 1);
  const [day, setDay] = useState(lastCur);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const span = Math.max(days, previous?.length ?? 0);
  const max = niceMax(Math.max(current.at(-1) ?? 0, previous?.at(-1) ?? 0));
  const x = (i: number) => PAD_L + (span <= 1 ? 0 : (i / (span - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const d = Math.max(0, Math.min(span - 1, day));
  const curAt = d < current.length ? current[d] : null;
  const prevAt = previous ? previous[Math.min(d, previous.length - 1)] : null;

  const dayAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(span - 1, Math.round(((px - PAD_L) / plotW) * (span - 1))));
  };

  // Direct end labels, dropped if they'd sit on top of each other (the legend
  // still identifies both lines).
  const curEnd = current.length ? { x: x(lastCur), y: y(current[lastCur]) } : null;
  const prevEnd = previous?.length ? { x: x(previous.length - 1), y: y(previous[previous.length - 1]) } : null;
  const collide = curEnd && prevEnd && Math.abs(curEnd.y - prevEnd.y) < 13 && Math.abs(curEnd.x - prevEnd.x) < 46;

  const xTicks = [1, 8, 15, 22, span].filter((t, i, a) => t <= span && a.indexOf(t) === i);

  return (
    <div>
      {/* Readout — values lead, labels follow. */}
      <p aria-live="polite" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6, minHeight: 18 }}>
        <span style={{ color: "var(--ink)", fontWeight: 800 }}>Day {d + 1}</span>
        {curAt !== null && (
          <>
            {" · "}
            {currentLabel} <span style={{ color: "var(--ink)", fontWeight: 800 }}>{fmtR(curAt)}</span>
          </>
        )}
        {prevAt !== null && (
          <>
            {" · "}
            {previousLabel} <span style={{ color: "var(--ink)", fontWeight: 700 }}>{fmtR(prevAt)}</span>
          </>
        )}
      </p>

      {/* Legend: always present for two series. Line keys, not boxes. */}
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
        <LegendKey colour="var(--chart-accent)" text={currentLabel} />
        {previous ? (
          <LegendKey colour="var(--chart-line-muted)" text={previousLabel} />
        ) : (
          <span>No spending in {previousLabel}</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="group"
        aria-roledescription="chart"
        aria-label={`Spending pace: ${currentLabel} against ${previousLabel}, cumulative by day. Use the left and right arrow keys to move along the month.`}
        tabIndex={0}
        style={{ display: "block", touchAction: "pan-y", outlineOffset: 4 }}
        onPointerDown={(e) => {
          pressed.current = true;
          setDay(dayAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (pressed.current || e.pointerType === "mouse") setDay(dayAt(e.clientX));
        }}
        onPointerUp={() => (pressed.current = false)}
        onPointerCancel={() => (pressed.current = false)}
        onPointerLeave={() => (pressed.current = false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setDay(Math.max(0, Math.min(span - 1, d + (e.key === "ArrowLeft" ? -1 : 1))));
          }
        }}
      >
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
        {xTicks.map((t) => (
          <text key={t} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--muted)">
            {t}
          </text>
        ))}

        {/* Last month first, so this month draws on top. */}
        {previous && previous.length > 0 && (
          <path d={line(previous)} fill="none" stroke="var(--chart-line-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {current.length > 0 && (
          <>
            <path
              d={`${line(current)}L${x(lastCur).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`}
              fill="var(--chart-wash)"
            />
            <path d={line(current)} fill="none" stroke="var(--chart-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {/* Crosshair snapped to the selected day, with a dot on each line. */}
        <line x1={x(d)} x2={x(d)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
        {prevAt !== null && <circle cx={x(d)} cy={y(prevAt)} r={4} fill="var(--chart-line-muted)" stroke="var(--surface)" strokeWidth={2} />}
        {curAt !== null && <circle cx={x(d)} cy={y(curAt)} r={4} fill="var(--chart-accent)" stroke="var(--surface)" strokeWidth={2} />}

        {/* End-dot + direct labels. */}
        {curEnd && d !== lastCur && (
          <circle cx={curEnd.x} cy={curEnd.y} r={4} fill="var(--chart-accent)" stroke="var(--surface)" strokeWidth={2} />
        )}
        {curEnd && !collide && (
          <text x={Math.min(curEnd.x, W - PAD_R - 18)} y={curEnd.y - 9} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="var(--ink)">
            {currentLabel}
          </text>
        )}
        {prevEnd && (
          <text x={W - PAD_R} y={prevEnd.y - 7} textAnchor="end" fontSize={9.5} fontWeight={600} fill="var(--muted)">
            {previousLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

function LegendKey({ colour, text }: { colour: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden style={{ width: 14, height: 2, borderRadius: 1, background: colour }} />
      {text}
    </span>
  );
}
