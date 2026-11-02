import type { Metadata } from "next";
import { splittyMetadata } from "@/lib/splitty-metadata";

/**
 * The saved "Loving Splitty?" link (Phase 21) is often previewed in WhatsApp
 * and saved to home screens, so it gets Splitty's identity rather than Tally's.
 */
export const metadata: Metadata = splittyMetadata;

export default function SplittyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
