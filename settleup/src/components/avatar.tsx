"use client";

/**
 * Initials avatar in a colored circle (design: avatars are 50% radius with
 * the brand gradient for "you", stable per-member hues for others).
 */

import type { GroupMember } from "@/lib/domain";

const HUES = ["#6FD7AC", "#E9BF73", "#C9A6F4", "#F39DC0", "#74D2E0", "#A9ABF8"];

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
}: {
  member: GroupMember | undefined;
  meUserId: string;
  size?: number;
}) {
  const you = member?.userId === meUserId;
  const name = memberDisplayName(member, meUserId);
  const label = you ? "Me" : initials(name);
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
        fontWeight: 800,
        color: you ? "#fff" : "#0E1521",
        background: you ? "var(--brand-gradient)" : hueFor(member?.id ?? "?"),
      }}
    >
      {label}
    </div>
  );
}
