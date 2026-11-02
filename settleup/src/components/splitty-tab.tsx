"use client";

/**
 * Splitty tab (Phase 8): Splitty inside Tally. Everything below the header is
 * the shared SplittyHome (Phase 21), the same component the public /splitty
 * page renders, so the two can't drift. Standalone from the expense ledger
 * (ADR-0013).
 */

import type { Repo } from "@/lib/data";
import { CollapsingHeader } from "./collapsing-header";
import { SplittyHome } from "./splitty-home";

export function SplittyTab({ repo, demo }: { repo: Repo; demo: boolean }) {
  return (
    <div style={{ marginBottom: 90 }}>
      {/* Splitty was the last tab still rendering its own <h1> — 22px/800 and
          non-sticky, against 26px/900 sticky everywhere else (BUG-017). */}
      <CollapsingHeader title="Splitty" />
      <SplittyHome repo={repo} mode="tab" demo={demo} hasTallyAccount />
    </div>
  );
}
