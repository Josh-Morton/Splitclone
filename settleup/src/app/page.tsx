/**
 * Phase-0 shell: renders the demo household through the real pipeline
 * (Repo → domain maths → ZAR formatting → design tokens) to prove the
 * architecture end-to-end. The real Home screen (per the design handoff)
 * replaces this during epics E4–E5.
 */

import { getRepo } from "@/lib/data";
import {
  computeBalances,
  simplifyDebts,
  fmt,
  CATEGORY_META,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { repo, groupId } = await getRepo();
  const [members, expenses, settlements] = await Promise.all([
    repo.listMembers(groupId),
    repo.listExpenses(groupId),
    repo.listSettlements(groupId),
  ]);

  const user = await repo.getCurrentUser();
  const you = members.find((m) => m.userId === user?.id);
  const balances = computeBalances(members.map((m) => m.id), expenses, settlements);
  const tx = simplifyDebts(balances);

  const yourNet = you ? balances[you.id] : 0;
  const memberName = (id: string) => {
    const m = members.find((x) => x.id === id);
    if (!m) return "?";
    if (m.userId === user?.id) return "You";
    return m.placeholderName ?? "Member";
  };

  const heroText =
    yourNet === 0
      ? "You're all settled"
      : yourNet > 0
        ? `${memberName(tx[0]?.fromMemberId ?? "")} owes you`
        : `You owe ${memberName(tx[0]?.toMemberId ?? "")}`;
  const heroColor = yourNet === 0 ? "var(--muted)" : yourNet > 0 ? "var(--green)" : "var(--red)";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--shell-gradient)",
        padding: "32px 18px",
        maxWidth: 430,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.5px" }}>Apartment</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {members.length} members · demo household (Supabase not yet connected)
        </p>
      </header>

      <section
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-card)",
          padding: 22,
          marginBottom: 16,
          textAlign: "center",
        }}
      >
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
          {fmt(Math.abs(yourNet))}
        </p>
      </section>

      <section
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-card)",
          border: "1px solid var(--line)",
          padding: 14,
        }}
      >
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Recent activity</h2>
        {expenses.map((e) => (
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
                {CATEGORY_META[e.category].label} · {memberName(e.payers[0].memberId)} paid
              </p>
            </div>
            <p style={{ fontSize: 14.5, fontWeight: 700 }}>{fmt(e.amountCents)}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
