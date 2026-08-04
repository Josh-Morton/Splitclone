"use client";

/**
 * The app shell (Phase-1): bottom tabs (Home / Expenses / List / Reports per
 * the design; List and Reports light up in Phases 4–5), balance hero,
 * date-grouped Expenses tab, expense detail overlay, Add/Edit + Settle +
 * Invite sheets — all through the Repo (demo or Supabase).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityOverlay } from "@/components/activity-overlay";
import { AddExpenseSheet } from "@/components/add-expense-sheet";
import { ExpenseDetail } from "@/components/expense-detail";
import { ExpensesTab } from "@/components/expenses-tab";
import { ListTab } from "@/components/list-tab";
import { ManageTallySheet } from "@/components/manage-tally-sheet";
import { RecurringOverlay } from "@/components/recurring";
import { ReportsTab } from "@/components/reports-tab";
import { SettingsSheet } from "@/components/settings-sheet";
import { SpacesSheet } from "@/components/spaces-sheet";
import { SettleSheet } from "@/components/settle-sheet";
import { SplittyTab } from "@/components/splitty-tab";
import { TabBar, type Tab } from "@/components/tab-bar";
import { Button, Card, Screen, Spinner } from "@/components/ui";
import { getDemoRepo, getSupabaseRepo, type Repo } from "@/lib/data";
import {
  categoryMeta,
  computeBalances,
  pushRecentCurrency,
  fmt,
  simplifyDebts,
  type ExchangeRate,
  type Expense,
  type Group,
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
  groups: Group[];
  members: GroupMember[];
  expenses: Expense[];
  settlements: import("@/lib/domain").Settlement[];
  yourNet: number;
  transactions: SettleTransaction[];
  recurring: RecurringExpense[];
  counterpartyName: string;
  /** Phase 14: cached FX rates + this user's recent picks (sticky currency). */
  rates: ExchangeRate[];
  recentCurrencies: string[];
}

/**
 * Fetches everything the home screen needs for one Tally.
 *
 * `user` and `groups` are passed in rather than refetched: the caller already
 * has them from deciding WHICH Tally to load, and this used to fetch both a
 * second time (Phase 16).
 */
async function loadHome(
  repo: Repo,
  mode: "demo" | "supabase",
  groupId: string,
  user: User,
  groups: Group[],
  recentCurrencies: string[]
): Promise<HomeData> {
  // The recurring catch-up runs alongside the reads rather than gating them —
  // it only matters when it actually generates something, which is rare (the
  // daily server cron is the primary generator). When it does, the expense and
  // recurring snapshots taken in parallel predate the new rows, so those two
  // are re-read below. Same end state, without a blocking round trip on every
  // single load.
  const [generated, members, expenses0, settlements, recurring0, rates] = await Promise.all([
    repo.processDueRecurring(groupId).catch(() => 0),
    repo.listMembers(groupId),
    repo.listExpenses(groupId),
    repo.listSettlements(groupId),
    repo.listRecurring(groupId),
    // Rides along in the existing batch, and an empty list just means the
    // picker offers Rand only — never a blocked load.
    repo.listExchangeRates().catch(() => []),
  ]);
  const [expenses, recurring] =
    generated > 0
      ? await Promise.all([repo.listExpenses(groupId), repo.listRecurring(groupId)])
      : [expenses0, recurring0];

  const you = members.find((m) => m.userId === user.id);
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
    user,
    groupName: groups.find((g) => g.id === groupId)?.name ?? "Tally",
    groups,
    members,
    expenses,
    settlements,
    yourNet,
    transactions,
    recurring,
    counterpartyName: other?.profileName || other?.placeholderName || "your partner",
    rates,
    recentCurrencies,
  };
}

