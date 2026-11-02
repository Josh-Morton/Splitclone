/**
 * ADR-0023 guard: Splitty is its own installable app on Tally's domain.
 *
 * The scope looks like a typo but isn't. Manifest scope is a plain "starts
 * with" check, so "/split" covers both /splitty and /split/<code>, while
 * "/splitty" would drop every bill out of the app.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splittyMetadata } from "../splitty-metadata";

const publicDir = join(process.cwd(), "public");
const manifestUrl = splittyMetadata.manifest as string;
const manifest = JSON.parse(readFileSync(join(publicDir, manifestUrl), "utf8"));
const tally = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));

const inScope = (path: string) => path.startsWith(manifest.scope);

describe("Splitty app identity", () => {
  it("keeps the start page and bill pages inside the app", () => {
    expect(inScope(manifest.start_url)).toBe(true);
    expect(inScope("/split/ABC123")).toBe(true);
  });

  it("leaves Tally's pages outside the app", () => {
    expect(inScope("/")).toBe(false);
    expect(inScope("/privacy")).toBe(false);
  });

  it("is a separate app from Tally", () => {
    expect(manifest.id).toBe("/splitty");
    expect(tally.start_url).toBe("/");
    expect(tally.name).toBe("Tally");
  });

  it("points only at Splitty's own icon files, and they all exist", () => {
    const icons = splittyMetadata.icons as {
      icon: { url: string }[];
      shortcut: string;
      apple: string;
    };
    const paths = [
      ...manifest.icons.map((i: { src: string }) => i.src),
      ...icons.icon.map((i) => i.url),
      icons.shortcut,
      icons.apple,
    ];
    for (const p of paths) {
      expect(p).toMatch(/^\/icons\/splitty\//);
      expect(existsSync(join(publicDir, p))).toBe(true);
    }
  });

  it("keeps Tally's favicon out of src/app, where Next.js adds it to every route", () => {
    expect(existsSync(join(process.cwd(), "src/app/favicon.ico"))).toBe(false);
    expect(existsSync(join(publicDir, "favicon.ico"))).toBe(true);
  });
});
