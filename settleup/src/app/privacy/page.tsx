/**
 * Privacy & terms (backlog: "Privacy policy / terms page").
 *
 * Plain language, and every statement here is checked against the code and the
 * live project settings as of the "last updated" date — not aspirational. If
 * something below stops being true (a new processor, a new kind of data), this
 * page must change in the same commit. In particular:
 *
 *  - Phase 18 §2 (corrections learned across households) introduces the first
 *    table shared between unrelated Tallies. When it ships, add it here.
 *  - Resend (`notify-removed`) is wired but inactive — no RESEND_API_KEY is set.
 *    If it's switched on, add it to "Who processes it".
 *
 * A static server component: no session needed, so it's readable signed out.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy & terms · Tally",
};

/**
 * Where account-deletion requests go. Deliberately null until Josh chooses an
 * address — publishing someone's email on a public page isn't a default to
 * guess at. While null, the page gives the honest fallback instead.
 */
const PRIVACY_CONTACT_EMAIL: string | null = null;

const LAST_UPDATED = "21 October 2026";

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "max(env(safe-area-inset-top), 28px) 22px 56px",
        color: "var(--ink)",
        lineHeight: 1.6,
        fontSize: 15,
      }}
    >
      <Link href="/" style={{ color: "var(--primary)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
        ‹ Back to Tally
      </Link>
      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.6px", margin: "16px 0 4px" }}>
        Privacy &amp; terms
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>Last updated {LAST_UPDATED}</p>

      <Section title="The short version">
        <ul style={list}>
          <li>Tally keeps what your Tally needs to work — expenses, balances, the shopping list — and nothing more.</li>
          <li>Your salary is private unless you choose to share it with your Tally.</li>
          <li>No ads, no analytics, no tracking. Your data isn’t sold or passed on for marketing.</li>
        </ul>
      </Section>

      <Section title="What's stored">
        <ul style={list}>
          <li>
            <b>Your account:</b> your email address and display name. If you set a password, it’s stored
            hashed by our sign-in provider — nobody can read it.
          </li>
          <li>
            <b>Profile photo:</b> only if you add one. It’s shown to the people in your Tallies, cropped to a
            square in your browser before it’s uploaded. It’s stored at an unguessable web address — anyone who’s
            given that link could open it — so treat it like a profile picture, not like your salary.
          </li>
          <li>
            <b>Your Tallies:</b> the Tallies you belong to and their members (including people added by name who
            don’t use the app), expenses (what, how much, when, category, who paid, how it was split, any
            note, and the original currency and rate for foreign expenses), settlements, recurring bills and
            shopping-list items.
          </li>
          <li>
            <b>Salary:</b> only if you enter it, and private by default. If your Tally splits proportionally,
            your share is worked out on the server without showing your salary to anyone. Other members see it
            only if you switch on sharing it with your Tally.
          </li>
          <li>
            <b>Receipt photos you attach to an expense:</b> stored privately, visible only to that Tally’s
            members.
          </li>
          <li>
            <b>Notifications:</b> if you turn them on, a subscription for your device so Tally can send them.
          </li>
          <li>
            <b>Splitty:</b> guests give a display name and choose their items — no account. A token saved in
            their browser lets them come back to the same bill.
          </li>
        </ul>
      </Section>

      <Section title="Who processes it">
        <ul style={list}>
          <li>
            <b>Supabase</b> — the database and sign-in. Your data is hosted in the EU (Ireland).
          </li>
          <li>
            <b>Vercel</b> — serves the app to your device.
          </li>
          <li>
            <b>Google (Gemini)</b> — when you scan a receipt, the photo is sent to Google’s Gemini service to
            read the items. Tally doesn’t keep the scanned photo; Google handles it under its own terms.
          </li>
          <li>
            <b>Your browser’s push service</b> (Apple, Google or Mozilla) — delivers notifications if
            you’ve turned them on. Their contents are encrypted on the way.
          </li>
          <li>
            Exchange rates come from <b>open.er-api.com</b>. No information about you is sent to it.
          </li>
        </ul>
      </Section>

      <Section title="Who can see what">
        <ul style={list}>
          <li>
            Members of a Tally see that Tally’s expenses, balances, list and each other’s names — not your
            other Tallies.
          </li>
          <li>Anyone with a Splitty link can see that bill’s items and who claimed what.</li>
        </ul>
      </Section>

      <Section title="Deleting things">
        <ul style={list}>
          <li>
            <b>Expenses:</b> delete any expense at any time. There’s a short window to undo it.
          </li>
          <li>
            <b>Tallies:</b> from <i>Manage this Tally</i>, leave a Tally once you’re settled up, or delete one
            you created.
          </li>
          <li>
            <b>Your profile photo:</b> remove it any time in Settings — the file is deleted, not just hidden.
          </li>
          <li>
            <b>Your account:</b>{" "}
            {PRIVACY_CONTACT_EMAIL ? (
              <>
                email <b>{PRIVACY_CONTACT_EMAIL}</b> and it will be removed, along with your name and salary.
              </>
            ) : (
              <>
                deleting your whole account isn’t a button in the app yet. Until it is, the app’s owner
                does it on request — ask whoever invited you to your Tally to pass it on.
              </>
            )}
          </li>
        </ul>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          A Tally is a shared record, so expenses you added stay in its history after you leave — otherwise
          everyone else’s balances would stop adding up.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under South Africa’s Protection of Personal Information Act (POPIA) you can ask what’s held about
          you, have it corrected, or have it deleted, using the routes above.
        </p>
      </Section>

      <Section title="Terms">
        <ul style={list}>
          <li>
            Tally helps you keep track of shared costs. It doesn’t move money and isn’t financial advice —
            settle up however you normally do.
          </li>
          <li>
            The maths is exact to the cent, but you’re responsible for what you enter. Check figures that
            matter.
          </li>
          <li>
            Tally is free and provided as-is. Features may change. The date at the top of this page shows when
            it last changed.
          </li>
        </ul>
      </Section>
    </main>
  );
}

const list = { paddingLeft: 20, display: "grid", gap: 8, margin: 0 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}
