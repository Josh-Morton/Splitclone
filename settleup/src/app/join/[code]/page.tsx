"use client";

/**
 * Invite accept screen (design handoff "Invite accept (invitee view)"):
 * shows inviter + space name, Accept / Not now. Signed-out visitors are sent
 * to sign in first; the code is remembered and redeemed right after auth
 * (see lib/routing.ts).
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, ErrorText, Logo, Screen, Spinner } from "@/components/ui";
import { getSupabaseRepo } from "@/lib/data";
import { setPendingInviteCode, clearPendingInviteCode, useSessionState } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? "").toUpperCase();
  const session = useSessionState();
  const [preview, setPreview] = useState<{ groupName: string; inviterName: string } | null | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (!isSupabaseConfigured()) {
        setPreview(null);
        return;
      }
      try {
        const p = await getSupabaseRepo().previewInvite(code);
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function accept() {
    if (session.status !== "supabase") {
      // Remember the code; after sign-in + name step we come back here.
      setPendingInviteCode(code);
      router.push("/welcome");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const repo = getSupabaseRepo();
      const { groupId } = await repo.redeemInvite(code);
      const user = await repo.getCurrentUser();
      await repo.updateProfile({ userId: user!.id, defaultGroupId: groupId });
      clearPendingInviteCode();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (preview === "loading" || session.status === "loading") {
    return (
      <Screen center>
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen padding={26} center>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <Logo size={52} />
      </div>
      <Card style={{ textAlign: "center" }}>
        {preview ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 8 }}>
              {preview.inviterName} invited you
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
              Join <span style={{ color: "var(--ink)", fontWeight: 700 }}>{preview.groupName}</span> to
              track shared expenses together.
            </p>
            <Button onClick={accept} disabled={busy}>
              {busy
                ? "Joining…"
                : session.status === "supabase"
                  ? "Accept & join"
                  : "Sign in to accept"}
            </Button>
            <div style={{ height: 8 }} />
            <Button variant="ghost" onClick={() => router.push("/")}>
              Not now
            </Button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Invite not found</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20 }}>
              This invite code is invalid or has expired. Ask for a new one.
            </p>
            <Button variant="secondary" onClick={() => router.push("/")}>
              Go to the app
            </Button>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}
