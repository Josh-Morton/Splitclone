"use client";

/**
 * Bottom tab bar (design: 4 tabs Home / Expenses / List / Reports, 10.5px/600
 * labels, inline SVG icons, gesture-bar spacing). List and Reports light up
 * in Phases 4–5; until then they open explanatory placeholders.
 */

export type Tab = "home" | "expenses" | "list" | "reports" | "splitty";

const ICONS: Record<Tab, string> = {
  // simple inline path glyphs, 24x24 viewBox
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  expenses: "M4 4h16v4H4zm0 6h16v4H4zm0 6h10v4H4z",
  list: "M4 5h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zM4 17h2v2H4zm4 0h12v2H8z",
  reports: "M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z",
  // two forks — a "split the bill" glyph
  splitty: "M7 2v6a3 3 0 0 0 2 2.8V22h2V10.8A3 3 0 0 0 13 8V2h-2v6H10V2H8v6H7V2zm10 0c-1.7 0-3 2-3 5s1 4 2 4.3V22h2V11.3c1-.3 2-1.3 2-4.3 0-3-1.3-5-3-5z",
};

const LABELS: Record<Tab, string> = {
  home: "Home",
  expenses: "Expenses",
  list: "List",
  reports: "Reports",
  splitty: "Splitty",
};

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        background: "var(--sheet)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        padding: "6px 8px calc(env(safe-area-inset-bottom) + 8px)",
        zIndex: 30,
      }}
    >
      {(Object.keys(LABELS) as Tab[]).map((t) => {
        const on = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            aria-label={`${LABELS[t]} tab`}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 0",
              color: on ? "var(--primary)" : "var(--faint)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={ICONS[t]} />
            </svg>
            <span style={{ fontSize: 10.5, fontWeight: 600 }}>{LABELS[t]}</span>
          </button>
        );
      })}
    </nav>
  );
}
