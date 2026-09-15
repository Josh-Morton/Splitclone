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
const INVITE_KEY = "settleup:invite";

/** Invite code captured before sign-in; redeemed right after auth. */
export function setPendingInviteCode(code: string): void {
  sessionStorage.setItem(INVITE_KEY, code);
}

export function getPendingInviteCode(): string | null {
  return typeof window !== "undefined" ? sessionStorage.getItem(INVITE_KEY) : null;
}

export function clearPendingInviteCode(): void {
  sessionStorage.removeItem(INVITE_KEY);
}

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
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      // Yield a tick so no state is set synchronously inside the effect.
      await Promise.resolve();
      if (cancelled) return;

      if (isDemoMode()) {
        setState({ status: "demo" });
        return;
      }
      if (!isSupabaseConfigured()) {
        setState({ status: "signedout" });
        return;
      }

      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setState(data.session ? { status: "supabase", session: data.session } : { status: "signedout" });

      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        if (cancelled || isDemoMode()) return;
        setState(session ? { status: "supabase", session } : { status: "signedout" });
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return state;
}

/**
 * Make sure the access token is usable before we fire requests with it
 * (BUG-005).
 *
 * supabase-js auto-refreshes on a timer, which is fine while a tab is awake —
 * but this is an installed PWA. Browsers throttle background timers hard, so
 * after the phone has been locked for a while the refresh never fires, the
 * token expires, and the FIRST requests on resume go out already dead. That
 * surfaced two ways: a raw "JWT expired" error card on the home screen, and
 * receipt scanning failing with "Not signed in" (the Edge Function validates
 * the caller's token with auth.getUser()).
 *
 * Returns false when the session is genuinely gone and the caller should send
 * the user to sign in again.
 */
export async function ensureFreshSession(): Promise<boolean> {
  if (!isSupabaseConfigured() || isDemoMode()) return true;
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) return false;

  // Refresh a minute early rather than waiting for expiry — a request that
  // leaves now might still arrive after the token dies.
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt - Date.now() > 60_000) return true;

  const { data: refreshed, error } = await sb.auth.refreshSession();
  return !error && Boolean(refreshed.session);
}

/** True when an error from PostgREST / an Edge Function is an auth failure. */
export function isAuthError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return (
    msg.includes("jwt") ||
    msg.includes("token") ||
    msg.includes("not signed in") ||
    msg.includes("unauthorized") ||
    msg.includes("401")
  );
}

export async function signOut(): Promise<void> {
  exitDemoMode();
  if (isSupabaseConfigured()) {
    await getSupabase().auth.signOut();
  }
}
