"use client";

/**
 * Client-side session state for the PWA (see ADR note in lib/supabase/client.ts:
 * auth lives in the browser; RLS is the security boundary).
 *
 * Three modes:
 *  - "supabase": signed in; the real repo.
 *  - "demo":     "Skip — explore the demo household" (sessionStorage flag).
 *  - "signedout": neither → screens redirect to /welcome.
 */

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase/client";

const DEMO_KEY = "settleup:demo";

export function enterDemoMode(): void {
  sessionStorage.setItem(DEMO_KEY, "1");
}

export function exitDemoMode(): void {
  sessionStorage.removeItem(DEMO_KEY);
}

export function isDemoMode(): boolean {
  return typeof window !== "undefined" && sessionStorage.getItem(DEMO_KEY) === "1";
}

export type SessionState =
  | { status: "loading" }
  | { status: "signedout" }
  | { status: "demo" }
  | { status: "supabase"; session: Session };

export function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    if (isDemoMode()) {
      setState({ status: "demo" });
      return;
    }
    if (!isSupabaseConfigured()) {
      setState({ status: "signedout" });
      return;
    }
    const sb = getSupabase();
    let cancelled = false;

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState(data.session ? { status: "supabase", session: data.session } : { status: "signedout" });
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (isDemoMode()) return;
      setState(session ? { status: "supabase", session } : { status: "signedout" });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut(): Promise<void> {
  exitDemoMode();
  if (isSupabaseConfigured()) {
    await getSupabase().auth.signOut();
  }
}
