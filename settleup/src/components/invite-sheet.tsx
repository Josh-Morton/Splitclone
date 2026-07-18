"use client";

/**
 * Members & invite bottom sheet (E3, basic cut of the design's Settings
 * members section + Invite screen): member list, add a placeholder member
 * (someone without the app), and a shareable invite code + link. If the
 * invite is for a placeholder, redeeming transfers their history.
 */

import { useState } from "react";
import type { Repo } from "@/lib/data";
import type { GroupMember } from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

export function InviteSheet({
  open,
  onClose,
  onMembersChanged,
  repo,
  groupId,
  groupName,
  members,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  onMembersChanged: () => void;
  repo: Repo;
  groupId: string;
  groupName: string;
  members: GroupMember[];
  meUserId: string;
}) {
  const [newName, setNewName] = useState("");
  const [forMemberId, setForMemberId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const placeholders = members.filter((m) => !m.userId);
  const memberName = (m: GroupMember) =>
    m.userId === meUserId ? "You" : m.profileName || m.placeholderName || "Member";

  async function addPlaceholder() {
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await repo.addPlaceholderMember(groupId, newName.trim());
      setNewName("");
      onMembersChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const { code } = await repo.createInvite(groupId, forMemberId);
      setCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : "";
  // The share payload carries everything the recipient needs — they should
  // never be asked for something they weren't sent (Phase 6 comms rework).
  const shareMessage = link
    ? `Join "${groupName}" on SettleUp — our shared expenses app.\n\n` +
      `1. Tap this link: ${link}\n` +
      `2. Sign in with your email address\n` +
      `3. Open the sign-in email and tap the link in it — that's it, you're in.\n\n` +
      `(No password needed. If you're asked for an invite code, it's ${code}.)`
    : "";

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  async function shareInvite() {
    try {
      await navigator.share({ title: "Join me on SettleUp", text: shareMessage });
    } catch {
      /* user dismissed the share sheet — not an error */
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
    } catch {
      setError("Couldn't copy — long-press the link instead");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Members & invite">
      <Label>Members</Label>
      {members.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "9px 0",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <p style={{ fontSize: 14.5, fontWeight: 600 }}>{memberName(m)}</p>
          <p style={{ fontSize: 12, color: "var(--faint)", fontWeight: 700, textTransform: "capitalize" }}>
            {m.userId ? m.role : "placeholder"}
          </p>
        </div>
      ))}

      <div style={{ height: 16 }} />
      <Label>Add a member (no app needed)</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input value={newName} onChange={setNewName} placeholder="e.g. Sam" onEnter={addPlaceholder} />
        </div>
        <Button variant="secondary" onClick={addPlaceholder} disabled={busy || !newName.trim()} style={{ width: 84 }}>
          Add
        </Button>
      </div>
      <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>
        You can split expenses with them right away; invite them later to take over their history.
      </p>

      <div style={{ height: 20 }} />
      <Label>Invite someone</Label>
      {placeholders.length > 0 && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 8px" }}>
            Who is this invite for?
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {placeholders.map((m) => (
              <Pill
                key={m.id}
                active={forMemberId === m.id}
                onClick={() => setForMemberId(forMemberId === m.id ? null : m.id)}
              >
                {m.placeholderName}
              </Pill>
            ))}
            <Pill active={forMemberId === null} onClick={() => setForMemberId(null)}>
              New member
            </Pill>
          </div>
        </>
      )}
      {!code ? (
        <Button onClick={createInvite} disabled={busy}>
          {busy ? "Creating…" : "Create invite code"}
        </Button>
      ) : (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line2)",
            borderRadius: "var(--r-card)",
            padding: 18,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "4px" }}>{code}</p>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              margin: "8px 0 14px",
              wordBreak: "break-all",
            }}
          >
            {link}
          </p>
          {canNativeShare && (
            <>
              <Button onClick={shareInvite}>Share invite…</Button>
              <div style={{ height: 8 }} />
            </>
          )}
          <Button variant="secondary" onClick={copyMessage}>
            {copied ? "Copied ✓" : "Copy invite message"}
          </Button>
          <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>
            The message includes the link and exactly what to do — your partner taps it, signs in
            with their email, taps the sign-in link, and lands in this household.
          </p>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
