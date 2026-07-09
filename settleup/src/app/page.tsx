"use client";

/**
 * Home (Phase-1 interim): auth-guarded balance hero + recent expenses, wired
 * through the Repo (demo household or the real Supabase-backed one). The full
 * designed Home (tabs, sync pill, FAB, sheets) lands with epics E4–E5.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Screen, Spinner } from "@/components/ui";
import { getDemoRepo, getSupabaseRepo, type Repo } from "@/lib/data";
import {
  CATEGORY_META,
  computeBalances,
  fmt,
  simplifyDebts,
  type Expense,
  type GroupMember,
  type User,
} from "@/lib/domain";
import { postAuthDestination } from "@/lib/routing";
import { signOut, useSessionState } from "@/lib/session";

interface HomeData {
  mode: "demo" | "supabase";
  user: User;
  groupName: string;
  members: GroupMember[];
  expenses: Expense[];
  yourNet: number;
  counterpartyName: string;
}

async function loadHome(repo: Repo, mode: "demo" | "supabase", groupId: string): Promise<HomeData> {
  const [user, members, expenses, settlements, groups] = await Promise.all([
    repo.getCurrentUser(),
    repo.listMembers(groupId),
    repo.listExpenses(groupId),
    repo.listSettlements(groupId),
    repo.listGroups(),
  ]);
  const you = members.find((m) => m.userId === user!.id);
  const balances = computeBalances(members.map((m) => m.id), expenses, settlements);
  const yourNet = you ? balances[you.id] : 0;
  const tx = simplifyDebts(balances);
  const other =
    yourNet > 0
      ? members.find((m) => m.id === tx[0]?.fromMemberId)
      : members.find((m) => m.id === tx[0]?.toMemberId);
  return {
    mode,
    user: user!,
    groupName: groups.find((g) => g.id === groupId)?.name ?? "Household",
    members,
    expenses,
    yourNet,
    counterpartyName: other?.placeholderName ?? "your partner",
  };
}

export default function HomePage() {
  const router = useRouter();
  const session = useSessionState();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      if (session.status === "demo") {
        const { repo, groupId } = await getDemoRepo();
        setData(await loadHome(repo, "demo", groupId));
      } else if (session.status === "supabase") {
        const repo = getSupabaseRepo();
        const user = await repo.getCurrentUser();
        if (!user?.displayName) {
          router.replace(await postAuthDestination());
          return;
        }
        const groups = await repo.listGroups();
        if (groups.length === 0) {
          router.replace("/onboarding?step=space");
          return;
        }
        const profile = await repo.getProfile(user.id);
        const groupId =
          groups.find((g) => g.id === profile?.defaultGroupId)?.id ?? groups[0].id;
        setData(await loadHome(repo, "supabase", groupId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session.status, router]);

  useEffect(() => {
    if (session.status === "signedout") {
      router.replace("/welcome");
      return;
    }
    if (session.status === "demo" || session.status === "supabase") {
      void load();
    }
  }, [session.status, load, router]);

  if (session.status === "loading" || (!data && !error)) {
    return (
      <Screen center>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen center>
        <Card>
          <p style={{ color: "var(--red)", fontWeight: 600, fontSize: 14 }}>{error}</p>
          <div style={{ height: 12 }} />
          <Button variant="secondary" onClick={() => { setError(""); void load(); }}>
            Retry
          </Button>
        </Card>
      </Screen>
    );
  }

  const d = data!;
  const memberName = (id: string) => {
    const m = d.members.find((x) => x.id === id);
    if (!m) return "?";
    if (m.userId === d.user.id) return "You";
    return m.placeholderName ?? "Member";
  };

  const heroText =
    d.yourNet === 0
      ? "You're all settled"
      : d.yourNet > 0
        ? `${d.counterpartyName} owes you`
        : `You owe ${d.counterpartyName}`;
  const heroColor = d.yourNet === 0 ? "var(--muted)" : d.yourNet > 0 ? "var(--green)" : "var(--red)";

  return (
    <Screen>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>{d.groupName}</h1>
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {d.members.length} member{d.members.length === 1 ? "" : "s"}
            {d.mode === "demo" ? " · demo household" : ""}
          </p>
        </div>
        <button
          onClick={async () => {
            await signOut();
            router.replace("/welcome");
          }}
          style={{
            background: "var(--s2)",
            border: "1px solid var(--line2)",
            borderRadius: 999,
            color: "var(--muted)",
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </header>

      {d.mode === "demo" && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--amber)",
            background: "rgba(227,165,60,.12)",
            border: "1px solid rgba(227,165,60,.3)",
            borderRadius: 10,
            padding: "8px 12px",
            marginBottom: 14,
          }}
        >
          Demo data — nothing is saved. Sign in from the welcome screen to start your real household.
        </p>
      )}

      <Card style={{ marginBottom: 16, textAlign: "center" }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--faint)",
          }}
        >
          {heroText}
        </p>
        <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-1.2px", color: heroColor }}>
          {fmt(Math.abs(d.yourNet))}
        </p>
        {d.members.length === 1 && (
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
            It&apos;s just you so far — invites arrive with the next build.
          </p>
        )}
      </Card>

      <Card style={{ padding: 14 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Recent activity</h2>
        {d.expenses.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0 10px" }}>
            No expenses yet. Adding expenses arrives with the next build (E4) — the ledger,
            balances and settle-up maths are already live underneath.
          </p>
        )}
        {d.expenses.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderTop: "1px solid var(--line)",
            }}
          >
            <div>
              <p style={{ fontSize: 14.5, fontWeight: 600 }}>{e.description}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {CATEGORY_META[e.category].label} · {memberName(e.payers[0]?.memberId ?? "")} paid
              </p>
            </div>
            <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
          </div>
        ))}
      </Card>
    </Screen>
  );
}
