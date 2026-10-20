"use client";

/**
 * Welcome — log in or create an account with email + password (ADR-0006 rev).
 * A magic-link fallback keeps older accounts (created before passwords) and
 * anyone who prefers it working. "Skip" enters the demo household.
 *
 * Signup is instant (email confirmation is off in Supabase), so a new user
 * lands straight in onboarding. The invite flow is untouched: a pending invite
 * code set by /join survives auth and is redeemed by postAuthDestination /
 * onboarding once signed in.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Input, Screen } from "@/components/ui";
import { WaveHero } from "@/components/wave";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { postAuthDestination } from "@/lib/routing";
import { enterDemoMode } from "@/lib/session";

type Mode = "login" | "signup";

/**
 * Supabase signals "this email already has an account" differently depending
 * on whether email confirmation is on. This project runs with
 * `mailer_autoconfirm: true`, so it comes back as a hard error rather than
 * the silent null-session case (BUG-015). Match on the stable code first and
 * fall back to the message.
 */
function isAlreadyRegistered(error: { code?: string; status?: number; message: string }): boolean {
  if (error.code === "user_already_exists" || error.code === "email_exists") return true;
  return /already\s*(registered|exists)/i.test(error.message);
}

export default function WelcomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const validEmail = (a: string) => /^\S+@\S+\.\S+$/.test(a);

  async function submit() {
    const addr = email.trim().toLowerCase();
    setError("");
    setNotice("");
    if (!validEmail(addr)) return setError("Enter a valid email address");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (!isSupabaseConfigured()) return setError("Backend not configured yet — use the demo below");

    setBusy(true);
    const sb = getSupabase();
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: addr, password });
        if (error) {
          // "Already registered" is an expected situation, not a failure, and
          // it has a specific trap behind it: someone who has only ever used
          // an emailed sign-in link HAS an account but no password, so
          // signing up fails AND logging in with the password they just typed
          // will fail too. Point at the two routes that actually work rather
          // than showing a raw backend string (BUG-015). Their data is safe
          // either way — the account is keyed on the email address.
          if (isAlreadyRegistered(error)) {
            setMode("login");
            setNotice(
              "You already have an account with this email — your Tallies are still there. " +
                "If you've only ever signed in with an emailed link, you won't have a password yet: " +
                "use “Email me a sign-in link” below, or reset your password."
            );
            return;
          }
          setError(error.message);
          return;
        }
        if (!data.session) {
          // Reachable if email confirmation is ever switched on: Supabase then
          // hides the collision instead of erroring.
          setMode("login");
          setNotice(
            "That email may already have an account — log in, or use “Email me a sign-in link” below."
          );
          return;
        }
        router.replace(await postAuthDestination());
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: addr, password });
        if (error) {
          setError(
            error.message.toLowerCase().includes("invalid")
              ? "Wrong email or password. If you've only ever signed in with an emailed link, " +
                  "you won't have a password — use “Email me a sign-in link” below."
              : error.message
          );
          return;
        }
        router.replace(await postAuthDestination());
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const addr = email.trim().toLowerCase();
    if (!validEmail(addr)) return setError("Enter your email first, then tap reset");
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.resetPasswordForEmail(addr, {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice("Check your email for a password-reset link.");
  }

  async function magicLink() {
    const addr = email.trim().toLowerCase();
    if (!validEmail(addr)) return setError("Enter your email first");
    if (!isSupabaseConfigured()) return setError("Backend not configured yet — use the demo below");
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else router.push(`/verify?email=${encodeURIComponent(addr)}`);
  }

  return (
    <Screen padding={26}>
      {/* App icon deliberately dropped — the wordmark stands alone until a
          new logo exists (ADR-0016). Staggered rise-in via .rise-in. */}
      <WaveHero height={280}>
        <h1
          className="rise-in"
          style={{
            fontSize: 42,
            fontWeight: "var(--w-black)" as unknown as number,
            letterSpacing: "-1.2px",
            animationDelay: "60ms",
          }}
        >
          Tally
        </h1>
        <p
          className="rise-in"
          style={{
            fontSize: 14.5,
            marginTop: 10,
            lineHeight: 1.5,
            opacity: 0.92,
            animationDelay: "130ms",
          }}
        >
          Shared expenses for your home —<br />
          always know who owes whom.
        </p>
      </WaveHero>
      <div className="rise-in" style={{ height: 26, animationDelay: "200ms" }} />

      {/* Log in / Sign up toggle */}
      <div
        className="rise-in"
        style={{
          animationDelay: "200ms",
          display: "flex",
          background: "var(--s2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-input)",
          padding: 4,
          gap: 4,
          marginBottom: 16,
        }}
      >
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
              setNotice("");
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              background: mode === m ? "var(--primary)" : "transparent",
              color: mode === m ? "#fff" : "var(--muted)",
            }}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <Input value={email} onChange={setEmail} placeholder="you@email.com" type="email" inputMode="email" />
      <div style={{ height: 10 }} />
      <Input
        value={password}
        onChange={setPassword}
        placeholder={mode === "signup" ? "Choose a password (min 6)" : "Password"}
        type="password"
        onEnter={submit}
      />
      <div style={{ height: 12 }} />
      <Button onClick={submit} disabled={busy}>
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
      </Button>

      {notice && (
        <p style={{ color: "var(--green)", fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: "center" }}>
          {notice}
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      {mode === "login" && (
        <Button variant="ghost" onClick={forgotPassword} disabled={busy} style={{ marginTop: 6 }}>
          Forgot password?
        </Button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontSize: 11.5, color: "var(--faint)", fontWeight: 600 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      <Button variant="secondary" onClick={magicLink} disabled={busy}>
        Email me a sign-in link instead
      </Button>
      <div style={{ height: 8 }} />
      <Button
        variant="ghost"
        onClick={() => {
          enterDemoMode();
          router.push("/");
        }}
      >
        Skip — explore the demo Tally
      </Button>
    </Screen>
  );
}
