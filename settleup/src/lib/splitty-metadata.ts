import type { Metadata } from "next";

const title = "Splitty — split the bill";
const description = "Scan a restaurant or bar bill, share the link, and everyone picks what they had. No account needed.";

/**
 * Splitty's own app identity (ADR-0023), shared by the /splitty and /split/*
 * layouts so saving either to a home screen gives the Splitty app, and link
 * previews in WhatsApp show Splitty rather than Tally. Every other route keeps
 * the root layout's Tally metadata.
 *
 * Next.js merges metadata shallowly: each of these fields replaces the root
 * layout's whole, so everything Splitty needs is restated here.
 */
export const splittyMetadata: Metadata = {
  title,
  description,
  manifest: "/icons/splitty/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/splitty/splitty-icon.svg", type: "image/svg+xml" },
      { url: "/icons/splitty/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/splitty/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/icons/splitty/favicon.ico",
    apple: "/icons/splitty/apple-touch-icon.png",
  },
  // The opaque icon: link previews paint transparent pixels black or white.
  openGraph: {
    title,
    description,
    images: [{ url: "/icons/splitty/icon-maskable-512.png", width: 512, height: 512, alt: "Splitty" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Splitty",
  },
};
