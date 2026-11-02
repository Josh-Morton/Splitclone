import type { Metadata } from "next";
import { splittyMetadata } from "@/lib/splitty-metadata";

/**
 * Guests usually arrive on a bill link, not on /splitty, so /split/<code> needs
 * the same identity: saving it gives the Splitty app, not Tally. The bill page
 * is a client component, which is why this lives in a layout.
 */
export const metadata: Metadata = splittyMetadata;

export default function SplitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
