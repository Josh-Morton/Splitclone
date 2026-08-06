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
  title: "Tally",
  description: "Shared expenses for your home — always know who owes whom.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png?v=2",
  },
  appleWebApp: {
    capable: true,
    // Light theme: dark status-bar glyphs read better over the warm bg.
    statusBarStyle: "default",
    title: "Tally",
  },
};

export const viewport: Viewport = {
  // Matches --bg. Kept in sync with manifest.webmanifest by hand — if the
  // palette moves, both need to move (Phase 11).
  themeColor: "#FFF7EF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
