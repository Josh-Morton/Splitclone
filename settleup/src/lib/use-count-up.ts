"use client";

/**
 * Animate a money figure from its previous value to its new one (animation
 * backlog: "Balance figure snaps between values").
 *
 * - Integer cents throughout: every intermediate frame is rounded to a whole
 *   cent, so the figure never shows a value the ledger couldn't hold.
 * - Only animates on CHANGE. The first value renders immediately — counting up
 *   from zero on every app open would delay reading the most important number
 *   on screen.
 * - Honours prefers-reduced-motion by jumping straight to the new value.
 * - Never stalls: if frames stop (backgrounded tab), the hook still lands on the
 *   target when the next frame runs, and a new target restarts from wherever
 *   the figure currently is rather than snapping back.
 */

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 520;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const commit = (v: number) => {
      shownRef.current = v;
      setShown(v);
    };

    if (reduce) {
      frame = requestAnimationFrame(() => commit(target));
      return () => cancelAnimationFrame(frame);
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      commit(t === 1 ? target : Math.round(from + (target - from) * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
