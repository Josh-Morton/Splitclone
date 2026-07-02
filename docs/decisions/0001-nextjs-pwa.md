# ADR-0001: Next.js PWA, not native mobile

**Status:** Accepted (2026-07-02) · **Source:** Scope doc §2, Phase 1 plan §2

## Context
The app must run on Android for two users, work offline, and sync via a cloud
backend — built solo, part-time, at ~R0/month infrastructure cost.

## Decision
A Progressive Web App built with **Next.js (App Router) + TypeScript**,
installable to the Android home screen, hosted on **Vercel** (Hobby, free).
No Play Store / App Store distribution in v1.

## Consequences
- One codebase serves Android, iOS (with PWA limits), and desktop.
- Offline requires a service worker + IndexedDB (Phase 2) rather than native storage.
- Weaker OS integration (background processing, notifications) — acceptable for
  an expense tracker; recurring-bill generation runs server-side instead.
- Vercel Hobby is personal-use-only: fine for a household tool; if it ever
  became commercial, move to Vercel Pro or Cloudflare Pages.
