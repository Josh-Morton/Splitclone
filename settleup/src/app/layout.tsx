import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

/**
 * Self-hosted by next/font at build time — no CDN request, no layout shift
 * from a late webfont swap (ADR-0016). Exposed as a CSS variable so
 * globals.css owns the actual font-family stack.
 */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tally-ho.co.za"),
  title: "Tally",
  description: "Shared expenses for your home — always know who owes whom.",
  manifest: "/manifest.webmanifest",
  // /favicon.ico is deliberately in public/, not src/app/: Next.js adds an
  // app/favicon.ico to every route, which would put Tally's icon on Splitty's.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icons/tally-icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png?v=3",
  },
  // The opaque icon: link previews paint transparent pixels black or white.
  openGraph: {
    title: "Tally",
    description: "Shared expenses for your home — always know who owes whom.",
    images: [{ url: "/icons/icon-maskable-512.png", width: 512, height: 512, alt: "Tally" }],
  },
  appleWebApp: {
    capable: true,
    // Light theme: dark status-bar glyphs read better over the warm bg.
    statusBarStyle: "default",
    title: "Tally",
  },
};

export const viewport: Viewport = {
  // Matches --bg. Kept in sync with Tally's and Splitty's manifests by hand —
  // if the palette moves, all three need to move (Phase 11).
  themeColor: "#FFF7EF",
  width: "device-width",
  initialScale: 1,
  // No maximumScale: capping it at 1 blocked pinch-zoom on Android, which
  // fails WCAG 1.4.4 for anyone who needs to enlarge text. It was there to
  // stop iOS zooming into small inputs on focus — every text field is now
  // ≥16px, which is what actually prevents that.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme selects the LAYER 1 palette block in globals.css. Set here
    // rather than in JS so the first paint is already themed; swapping it is
    // all a future theme would need.
    <html lang="en" data-theme="wave" className={nunito.variable}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
