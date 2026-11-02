import type { Metadata } from "next";

/**
 * The saved "Loving Splitty?" link (Phase 21) is often previewed in WhatsApp,
 * so it gets its own title and description rather than Tally's.
 */
export const metadata: Metadata = {
  title: "Splitty — split the bill",
  description: "Scan a restaurant or bar bill, share the link, and everyone picks what they had. No account needed.",
  openGraph: {
    title: "Splitty — split the bill",
    description: "Scan a restaurant or bar bill, share the link, and everyone picks what they had. No account needed.",
  },
};

export default function SplittyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
