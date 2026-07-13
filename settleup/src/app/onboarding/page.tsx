"use client";

/**
 * First-run onboarding (design handoff screens 3–5):
 *   1. Name  — display name (avatar upload comes with Phase 5 storage work)
 *   2. Salary — optional; powers proportional splits; privacy reassurance
 *   3. Space — create the household (join-by-code arrives with E3 invites)
 * A 3-step progress indicator sits at the top.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ErrorText, Input, Label, Screen } from "@/components/ui";
import { getSupabaseRepo } from "@/lib/data";
import { parseCents, fmt } from "@/lib/domain";
import { clearPendingInviteCode, getPendingInviteCode, useSessionState } from "@/lib/session";

type Step = "name" | "salary" | "space";

function Progress({ step }: { step: Step }) {
  const idx = { name: 0, salary: 1, space: 2 }[step];
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 30 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: i === idx ? 26 : 8,
            height: 8,
            borderRadius: 999,
            background: i <= idx ? "var(--primary)" : "var(--s3)",
            transition: "width .2s",
          }}
        />
      ))}
    </div>
  );
}

function OnboardingFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSessionState();
  const [step, setStep] = useState<Step>((params.get("step") as Step) || "name");
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const [space, setSpace] = useState("Our household");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.status === "signedout" || session.status === "demo") {
      router.replace("/welcome");
    }
  }, [session.status, router]);

  if (session.status !== "supabase") {
    return <Screen center>{null}</Screen>;
  }

  const repo = getSupabaseRepo();

  async function saveName() {
    if (!name.trim()) {
      setError("What should we call you?");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await repo.getCurrentUser();
      await repo.updateProfile({ userId: user!.id, displayName: name.trim() });
      setStep("salary");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveSalary(skip: boolean) {
    setBusy(true);
    setError("");
    try {
      const user = await repo.getCurrentUser();
      if (!skip) {
        const cents = parseCents(salary);
        if (cents <= 0) {
          setError("Enter your monthly salary, or skip for now");
          setBusy(false);
          return;
        }
        await repo.updateProfile({ userId: user!.id, monthlySalaryCents: cents });
      }
      // Arrived via an invite link? Accepting it replaces the space step.
      const pending = getPendingInviteCode();
      if (pending) {
        router.replace(`/join/${encodeURIComponent(pending)}`);
        return;
      }
      setStep("space");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createSpace() {
    if (!space.trim()) {
      setError("Give your household a name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const group = await repo.createGroup(space.trim());
      const user = await repo.getCurrentUser();
      await repo.updateProfile({ userId: user!.id, defaultGroupId: group.id });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function joinWithCode() {
    if (!joinCode.trim()) {
      setError("Enter the invite code you received");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { groupId } = await repo.redeemInvite(joinCode.trim());
      const user = await repo.getCurrentUser();
      await repo.updateProfile({ userId: user!.id, defaultGroupId: groupId });
      clearPendingInviteCode();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen padding={26} center>
      <Progress step={step} />

      {step === "name" && (
        <Card>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>
            What&apos;s your name?
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
            This is how you&apos;ll appear to the people you share expenses with.
          </p>
          <Label>Display name</Label>
          <Input value={name} onChange={setName} placeholder="e.g. Josh" autoFocus onEnter={saveName} />
          <div style={{ height: 16 }} />
          <Button onClick={saveName} disabled={busy}>
            Continue
          </Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      {step === "salary" && (
        <Card>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>
            Monthly salary <span style={{ color: "var(--faint)", fontWeight: 600 }}>(optional)</span>
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
            Powers <span style={{ color: "var(--ink)", fontWeight: 600 }}>proportional splits</span> — the
            higher earner contributes more. Your partner only ever sees the split amounts,{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>never your income</span>.
          </p>
          <Label>Net monthly salary</Label>
          <Input
            value={salary}
            onChange={setSalary}
            placeholder="0,00"
            inputMode="decimal"
            prefix="R"
            onEnter={() => saveSalary(false)}
          />
          {parseCents(salary) > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 8 }}>= {fmt(parseCents(salary))}</p>
          )}
          <div style={{ height: 16 }} />
          <Button onClick={() => saveSalary(false)} disabled={busy}>
            Continue
          </Button>
          <div style={{ height: 8 }} />
          <Button variant="ghost" onClick={() => saveSalary(true)} disabled={busy}>
            Skip for now
          </Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      {step === "space" && (
        <Card>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>
            Create your household
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
            A space for you and your partner&apos;s shared expenses. You can invite them from Settings
            once you&apos;re in.
          </p>
          <Label>Household name</Label>
          <Input value={space} onChange={setSpace} placeholder="e.g. Our apartment" onEnter={createSpace} />
          <div style={{ height: 16 }} />
          <Button onClick={createSpace} disabled={busy}>
            {busy ? "Creating…" : "Create household"}
          </Button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 700 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          <Label>Join with an invite code</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input
                value={joinCode}
                onChange={(v) => setJoinCode(v.toUpperCase())}
                placeholder="e.g. KWM-4T2Q"
                onEnter={joinWithCode}
              />
            </div>
            <Button variant="secondary" onClick={joinWithCode} disabled={busy} style={{ width: 84 }}>
              Join
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}
    </Screen>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingFlow />
    </Suspense>
  );
}
