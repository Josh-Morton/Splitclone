/**
 * BUG-020 guard.
 *
 * This project's JSX compiler drops the leading space of a text run that
 * contains an HTML entity when the run starts right after a closing tag or a
 * {expression} on the same line. So
 *
 *     {who} clears this — it&apos;ll record…
 *
 * rendered as "Each personclears this…" in production. The fix is to write a
 * real character (’) instead of the entity, or put the space in `{" "}`.
 * This test fails if the risky shape reappears anywhere in src/.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("JSX text runs with entities (BUG-020)", () => {
  it("never start with a space right after a tag or {expression}", () => {
    const risky = /(<\/[a-zA-Z][^>]*>|\/>|\})( [^<>{}\n]*&[a-z]+;[^<>{}]*)/;
    const offenders = tsxFiles(join(__dirname, "..", ".."))
      .filter((f) => !f.includes("__tests__"))
      .flatMap((f) => {
        const m = readFileSync(f, "utf8").match(risky);
        return m ? [`${f.split("/src/")[1]}: …${m[0].slice(0, 60)}`] : [];
      });
    expect(offenders).toEqual([]);
  });
});
