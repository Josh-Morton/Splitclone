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

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const placeholders = members.filter((m) => !m.userId);
  const iAmOwner = members.find((m) => m.userId === meUserId)?.role === "owner";
  const memberName = (m: GroupMember) =>
    m.userId === meUserId ? "You" : m.profileName || m.placeholderName || "Member";

  async function removeMember(m: GroupMember) {
    setBusy(true);
    setError("");
    try {
      const removedUserId = await repo.removeMember(m.id);
      if (removedUserId) await repo.notifyRemoved(removedUserId, groupId);
      setConfirmRemoveId(null);
      onMembersChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
    ? `Join "${groupName}" on Tally — our shared expenses app.\n\n` +
      `1. Tap this link: ${link}\n` +
      `2. Create an account (email + password) — or log in if you already have one\n` +
      `3. You'll land straight in our household.\n\n` +
      `(If you're ever asked for an invite code, it's ${code}.)`
    : "";

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  async function shareInvite() {
    try {
      await navigator.share({ title: "Join me on Tally", text: shareMessage });
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
      {members.map((m) => {
        const canRemove = iAmOwner && m.userId !== meUserId && m.role !== "owner";
        return (
          <div key={m.id} style={{ borderBottom: "1px solid var(--line)", padding: "9px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 14.5, fontWeight: 600 }}>{memberName(m)}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 700, textTransform: "capitalize" }}>
                  {m.userId ? m.role : "placeholder"}
                </span>
                {canRemove && confirmRemoveId !== m.id && (
                  <button
                    onClick={() => setConfirmRemoveId(m.id)}
                    aria-label={`Remove ${memberName(m)}`}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--red)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 2,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {canRemove && confirmRemoveId === m.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button variant="ghost" style={{ flex: 1, padding: "8px 0" }} onClick={() => setConfirmRemoveId(null)}>
                  Cancel
                </Button>
                <button
                  onClick={() => removeMember(m)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    background: "var(--redbg)",
                    border: "1px solid var(--red)",
                    borderRadius: "var(--r-input)",
                    color: "var(--red)",
                    fontSize: 13.5,
                    fontWeight: 700,
                    padding: "9px 0",
                    cursor: "pointer",
                  }}
                >
                  {busy ? "Removing…" : "Remove from space"}
                </button>
              </div>
            )}
          </div>
        );
      })}

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
            The message includes the link and what to do — your partner taps it, creates an account
            (or logs in), and lands in this household.
          </p>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
