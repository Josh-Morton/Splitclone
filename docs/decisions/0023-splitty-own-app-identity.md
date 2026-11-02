# ADR-0023: Splitty as its own installable app on Tally's domain

**Status:** Accepted (2026-11-02) · **Source:** Josh (follow-up to Phase 21) ·
**Extends** [ADR-0022](0022-splitty-without-an-account.md)

## Context

`/splitty` and the bill pages at `/split/<code>` served Tally's manifest, icons
and home-screen name. Saving either gave a "Tally" icon, and on Android it
opened Tally's home page rather than Splitty.

Josh wants Splitty to feel like its own small app, with its own icon and
home-screen name, without disturbing Tally's branding and while staying on
`www.tally-ho.co.za`.

## Decision

**Splitty gets a second web app manifest and its own icon set on the same
origin.**

- Files live in `public/icons/splitty/`, including `manifest.webmanifest`. The
  service worker's brand-asset rule already covers that folder, so `sw.js` is
  unchanged and there is no second service worker.
- `src/lib/splitty-metadata.ts` holds the identity. The `/splitty` and `/split`
  layouts both use it, because guests usually arrive on a bill link, not on
  `/splitty`. Every other route keeps the root layout's Tally metadata.
- The manifest's `id` is `/splitty`, so browsers treat it as a separate app.

**The scope is `/split`, not `/splitty`. This is deliberate.** Manifest scope
is a plain "starts with" check, so `/split` covers both `/splitty` and
`/split/<code>`. A scope of `/splitty` would drop every bill out of the app.
`splitty-identity.test.ts` guards this.

**Tally's `favicon.ico` moved from `src/app/` to `public/`.** Next.js adds an
`app/favicon.ico` to every route, and a nested layout can't remove it, so
Tally's icon would have stayed on Splitty's pages. The root layout now lists
the file itself, which keeps Tally's tags the same.

Rejected alternative:

- **A subdomain** (`splitty.tally-ho.co.za`). This is Google's recommended
  layout for multiple PWAs, but it needs extra domain setup and redirects for
  links already shared, and Josh asked to stay on the same domain.

## Consequences

- **Nested scopes are discouraged, and unavoidable here.** Tally's scope is
  `/`, so Splitty always sits inside it. On Android, someone who already has
  Tally may not be offered an install of Splitty, and which app opens a bill
  link when both are installed is undocumented. Guests without Tally aren't
  affected.
- **iPhone home-screen apps don't share storage with Safari.** Splitty's list
  of splits and its anonymous session are in browser storage, so a saved app
  starts empty, and bill links opened from WhatsApp land in Safari. Accepted
  for now; see the backlog.
- **Links out of Splitty** (Open Tally, Privacy) leave the app's scope and show
  browser controls.
- **Icons in browser tabs barely change**, because neither name can be read at
  16–32px. The difference shows on home screens and in link previews.
- **The theme colour now has three copies:** the root layout and both manifests.
