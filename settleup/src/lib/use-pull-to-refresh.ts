"use client";

/**
 * Pull-to-refresh for the main screen (animation backlog: "No pull-to-refresh").
 *
 * Realtime keeps most data fresh, but an installed PWA on iOS has no browser
 * pull-to-refresh at all, and after a dropped connection there was no gesture
 * for "check again" short of killing the app.
 *
 * Design notes:
 * - Only arms when the page is scrolled to the very top at touchstart, and only
 *   for a mostly-vertical downward drag — so it never fights normal scrolling
 *   or a horizontal swipe.
 * - Listens natively on the element (not via React props) because stopping the
 *   page's own overscroll needs a non-passive touchmove, which React's
 *   synthetic touch listeners can't provide.
 * - Sheets and overlays are unaffected: sheets portal to <body> and overlays
 *   are siblings of this element, so their touches never reach it.
 * - Resistance: the indicator moves at half the finger's speed and is capped,
 *   which is what makes it feel attached rather than dragged.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

export const PULL_THRESHOLD = 64;
const MAX_PULL = 96;

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled = true
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Kept in refs so the native listeners (bound once) see current values.
  const onRefreshRef = useRef(onRefresh);
  const refreshingRef = useRef(false);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let armed = false; // touch began at scrollTop 0
    let pulling = false; // confirmed a vertical downward pull
    let distance = 0;

    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      armed = atTop();
      pulling = false;
      distance = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        // Decide once, on the first real movement: vertical and downward.
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !atTop()) {
          armed = false;
          return;
        }
        pulling = true;
      }
      // Stop the page's own rubber-band so only our indicator moves.
      if (e.cancelable) e.preventDefault();
      distance = Math.min(MAX_PULL, Math.max(0, dy * 0.5));
      setPull(distance);
    };

    const finish = () => {
      if (!pulling) {
        armed = false;
        return;
      }
      const trigger = distance >= PULL_THRESHOLD;
      armed = pulling = false;
      if (!trigger) {
        setPull(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(PULL_THRESHOLD);
      Promise.resolve()
        .then(() => onRefreshRef.current())
        .catch(() => {})
        .finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
        });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", finish, { passive: true });
    el.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [ref, enabled]);

  return { pull, refreshing };
}
