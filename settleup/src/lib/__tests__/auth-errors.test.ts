/**
 * BUG-014 regression tests.
 *
 * The bug these lock down: the app treated *every* failed token refresh as
 * "your session is over", then called a global signOut() which revoked the
 * refresh token server-side on all devices. A single flaky request on a cold
 * PWA open therefore logged people out permanently, everywhere.
 *
 * The cases below are the ones that actually happen on a phone. Each "must
 * NOT end the session" case is a user who previously got kicked out.
 */

import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { isSessionReallyOver } from "../auth-errors";

describe("isSessionReallyOver", () => {
  it("does not end the session when there is no error", () => {
    expect(isSessionReallyOver(null)).toBe(false);
    expect(isSessionReallyOver(undefined)).toBe(false);
  });

  it("does not end the session on a network failure (offline / radio not up)", () => {
    // The commonest case by far: PWA opens from the cached shell before the
    // phone's connection is ready.
    expect(isSessionReallyOver(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(false);
  });

  it("does not end the session on a 5xx from the auth server", () => {
    expect(isSessionReallyOver(new AuthRetryableFetchError("Bad gateway", 502))).toBe(false);
  });

  it("does not end the session when a concurrent refresh won the race", () => {
    // Token rotation: another in-flight refresh already rotated the token.
    // The session is fine — the other call saved it.
    expect(isSessionReallyOver(new AuthRefreshDiscardedError())).toBe(false);
  });

  it("does not end the session for an unrecognised error shape", () => {
    // Fail safe: an error we can't classify must not cost someone their login.
    expect(isSessionReallyOver(new AuthUnknownError("something odd", new Error("x")))).toBe(false);
  });

  it("DOES end the session when the server rejects the refresh token", () => {
    expect(isSessionReallyOver(new AuthApiError("Invalid Refresh Token", 400, "invalid_grant"))).toBe(
      true
    );
    expect(isSessionReallyOver(new AuthApiError("Unauthorized", 401, undefined))).toBe(true);
  });

  it("does not end the session on a 429 rate-limit", () => {
    // Being throttled says nothing about whether the token is valid.
    expect(isSessionReallyOver(new AuthApiError("Too many requests", 429, undefined))).toBe(false);
  });
});
