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
    // A nested openGraph replaces the root one whole, so the image is restated.
    images: [{ url: "/icons/icon-maskable-512.png", width: 512, height: 512, alt: "Tally" }],
  },
};

export default function SplittyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
