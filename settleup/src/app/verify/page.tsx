"use client";

/**
 * OTP verification (design handoff "Auth & Onboarding" screen 2).
 * 6-digit letter-spaced code entry, resend link, shows the email entered.
 * Note: until custom SMTP is configured (free tier can't edit templates),
 * the email contains a sign-in LINK instead of a code — clicking it also
 * works (supabase-js picks the session up on landing).
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorText, Input, Logo, Screen } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { postAuthDestination } from "@/lib/routing";
import { useSessionState } from "@/lib/session";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSessionState();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Tapping the email link signs the user in (supabase-js broadcasts the
  // session across tabs) — a verify tab left open advances by itself.
  useEffect(() => {
    if (session.status === "supabase") {
      void postAuthDestination().then((dest) => router.replace(dest));
    }
  }, [session.status, router]);

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
          We emailed a sign-in link to
          <br />
          <span style={{ color: "var(--ink)", fontWeight: 700 }}>{email}</span>
        </p>
      </div>

      {/* Magic-link-first (Phase 6 comms rework): the email contains a LINK,
          not a code — lead with that. Code entry stays as a secondary path
          for when custom SMTP (with a real 6-digit code) is wired up. */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-card)",
          padding: 18,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>
          Open the email and tap the link
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.55 }}>
          That&apos;s the whole sign-in — no password, no code. You&apos;ll land right back here,
          signed in. (Check spam if it hasn&apos;t arrived in a minute.)
        </p>
      </div>

      <Button variant="secondary" onClick={resend} style={{ marginTop: 14 }}>
        {resent ? "Sent — check your inbox" : "Resend email"}
      </Button>
      <ErrorText>{error}</ErrorText>

      {!showCode ? (
        <Button variant="ghost" onClick={() => setShowCode(true)} style={{ marginTop: 18 }}>
          Got a 6-digit code instead? Enter it
        </Button>
      ) : (
        <div style={{ marginTop: 18 }}>
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
          <div style={{ height: 10 }} />
          <Button onClick={verify} disabled={busy}>
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
        </div>
      )}
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
