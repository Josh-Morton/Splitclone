"use client";

/**
 * Bottom sheet: scrim + slide-up panel, now draggable (Phase 11, ADR-0016).
 *
 * Drag-to-dismiss is deliberately ADDITIVE — the Cancel button and the
 * backdrop tap behave exactly as they did before, and `open`/`onClose` keep
 * the same contract. Sheets are the most fragile thing in this app (see
 * BUG-003), so the mount/unmount semantics below are unchanged: closed means
 * `null`, nothing lingers.
 *
 * Gesture rules:
 *   • Drag starts on the handle/header, or on the body only when it's
 *     scrolled to the top — otherwise scrolling a tall sheet would fight the
 *     dismiss gesture.
 *   • Past 25% of sheet height, or a flick faster than 0.5px/ms, dismisses.
 *     Anything less springs back.
 *   • Only `transform` moves, so the compositor handles it with no layout.
 *   • The scrim fades with the drag, so the sheet feels attached to it.
 */

import { useRef, useState, type ReactNode } from "react";

const DISMISS_FRACTION = 0.25;
const FLICK_VELOCITY = 0.5; // px per ms

export function Sheet({
  open,
  onClose,
  title,
  children,
  headerRight,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Height is captured once per gesture rather than read during render —
  // reading a ref while rendering isn't allowed, and the sheet can't resize
  // mid-drag anyway.
  const start = useRef<{ y: number; t: number; h: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  if (!open) return null;

  function begin(y: number, fromBody: boolean) {
    // A tall sheet scrolls; only take over the gesture at the very top.
    if (fromBody && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    start.current = { y, t: Date.now(), h: panelRef.current?.offsetHeight ?? 1 };
    setDragging(true);
  }

  function move(y: number) {
    if (!start.current) return;
    // Downward only — dragging up shouldn't lift the sheet off its anchor.
    setDragY(Math.max(0, y - start.current.y));
  }

  function end() {
    const s = start.current;
    if (!s) return;
    const dt = Math.max(1, Date.now() - s.t);
    const dismiss = dragY > s.h * DISMISS_FRACTION || dragY / dt > FLICK_VELOCITY;
    start.current = null;
    setDragging(false);
    setDragY(0); // springs back via the transition below when not dismissing
    if (dismiss) onClose();
  }

  // Derived from state only, so render never touches a ref.
  const progress = dragging && dragY > 0 ? Math.min(1, dragY / 420) : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--scrim)",
        // Scrim tracks the drag so the two feel connected.
        opacity: 1 - progress * 0.7,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: dragging ? "none" : "opacity var(--d-fast)",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => begin(e.touches[0].clientY, false)}
        onTouchMove={(e) => move(e.touches[0].clientY)}
        onTouchEnd={end}
        style={{
          width: "100%",
          maxWidth: 430,
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--sheet)",
          borderRadius: "var(--r-sheet) var(--r-sheet) 0 0",
          border: "1px solid var(--line)",
          borderBottom: "none",
          padding: "10px 18px calc(env(safe-area-inset-bottom) + 22px)",
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : "transform var(--d-med) var(--ease-sheet)",
          animation: dragY === 0 && !dragging ? "sheetUp var(--d-med) var(--ease-sheet)" : undefined,
          touchAction: "none",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: "var(--r-pill)",
            background: "var(--line2)",
            margin: "4px auto 12px",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: "var(--t-body)",
              fontWeight: "var(--w-medium)" as unknown as number,
              cursor: "pointer",
              padding: 4,
            }}
          >
            Cancel
          </button>
          <p style={{ fontSize: 15, fontWeight: "var(--w-heavy)" as unknown as number }}>{title}</p>
          <div style={{ minWidth: 48, textAlign: "right" }}>{headerRight}</div>
        </div>
        {/* Body scrolls; the drag handler above defers to it unless it's at
            the top, so the two gestures never fight. */}
        <div
          ref={bodyRef}
          onTouchStart={(e) => begin(e.touches[0].clientY, true)}
          style={{ overflowY: "auto", flex: 1, minHeight: 0, touchAction: "pan-y" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: "var(--r-pill)",
        fontSize: "var(--t-body-sm)",
        fontWeight: "var(--w-bold)" as unknown as number,
        cursor: "pointer",
        background: active ? "var(--accentbg)" : "var(--s2)",
        color: active ? "var(--primary)" : "var(--muted)",
        border: `2px solid ${active ? "var(--primary)" : "transparent"}`,
        transition: "background var(--d-fast), color var(--d-fast)",
      }}
    >
      {children}
    </button>
  );
}
