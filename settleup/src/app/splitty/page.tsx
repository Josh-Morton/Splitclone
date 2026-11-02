"use client";

/**
 * Splitty on its own (Phase 21, ADR-0022) — the page the "Loving Splitty?
 * Save this link and you can use it too!" line in every share message opens.
 * Everything Splitty does, in one place, with or without a Tally account:
 * start a split, see the ones you started and the ones you joined.
 *
 * Usage is recorded first-party (`splitty_opened`, with `?ref=` = the bill the
 * link came from). Nothing about the visitor is stored beyond a random
 * per-browser id.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Repo } from "@/lib/data";
import { getDemoRepo, getSupabaseRepo, isSupabaseConfigured } from "@/lib/data";
import { isDemoMode, useSessionState } from "@/lib/session";
import { rememberSplittyRef, splittyDeviceId } from "@/lib/splitty";
import { SplittyHome } from "@/components/splitty-home";
import { Logo, Screen, Spinner } from "@/components/ui";

function SplittyPage() {
  const params = useSearchParams();
  const ref = params.get("ref");
  const session = useSessionState();
  const [repo, setRepo] = useState<Repo | null>(null);
  const tracked = useRef(false);

  // Same repo choice as /split/<code>: the demo keeps its in-memory repo;
  // everyone else talks to the real service (anon key until they start a split).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const useDemo = isDemoMode() || !isSupabaseConfigured();
      const r = useDemo ? (await getDemoRepo()).repo : getSupabaseRepo();
      if (!cancelled) setRepo(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repo || tracked.current) return;
    tracked.current = true;
    rememberSplittyRef(ref);
    void repo.trackSplittyEvent({ event: "splitty_opened", ref, deviceId: splittyDeviceId() });
  }, [repo, ref]);

  if (!repo || session.status === "loading") {
    return (
      <Screen center>
        <Spinner />
      </Screen>
    );
  }

  const hasTallyAccount = session.status === "supabase" || session.status === "demo";

  return (
    <Screen>
      {hasTallyAccount && (
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            marginBottom: 12,
            background: "var(--s2)",
            border: "1px solid var(--line2)",
            borderRadius: 999,
            color: "var(--ink)",
            fontSize: 13,
            fontWeight: 700,
            padding: "7px 14px",
            textDecoration: "none",
          }}
        >
          ‹ Back to Tally
        </Link>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <Logo size={40} />
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.8px" }}>Splitty</h1>
      </div>
      <SplittyHome repo={repo} mode="standalone" demo={session.status === "demo"} hasTallyAccount={hasTallyAccount} />
      <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)", marginTop: 28, lineHeight: 1.6 }}>
        Splitty is part of Tally: shared expenses for your home.
        <br />
        <Link href={hasTallyAccount ? "/" : "/welcome"} className="hit" style={{ color: "var(--primary)", fontWeight: 700 }}>
          {hasTallyAccount ? "Open Tally" : "Get Tally"}
        </Link>
        {" · "}
        <Link href="/privacy" className="hit" style={{ color: "var(--muted)", fontWeight: 600 }}>
          Privacy
        </Link>
      </p>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SplittyPage />
    </Suspense>
  );
}
