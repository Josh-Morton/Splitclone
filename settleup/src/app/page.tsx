"use client";

/**
 * The app shell (Phase-1): bottom tabs (Home / Expenses / List / Reports per
 * the design; List and Reports light up in Phases 4–5), balance hero,
 * date-grouped Expenses tab, expense detail overlay, Add/Edit + Settle +
 * Invite sheets — all through the Repo (demo or Supabase).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddExpenseSheet } from "@/components/add-expense-sheet";
import { ExpenseDetail } from "@/components/expense-detail";
import { ExpensesTab } from "@/components/expenses-tab";
import { InviteSheet } from "@/components/invite-sheet";
import { ListTab, type CartDraft } from "@/components/list-tab";
import { RecurringOverlay } from "@/components/recurring";
import { SettingsSheet } from "@/components/settings-sheet";
import { SettleSheet } from "@/components/settle-sheet";
import { TabBar, type Tab } from "@/components/tab-bar";
import { Button, Card, Screen, Spinner } from "@/components/ui";
import { getDemoRepo, getSupabaseRepo, type Repo } from "@/lib/data";
import {
  CATEGORY_META,
  computeBalances,
  fmt,
  simplifyDebts,
  type Expense,
  type GroupMember,
  type RecurringExpense,
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
  recurring: RecurringExpense[];
  counterpartyName: string;
}

async function loadHome(repo: Repo, mode: "demo" | "supabase", groupId: string): Promise<HomeData> {
  // Catch-up first so bills that came due while no one had the app open
  // appear in this load (the daily server cron is the primary generator).
  await repo.processDueRecurring(groupId).catch(() => 0);
  const [user, members, expenses, settlements, groups, recurring] = await Promise.all([
    repo.getCurrentUser(),
    repo.listMembers(groupId),
    repo.listExpenses(groupId),
    repo.listSettlements(groupId),
    repo.listGroups(),
    repo.listRecurring(groupId),
  ]);
  const you = members.find((m) => m.userId === user!.id);
  const balances = computeBalances(members.map((m) => m.id), expenses, settlements);
  const yourNet = you ? balances[you.id] : 0;
  const transactions = simplifyDebts(balances);

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
    recurring,
    counterpartyName: other?.profileName || other?.placeholderName || "your partner",
  };
}

export default function HomePage() {
  const router = useRouter();
  const session = useSessionState();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<"none" | "add" | "settle" | "invite" | "settings">("none");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cartDraft, setCartDraft] = useState<CartDraft | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [listRefresh, setListRefresh] = useState(0);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      let next: HomeData | null = null;
      if (session.status === "demo") {
        const { repo, groupId } = await getDemoRepo();
        next = await loadHome(repo, "demo", groupId);
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
        next = await loadHome(repo, "supabase", groupId);
      }
      if (next) {
        setData(next);
        // Keep an open detail view in sync with fresh data (or close if gone).
        setViewing((v) => (v ? (next.expenses.find((e) => e.id === v.id) ?? null) : null));
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
    setViewing(null);
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
    return m.profileName || m.placeholderName || "Member";
  };

  const heroText =
    d.yourNet === 0
      ? "You're all settled"
      : d.yourNet > 0
        ? `${d.counterpartyName} owes you`
        : `You owe ${d.counterpartyName}`;
  const heroColor = d.yourNet === 0 ? "var(--muted)" : d.yourNet > 0 ? "var(--green)" : "var(--red)";
  const recent = d.expenses.slice(0, 5);

  return (
    <Screen>
      {tab === "home" && (
        <>
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
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSheet("invite")}
                style={{
                  background: "var(--bluebg)",
                  border: "1px solid var(--primary)",
                  borderRadius: 999,
                  color: "var(--primary)",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Invite
              </button>
              <button
                onClick={() => setSheet("settings")}
                aria-label="Settings"
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
                Settings
              </button>
            </div>
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
                It&apos;s just you so far — tap Invite to add your partner (or a placeholder member).
              </p>
            )}
          </Card>

          {(() => {
            const next = d.recurring.filter((r) => !r.paused)[0];
            return (
              <Card
                style={{ padding: 14, marginBottom: 16, cursor: "pointer" }}
              >
                <div
                  role="button"
                  aria-label="Recurring bills"
                  onClick={() => setRecurringOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  {next ? (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--faint)",
                          }}
                        >
                          Upcoming · {new Date(next.nextRun + "T00:00:00").getDate()}{" "}
                          {new Date(next.nextRun + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}
                        </p>
                        <p style={{ fontSize: 14.5, fontWeight: 600 }}>{next.description}</p>
                      </div>
                      <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(next.amountCents ?? 0)}</p>
                    </>
                  ) : (
                    <p style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}>
                      Set up recurring bills (rent, fibre…)
                    </p>
                  )}
                  <span style={{ color: "var(--faint)", fontSize: 18 }}>›</span>
                </div>
              </Card>
            );
          })()}

          <Card style={{ padding: 14, marginBottom: 90 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>Recent activity</h2>
              {d.expenses.length > 0 && (
                <button
                  onClick={() => setTab("expenses")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  See all
                </button>
              )}
            </div>
            {recent.length === 0 && (
              <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "6px 0 10px" }}>
                No expenses yet — tap <span style={{ color: "var(--ink)", fontWeight: 700 }}>Add expense</span> to
                record the first one.
              </p>
            )}
            {recent.map((e) => (
              <div
                key={e.id}
                role="button"
                aria-label={`Open ${e.description}`}
                onClick={() => setViewing(e)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid var(--line)",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14.5, fontWeight: 600 }}>{e.description}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    {CATEGORY_META[e.category].label} · {memberName(e.payers[0]?.memberId ?? "")}
                    {e.payers.length > 1 ? ` +${e.payers.length - 1}` : ""} paid
                  </p>
                </div>
                <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
              </div>
            ))}
          </Card>
        </>
      )}

      {tab === "expenses" && (
        <div style={{ marginBottom: 90 }}>
          <ExpensesTab expenses={d.expenses} members={d.members} meUserId={d.user.id} onOpen={setViewing} />
        </div>
      )}

      {tab === "list" && (
        <div style={{ marginBottom: 90 }}>
          <ListTab
            key={listRefresh}
            repo={d.repo}
            groupId={d.groupId}
            live={d.mode === "supabase"}
            onCartToExpense={(draft) => {
              setCartDraft(draft);
              setSheet("add");
            }}
          />
        </div>
      )}

      {tab === "reports" && (
        <div style={{ marginBottom: 90 }}>
          <header style={{ marginBottom: 16 }}>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>Reports</h1>
          </header>
          <Card>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              Reports arrive in Phase 5 — monthly trends, category breakdowns, who-paid-what, and
              Excel export.
            </p>
          </Card>
        </div>
      )}

      <button
        aria-label="Add expense"
        onClick={() => setSheet("add")}
        style={{
          position: "fixed",
          right: "max(18px, calc(50% - 215px + 18px))",
          bottom: "calc(env(safe-area-inset-bottom) + 86px)",
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

      <TabBar active={tab} onChange={setTab} />

      {viewing && (
        <ExpenseDetail
          expense={viewing}
          members={d.members}
          meUserId={d.user.id}
          onBack={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setSheet("add");
          }}
          onDelete={() => handleDelete(viewing)}
        />
      )}

      <AddExpenseSheet
        key={editing?.id ?? (cartDraft ? "cart" : "new")}
        open={sheet === "add"}
        onClose={() => {
          setSheet("none");
          setEditing(null);
          setCartDraft(null);
        }}
        onSaved={async () => {
          const wasEdit = Boolean(editing);
          const wasCart = Boolean(cartDraft);
          setSheet("none");
          setEditing(null);
          setCartDraft(null);
          if (wasCart) {
            await d.repo.clearCheckedShoppingItems(d.groupId);
            setListRefresh((k) => k + 1);
          }
          await load();
          showToast(wasCart ? "Cart converted to an expense" : wasEdit ? "Expense updated" : "Expense added");
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        editing={editing}
        draft={cartDraft}
      />
      <InviteSheet
        open={sheet === "invite"}
        onClose={() => setSheet("none")}
        onMembersChanged={() => void load()}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
      />
      <SettingsSheet
        open={sheet === "settings"}
        onClose={() => setSheet("none")}
        onSaved={async () => {
          setSheet("none");
          await load();
          showToast("Settings saved");
        }}
        onSignOut={async () => {
          await signOut();
          router.replace("/welcome");
        }}
        repo={d.repo}
        user={d.user}
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

      <RecurringOverlay
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        onChanged={async (msg) => {
          await load();
          showToast(msg);
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        rules={d.recurring}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom) + 150px)",
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
