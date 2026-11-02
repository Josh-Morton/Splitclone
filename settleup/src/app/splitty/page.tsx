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
import { WaveHero } from "@/components/wave";

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
      <WaveHero height={280}>
        {hasTallyAccount && (
          <div style={{ textAlign: "left", marginBottom: 14 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
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
          </div>
        )}
        {/* The logo is the page's heading, as on /welcome: its alt text gives the h1 its name. */}
        <h1 className="rise-in" style={{ display: "flex", justifyContent: "center", animationDelay: "60ms" }}>
          <Logo size={120} app="splitty" />
        </h1>
      </WaveHero>
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
