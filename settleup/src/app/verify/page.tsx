"use client";

/**
 * OTP verification (design handoff "Auth & Onboarding" screen 2).
 * 6-digit letter-spaced code entry, resend link, shows the email entered.
 * Note: until custom SMTP is configured (free tier can't edit templates),
 * the email contains a sign-in LINK instead of a code — clicking it also
 * works (supabase-js picks the session up on landing).
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorText, Input, Logo, Screen } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { postAuthDestination } from "@/lib/routing";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  async function verify() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await getSupabase().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.replace(await postAuthDestination());
  }

  async function resend() {
    setResent(false);
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setResent(true);
  }

  return (
    <Screen padding={26} center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
        <Logo size={52} />
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginTop: 16 }}>
          Check your email
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          We sent a sign-in email to
          <br />
          <span style={{ color: "var(--ink)", fontWeight: 700 }}>{email}</span>
        </p>
      </div>

      <Input
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, ""))}
        placeholder="••••••"
        inputMode="numeric"
        maxLength={6}
        center
        letterSpacing={10}
        autoFocus
        onEnter={verify}
      />
      <div style={{ height: 12 }} />
      <Button onClick={verify} disabled={busy}>
        {busy ? "Verifying…" : "Verify & continue"}
      </Button>
      <ErrorText>{error}</ErrorText>

      <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 22, lineHeight: 1.6 }}>
        If the email contains a sign-in link instead of a code, just tap the link.
      </p>
      <Button variant="ghost" onClick={resend} style={{ marginTop: 6 }}>
        {resent ? "Sent — check your inbox" : "Resend email"}
      </Button>
    </Screen>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
