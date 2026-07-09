"use client";

/**
 * Home (Phase-1): auth-guarded balance hero with Settle up / Add expense,
 * recent expenses with soft-delete + 4s undo, the + FAB, and the Add-Expense
 * and Settle-Up sheets — all through the Repo (demo or Supabase). The full
 * tabbed shell (Expenses / List / Reports) lands with the rest of E4–E5.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddExpenseSheet } from "@/components/add-expense-sheet";
import { SettleSheet } from "@/components/settle-sheet";
import { Button, Card, Screen, Spinner } from "@/components/ui";
import { getDemoRepo, getSupabaseRepo, type Repo } from "@/lib/data";
import {
  CATEGORY_META,
  computeBalances,
  fmt,
  simplifyDebts,
  type Cents,
  type Expense,
  type GroupMember,
  type SettleTransaction,
  type User,
} from "@/lib/domain";
import { postAuthDestination } from "@/lib/routing";
import { signOut, useSessionState } from "@/lib/session";

interface HomeData {
  mode: "demo" | "supabase";
  repo: Repo;
  groupId: string;
  user: User;
  groupName: string;
  members: GroupMember[];
  expenses: Expense[];
  yourNet: number;
  transactions: SettleTransaction[];
  salaries: Record<string, Cents>;
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
  const transactions = simplifyDebts(balances);

  // Salaries for proportional splits: RLS only lets us read our own; other
  // members' arrive with salary-sharing / real accounts (Phase 3).
  const salaries: Record<string, Cents> = {};
  const myProfile = await repo.getProfile(user!.id);
  if (you && myProfile?.monthlySalaryCents) salaries[you.id] = myProfile.monthlySalaryCents;

  const other =
    yourNet > 0
      ? members.find((m) => m.id === transactions[0]?.fromMemberId)
      : members.find((m) => m.id === transactions[0]?.toMemberId);

  return {
    mode,
    repo,
    groupId,
    user: user!,
    groupName: groups.find((g) => g.id === groupId)?.name ?? "Household",
    members,
    expenses,
    yourNet,
    transactions,
    salaries,
    counterpartyName: other?.placeholderName ?? "your partner",
  };
}

export default function HomePage() {
  const router = useRouter();
  const session = useSessionState();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"none" | "add" | "settle">("none");
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const groupId = groups.find((g) => g.id === profile?.defaultGroupId)?.id ?? groups[0].id;
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
      // Defer a tick: load() sets state, which the lint rule forbids
      // synchronously inside an effect.
      void Promise.resolve().then(load);
    }
  }, [session.status, load, router]);

  function showToast(msg: string, undo?: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  async function handleDelete(e: Expense) {
    const d = data!;
    await d.repo.deleteExpense(e.id);
    await load();
    showToast("Expense deleted", async () => {
      await d.repo.restoreExpense(e.id);
      setToast(null);
      await load();
    });
  }

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
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}
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
        <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-1.2px", color: heroColor, marginBottom: 14 }}>
          {fmt(Math.abs(d.yourNet))}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={() => setSheet("settle")} variant="secondary" style={{ flex: 1 }}>
            Settle up
          </Button>
          <Button onClick={() => setSheet("add")} style={{ flex: 1 }}>
            Add expense
          </Button>
        </div>
        {d.members.length === 1 && (
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12 }}>
            It&apos;s just you so far — add your partner as a member from the next build, or split
            with a placeholder meanwhile.
          </p>
        )}
      </Card>

      <Card style={{ padding: 14, marginBottom: 80 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Recent activity</h2>
        {d.expenses.length === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0 10px" }}>
            No expenses yet — tap <span style={{ color: "var(--ink)", fontWeight: 700 }}>Add expense</span> to
            record the first one.
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
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14.5, fontWeight: 600 }}>{e.description}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {CATEGORY_META[e.category].label} · {memberName(e.payers[0]?.memberId ?? "")} paid
              </p>
            </div>
            <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
            <button
              aria-label={`Delete ${e.description}`}
              onClick={() => handleDelete(e)}
              style={{
                background: "none",
                border: "none",
                color: "var(--faint)",
                fontSize: 16,
                cursor: "pointer",
                padding: "4px 2px",
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </Card>

      <button
        aria-label="Add expense"
        onClick={() => setSheet("add")}
        style={{
          position: "fixed",
          right: "max(18px, calc(50% - 215px + 18px))",
          bottom: "calc(env(safe-area-inset-bottom) + 22px)",
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: "var(--primary)",
          color: "#fff",
          fontSize: 28,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "var(--shadow-fab)",
          zIndex: 40,
        }}
      >
        +
      </button>

      <AddExpenseSheet
        open={sheet === "add"}
        onClose={() => setSheet("none")}
        onSaved={async () => {
          setSheet("none");
          await load();
          showToast("Expense added");
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        salaries={d.salaries}
      />
      <SettleSheet
        open={sheet === "settle"}
        onClose={() => setSheet("none")}
        onRecorded={async () => {
          setSheet("none");
          await load();
          showToast("Payment recorded");
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        transactions={d.transactions}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom) + 90px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--s3)",
            border: "1px solid var(--line2)",
            borderRadius: 999,
            padding: "10px 18px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            zIndex: 60,
            animation: "toastPop .2s",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={toast.undo}
              style={{
                background: "none",
                border: "none",
                color: "var(--primary)",
                fontSize: 13.5,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </Screen>
  );
}