export default function HomePage() {
  const router = useRouter();
  const session = useSessionState();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<
    "none" | "add" | "settle" | "manageTally" | "settings" | "spaces"
  >("none");
  const [editing, setEditing] = useState<Expense | null>(null);
  // Which Tally the Manage sheet is acting on — not necessarily the active
  // one, since you can manage any Tally from the switcher. Stored as an id and
  // resolved against fresh data below, so a rename or split change reflects
  // immediately instead of showing a stale snapshot.
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  // Push deep links (?expense=<id> / ?tab=list) are consumed exactly once.
  const deepLinkDone = useRef(false);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      // Identity and the Tally list are independent, so they go together —
      // and getMe() folds the user + profile into a single round trip since
      // they share a row. This chain used to be four sequential fetches with
      // getCurrentUser and listGroups each run twice (Phase 16).
      let next: HomeData | null = null;
      if (session.status === "demo") {
        const { repo, groupId } = await getDemoRepo();
        const [me, groups] = await Promise.all([repo.getMe(), repo.listGroups()]);
        const gid = groups.find((g) => g.id === me?.profile?.defaultGroupId)?.id ?? groupId;
        next = await loadHome(repo, "demo", gid, me!.user, groups, me?.profile?.recentCurrencies ?? []);
      } else if (session.status === "supabase") {
        const repo = getSupabaseRepo();
        const [me, groups] = await Promise.all([repo.getMe(), repo.listGroups()]);
        if (!me?.user.displayName) {
          router.replace(await postAuthDestination());
          return;
        }
        if (groups.length === 0) {
          router.replace("/onboarding?step=space");
          return;
        }
        const groupId = groups.find((g) => g.id === me.profile?.defaultGroupId)?.id ?? groups[0].id;
        next = await loadHome(repo, "supabase", groupId, me.user, groups, me.profile?.recentCurrencies ?? []);
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

  // Deep links from a push notification (Phase 9): ?tab=list opens the List
  // tab; ?expense=<id> opens that expense's detail, switching space first if
  // it lives in a different one. Runs once, then strips the params so a
  // refresh doesn't reopen it.
  useEffect(() => {
    if (!data || deepLinkDone.current) return;
    const params = new URLSearchParams(window.location.search);
    const wantTab = params.get("tab");
    const wantExpense = params.get("expense");
    if (!wantTab && !wantExpense) return;
    deepLinkDone.current = true;

    void Promise.resolve().then(async () => {
      if (wantTab === "list") setTab("list");

      if (wantExpense) {
        const here = data.expenses.find((e) => e.id === wantExpense);
        if (here) {
          setViewing(here);
        } else {
          // Not in the active space — find it, switch, and reload.
          const found = await data.repo.getExpense(wantExpense).catch(() => null);
          if (found && found.groupId !== data.groupId) {
            await data.repo
              .updateProfile({ userId: data.user.id, defaultGroupId: found.groupId })
              .catch(() => null);
            await load();
            setViewing(found);
          } else if (found) {
            setViewing(found);
          }
        }
      }
      window.history.replaceState(null, "", window.location.pathname);
    });
  }, [data, load]);

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
  // The full Group for the active Tally — ManageTallySheet needs more than the
  // name (defaultSplitMethod, createdBy). Undefined only in the transient case
  // where the active id isn't in the freshly-loaded list.
  const activeGroup = d.groups.find((g) => g.id === d.groupId);
  // Resolved fresh each render; becomes null once a managed Tally is deleted.
  const managingGroup = managingGroupId ? (d.groups.find((g) => g.id === managingGroupId) ?? null) : null;
  const memberName = (id: string) => {
    const m = d.members.find((x) => x.id === id);
    if (!m) return "?";
    if (m.userId === d.user.id) return "You";
    return m.profileName || m.placeholderName || "Member";
  };

  const multiParty = d.members.length > 2;
  const meMemberId = d.members.find((m) => m.userId === d.user.id)?.id;
  const owedToMe = d.transactions.filter((t) => t.toMemberId === meMemberId);
  const iOwe = d.transactions.filter((t) => t.fromMemberId === meMemberId);
  const heroText =
    d.yourNet === 0
      ? "You're all settled"
      : d.yourNet > 0
        ? multiParty
          ? "You're owed"
          : `${d.counterpartyName} owes you`
        : multiParty
          ? "You owe"
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
            <button
              onClick={() => setSheet("spaces")}
              aria-label="Switch Tally"
              style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--ink)" }}
            >
              <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>
                {d.groupName} <span style={{ color: "var(--faint)", fontSize: 16 }}>▾</span>
              </h1>
              <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {d.members.length} member{d.members.length === 1 ? "" : "s"}
                {d.groups.length > 1 ? ` · ${d.groups.length} Tallies` : ""}
                {d.mode === "demo" ? " · demo Tally" : ""}
              </p>
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setActivityOpen(true)}
                aria-label="Activity"
                style={{
                  background: "var(--s2)",
                  border: "1px solid var(--line2)",
                  borderRadius: 999,
                  color: "var(--muted)",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                🔔
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
              Demo data — nothing is saved. Sign in from the welcome screen to start your real Tally.
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
            {/* 3+ members: break the net down per person */}
            {multiParty && (owedToMe.length > 0 || iOwe.length > 0) && (
              <div
                style={{
                  textAlign: "left",
                  borderTop: "1px solid var(--line)",
                  margin: "0 0 14px",
                  paddingTop: 12,
                }}
              >
                {owedToMe.map((t) => (
                  <div
                    key={t.fromMemberId + t.toMemberId}
                    style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}
                  >
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{memberName(t.fromMemberId)} owes you</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>{fmt(t.amountCents)}</span>
                  </div>
                ))}
                {iOwe.map((t) => (
                  <div
                    key={t.fromMemberId + t.toMemberId}
                    style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}
                  >
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>You owe {memberName(t.toMemberId)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>{fmt(t.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Button onClick={() => setSheet("settle")} variant="secondary" style={{ flex: 1 }}>
                Clear the tally
              </Button>
              <Button onClick={() => setSheet("add")} style={{ flex: 1 }}>
                Add expense
              </Button>
            </div>
            {d.members.length === 1 && (
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12 }}>
                It&apos;s just you so far — tap the Tally name above, then ⋯, to invite your partner
                (or add a placeholder member).
              </p>
            )}
          </Card>

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
                    {categoryMeta(e.category).label} · {memberName(e.payers[0]?.memberId ?? "")}
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
          <ExpensesTab
            expenses={d.expenses}
            members={d.members}
            meUserId={d.user.id}
            groupName={d.groupName}
            onOpen={setViewing}
          />
        </div>
      )}

      {tab === "list" && (
        <div style={{ marginBottom: 90 }}>
          <ListTab
            repo={d.repo}
            groupId={d.groupId}
            groupName={d.groupName}
            live={d.mode === "supabase"}
          />
        </div>
      )}

      {tab === "reports" && (
        <div style={{ marginBottom: 90 }}>
          <ReportsTab
            groupName={d.groupName}
            expenses={d.expenses}
            settlements={d.settlements}
            members={d.members}
            meUserId={d.user.id}
          />
        </div>
      )}

      {tab === "splitty" && <SplittyTab repo={d.repo} demo={d.mode === "demo"} />}

      {tab !== "splitty" && (
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
      )}

      <TabBar active={tab} onChange={setTab} />

      {viewing && (
        <ExpenseDetail
          expense={viewing}
          members={d.members}
          meUserId={d.user.id}
          repo={d.repo}
          onReceiptChanged={() => void load()}
          onBack={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setSheet("add");
          }}
          onDelete={() => handleDelete(viewing)}
        />
      )}

      <AddExpenseSheet
        // The sheet seeds participants, payer and split method from props via
        // useState initializers, which run once — so it MUST remount whenever
        // the Tally changes. `groupId` belongs in this key even though
        // `defaultSplitMethod` is here: two Tallies usually share a default
        // (every one starts on "equal"), which made the key identical across a
        // switch. React then kept the old instance, leaving `parts`/`payerId`
        // holding the previous Tally's member ids while `members` updated — so
        // the share rows (rendered as members ∩ parts) vanished, and saving
        // sent foreign ids that the database correctly rejected (BUG-002).
        key={`${editing?.id ?? "new"}:${d.groupId}:${activeGroup?.defaultSplitMethod ?? "equal"}`}
        open={sheet === "add"}
        onClose={() => {
          setSheet("none");
          setEditing(null);
        }}
        onSaved={async () => {
          const wasEdit = Boolean(editing);
          setSheet("none");
          setEditing(null);
          await load();
          showToast(wasEdit ? "Expense updated" : "Expense added");
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        defaultSplitMethod={activeGroup?.defaultSplitMethod ?? "equal"}
        rates={d.rates}
        recentCurrencies={d.recentCurrencies}
        onCurrencyUsed={async (code) => {
          const next = pushRecentCurrency(d.recentCurrencies, code);
          // Only write when the order actually moves — most saves are in the
          // currency that's already at the head.
          if (next.join(",") === d.recentCurrencies.join(",")) return;
          setData((prev) => (prev ? { ...prev, recentCurrencies: next } : prev));
          await d.repo
            .updateProfile({ userId: d.user.id, recentCurrencies: next })
            .catch(() => {});
        }}
        editing={editing}
      />
      {/*
        Gated on `activeGroup`, NOT on the Tally being managed. That wrapper
        condition has to stay stable while this sheet opens and closes: when it
        was `{managingGroup && ...}`, closing both unmounted the sheet and
        opened another one in the same commit, and React kept the closed
        sheet's DOM — two scrims stacked with no way out (Josh, 2026-08-04).
        Every other sheet here is always mounted and driven purely by `open`;
        this one now matches.
      */}
      {activeGroup && (
        <ManageTallySheet
          // No `key` here on purpose. It used to remount the sheet per Tally,
          // but a keyed child inside a conditional sibling stopped React
          // re-rendering this subtree on close, leaving its DOM on screen with
          // a dead Cancel button. The sheet now clears its own state when it
          // opens instead, which is what the key was really for.
          open={sheet === "manageTally" && Boolean(managingGroup)}
          // Closing only changes WHICH sheet is open. It must not also clear
          // managingGroupId: doing both in one commit unmounted this sheet and
          // opened another simultaneously, and React left the old sheet's DOM
          // behind — two scrims stacked, and no way out of the screen. The id
          // is harmless once `open` is false, and is overwritten next time a
          // Tally is managed.
          onClose={() => setSheet("spaces")} // back to the switcher we came from
          onChanged={async (msg, close) => {
            if (close) {
              // Deleted or left it — there's nothing to go back to.
              setSheet("none");
              setViewing(null);
            }
            await load();
            showToast(msg);
          }}
          repo={d.repo}
          group={managingGroup ?? activeGroup}
          groupCount={d.groups.length}
          meUserId={d.user.id}
        />
      )}
      <SpacesSheet
        open={sheet === "spaces"}
        onClose={() => setSheet("none")}
        onChanged={async (msg, close) => {
          if (close) {
            setSheet("none");
            setViewing(null);
          }
          await load();
          showToast(msg);
        }}
        onManage={(g) => {
          setManagingGroupId(g.id);
          setSheet("manageTally");
        }}
        repo={d.repo}
        groups={d.groups}
        activeGroupId={d.groupId}
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
        onManageSpaces={() => setSheet("spaces")}
        onManageRecurring={() => {
          setSheet("none");
          setRecurringOpen(true);
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

      <ActivityOverlay
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        onOpenExpense={(e) => {
          setActivityOpen(false);
          setViewing(e);
        }}
        repo={d.repo}
        groupId={d.groupId}
        members={d.members}
        meUserId={d.user.id}
        expenses={d.expenses}
      />
      <RecurringOverlay
        // Same reason as the Add-expense sheet: the new-rule form seeds
        // `payerId` from `members` via a useState initializer and never
        // remounts on its own, so after a Tally switch it would pair a stale
        // payer with the new Tally's participants.
        key={d.groupId}
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
