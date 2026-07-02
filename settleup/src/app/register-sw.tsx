"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) so the PWA is installable and
 * the app shell opens offline. Phase 2 extends sw.js with background sync.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);
  return null;
}
