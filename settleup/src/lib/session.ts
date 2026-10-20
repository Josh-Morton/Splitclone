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
import { isSessionReallyOver } from "./auth-errors";
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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    /**
     * Recover a stored-but-unrefreshable session, rather than treating it as
     * a sign-out (BUG-014). Retries with backoff, and immediately when the
     * device comes back online.
     *
     * If it never succeeds we do fall through to the signed-in-again screen
     * — an indefinite spinner would be its own bug — but crucially we never
     * call signOut() along the way, so the stored refresh token survives and
     * the next launch with a working connection picks it straight back up.
     */
    const retry = () => {
      if (cancelled) return;
      void getSupabase()
        .auth.refreshSession()
        .then(({ data: r, error }) => {
          if (cancelled) return;
          if (r.session) {
            setState({ status: "supabase", session: r.session });
            return;
          }
          if (isSessionReallyOver(error) || ++attempts >= 4) {
            setState({ status: "signedout" });
            return;
          }
          retryTimer = setTimeout(retry, attempts * 2000);
        })
        .catch(() => {
          if (!cancelled) setState({ status: "signedout" });
        });
    };
    const onOnline = () => {
      attempts = 0;
      retry();
    };
    window.addEventListener("online", onOnline);

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
      if (data.session) {
        setState({ status: "supabase", session: data.session });
      } else if (hasStoredSession()) {
        // getSession() tried to refresh an expired token and the request
        // failed — on a cold PWA open that usually just means the radio
        // wasn't up yet. The session is still on the device, so retry
        // instead of bouncing to /welcome (BUG-014).
        retry();
      } else {
        setState({ status: "signedout" });
      }

      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        if (cancelled || isDemoMode()) return;
        setState(session ? { status: "supabase", session } : { status: "signedout" });
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      window.removeEventListener("online", onOnline);
      if (retryTimer) clearTimeout(retryTimer);
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
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Is a session still physically stored in this browser? (BUG-014)
 *
 * `getSession()` returns `{session: null}` for two very different situations:
 * nobody is signed in, and "the stored token had expired, I tried to refresh
 * it, and the refresh request failed". Only the first means the user is
 * signed out. supabase-js deliberately LEAVES the session in storage when a
 * refresh fails, precisely so the next attempt can recover it — so the
 * storage entry is the honest answer to "is there an account on this device".
 *
 * Reaching for the storage key is reaching into supabase-js's private shape,
 * so this is written to fail safe: if anything about it is unrecognisable we
 * return false and fall back to the old behaviour.
 */
function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // `sb-${hostname.split(".")[0]}-auth-token`, optionally chunked across
      // `.0`/`.1` when the session is large. Deliberately excludes the
      // `-code-verifier` companion key, which is not a session.
      if (!key || !/^sb-.+-auth-token(\.\d+)?$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      // A chunk on its own isn't valid JSON, but its presence is still proof
      // that a session is stored here — which is all this asks.
      try {
        const parsed = JSON.parse(raw) as { refresh_token?: unknown };
        if (typeof parsed?.refresh_token === "string" && parsed.refresh_token) return true;
      } catch {
        if (raw.length > 0) return true;
      }
    }
  } catch {
    // Private mode, blocked storage, or a shape we don't recognise.
  }
  return false;
}

export async function ensureFreshSession(): Promise<boolean> {
  if (!isSupabaseConfigured() || isDemoMode()) return true;
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const session = data.session;
  // No session in hand: only give up if there's genuinely nothing stored.
  // Otherwise getSession() just failed to refresh and the caller should carry
  // on with the session it has rather than signing the user out (BUG-014).
  if (!session) return hasStoredSession();

  // No expiry on the session means we can't reason about staleness — trust it
  // rather than force a refresh on every single call (BUG-007). Refreshing
  // needlessly is what triggers the rotation conflicts below.
  if (session.expires_at == null) return true;

  // Refresh a minute early: a request leaving now can still arrive after the
  // token dies.
  const msLeft = session.expires_at * 1000 - Date.now();
  if (msLeft > 60_000) return true;

  // Single-flight. load(), the resume listener and scanReceipt() can all ask
  // at once; without this each fires its own refresh, and with refresh-token
  // rotation (10s reuse window) the later ones present an already-rotated
  // token and fail — which previously signed the user out mid-action
  // (BUG-007).
  if (!refreshInFlight) {
    refreshInFlight = sb.auth
      .refreshSession()
      .then(({ data: r, error }) => {
        if (r.session) return true;
        // The decisive question is WHY it failed, not THAT it failed
        // (BUG-014). A flaky mobile radio on app open must not cost someone
        // their login.
        return !isSessionReallyOver(error);
      })
      .catch(() => true) // a thrown error never reached the auth server's verdict
      .finally(() => {
        refreshInFlight = null;
      });
  }
  const stillValid = await refreshInFlight;

  // Either the refresh worked, or it failed for a reason that doesn't end the
  // session, or the current token simply hasn't expired yet.
  return stillValid || msLeft > 0;
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

/**
 * Sign out on THIS device only.
 *
 * supabase-js defaults `signOut()` to `scope: "global"`, which revokes the
 * refresh token on the auth server for every device the account is signed in
 * on. For a shared-household app that is actively wrong — Josh signing out on
 * his phone would sign his partner's phone out too — and it was catastrophic
 * when the app called it automatically after a failed refresh, because it
 * turned a recoverable network blip into a permanent logout everywhere
 * (BUG-014). Nothing in this app wants the global behaviour.
 */
export async function signOut(): Promise<void> {
  exitDemoMode();
  if (isSupabaseConfigured()) {
    await getSupabase().auth.signOut({ scope: "local" });
  }
}
