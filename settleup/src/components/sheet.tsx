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
/** A flick must actually travel — otherwise a quick tap reads as one. */
const MIN_FLICK_TRAVEL = 40;

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
  // `end()` must not read dragY from its render closure — React may not have
  // flushed the last touchmove yet, so the distance reads short and
  // drag-to-dismiss misfires. The ref always holds the live value.
  const dragYRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  if (!open) return null;

  function begin(y: number, fromBody: boolean, target: EventTarget | null) {
    // A tall sheet scrolls; only take over the gesture at the very top.
    if (fromBody && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    // Never hijack a touch that landed on a control. A tap on a button must
    // stay a tap — the gesture machinery re-rendering mid-press is what let
    // the click slip off its target (BUG-012).
    if (
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, label, [role="button"]')
    ) {
      return;
    }
    start.current = { y, t: Date.now(), h: panelRef.current?.offsetHeight ?? 1 };
    // Deliberately NOT setting `dragging` here: a plain tap must cause no
    // state change at all. It flips on the first actual movement instead.
  }

  function move(y: number) {
    if (!start.current) return;
    // Downward only — dragging up shouldn't lift the sheet off its anchor.
    const d = Math.max(0, y - start.current.y);
    if (d > 0 && !draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
    }
    dragYRef.current = d;
    setDragY(d);
  }

  function end() {
    const s = start.current;
    if (!s) return;
    const travelled = dragYRef.current;
    const dt = Math.max(1, Date.now() - s.t);
    // A flick needs real distance as well as speed, so a brisk tap (a few px
    // of finger drift in a few ms) can never be mistaken for one.
    const dismiss =
      travelled > s.h * DISMISS_FRACTION ||
      (travelled > MIN_FLICK_TRAVEL && travelled / dt > FLICK_VELOCITY);
    start.current = null;
    dragYRef.current = 0;
    draggingRef.current = false;
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
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => begin(e.touches[0].clientY, false, e.target)}
        onTouchMove={(e) => move(e.touches[0].clientY)}
        onTouchEnd={end}
        onTouchCancel={end}
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
          // No `animation` here — it lives in .sheet-panel so that re-renders
          // can't restart it (BUG-012). No `touchAction: none` either: as an
          // ancestor it overrode the body's `pan-y`, which left tall sheets
          // unscrollable on touch and put their lower controls out of reach.
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
          onTouchStart={(e) => begin(e.touches[0].clientY, true, e.target)}
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
      className="press"
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
