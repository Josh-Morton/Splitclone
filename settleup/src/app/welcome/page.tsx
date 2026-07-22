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
import { Button, ErrorText, Input, Logo, Screen } from "@/components/ui";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { postAuthDestination } from "@/lib/routing";
import { enterDemoMode } from "@/lib/session";

type Mode = "login" | "signup";

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
          setError(error.message);
          return;
        }
        if (!data.session) {
          // Email already registered (Supabase hides this to prevent
          // enumeration) — nudge them to log in.
          setMode("login");
          setNotice("That email may already have an account — try logging in.");
          return;
        }
        router.replace(await postAuthDestination());
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: addr, password });
        if (error) {
          setError(
            error.message.toLowerCase().includes("invalid")
              ? "Wrong email or password. New here? Create an account."
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
    <Screen padding={26} center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
        <Logo />
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px", marginTop: 18 }}>Tally</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          Shared expenses for your home —<br />
          always know who owes whom.
        </p>
      </div>

      {/* Log in / Sign up toggle */}
      <div
        style={{
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
        Skip — explore the demo household
      </Button>
    </Screen>
  );
}
