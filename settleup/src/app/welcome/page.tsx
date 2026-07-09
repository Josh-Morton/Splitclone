"use client";

/**
 * Welcome / Sign in (design handoff "Auth & Onboarding" screen 1).
 * Email → OTP code, or skip into the demo household.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Input, Logo, Screen } from "@/components/ui";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { enterDemoMode } from "@/lib/session";

export default function WelcomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) {
      setError("Enter a valid email address");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Backend not configured yet — use the demo below");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.signInWithOtp({
      email: addr,
      // Magic-link fallback returns to wherever we're running (localhost or
      // the deployed URL) — origin must be in the Supabase redirect allow list.
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(addr)}`);
  }

  return (
    <Screen padding={26} center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 34 }}>
        <Logo />
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px", marginTop: 18 }}>SettleUp</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          Shared expenses for your home —<br />
          always know who owes whom.
        </p>
      </div>

      <Input
        value={email}
        onChange={setEmail}
        placeholder="you@email.com"
        type="email"
        inputMode="email"
        onEnter={sendCode}
      />
      <div style={{ height: 12 }} />
      <Button onClick={sendCode} disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in code"}
      </Button>
      <ErrorText>{error}</ErrorText>

      <div style={{ height: 26 }} />
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
