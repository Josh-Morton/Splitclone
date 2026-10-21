"use client";

/**
 * Avatar: the member's profile photo when they have one, otherwise initials in
 * a coloured circle (design: 50% radius, brand colour for "you", stable
 * per-member hues for others).
 *
 * Every avatar in the app goes through this component, so a photo shows up
 * everywhere at once — and if a photo URL ever fails to load (deleted, offline
 * and uncached), it quietly falls back to the initials rather than a broken
 * image.
 */

import { useState } from "react";
import type { GroupMember } from "@/lib/domain";

// Token references, not literals — avatars re-theme with the palette
// (Phase 11). The count must match the --avatar-N tokens in globals.css.
const HUES = [
  "var(--avatar-0)",
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
];

export function memberDisplayName(m: GroupMember | undefined, meUserId: string): string {
  if (!m) return "?";
  if (m.userId === meUserId) return "You";
  return m.profileName || m.placeholderName || "Member";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hueFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function Avatar({
  member,
  meUserId,
  size = 32,
  photoUrl,
  initialsFrom,
}: {
  member: GroupMember | undefined;
  meUserId: string;
  size?: number;
  /** Overrides the member's photo — e.g. the signed-in user's own, in Settings. */
  photoUrl?: string | null;
  /** Show these initials instead of "Me" for the signed-in user (the header). */
  initialsFrom?: string;
}) {
  const you = member?.userId === meUserId;
  const name = memberDisplayName(member, meUserId);
  const label = initialsFrom ? initials(initialsFrom) : you ? "Me" : initials(name);
  const url = photoUrl !== undefined ? photoUrl : (member?.profileAvatarUrl ?? null);
  // Keyed on the URL, so a new photo gets a fresh chance to load.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && failedUrl !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, sized by us
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailedUrl(url)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
          background: "var(--s2)",
        }}
      />
    );
  }
  return (
    <div
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.34,
        fontWeight: "var(--w-heavy)" as unknown as number,
        color: "var(--on-avatar)",
        background: you ? "var(--primary)" : hueFor(member?.id ?? "?"),
      }}
    >
      {label}
    </div>
  );
}
