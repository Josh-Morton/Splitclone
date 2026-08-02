"use client";

/**
 * Manage this Tally (Phase 12) — everything about the *currently active*
 * Tally in one screen, opened by tapping the Tally name in the header:
 *
 *   • Rename (owner only)
 *   • Default split method (owner only; pre-selects in Add expense)
 *   • Members: list, remove (owner only), add a placeholder, invite by code
 *   • Delete this Tally (owner) / Leave this Tally (non-owner)
 *
 * Replaces the old split between the header's Spaces switcher and a separate
 * "Invite" button — two entry points for what is really one concept. Moving
 * *between* Tallies now lives in SpacesSheet (Settings → Tallies).
 *
 * Permissions and guards are unchanged from the components this merges:
 * removing/leaving still requires a zero balance (enforced server-side), and
 * you still can't delete or leave your last remaining Tally.
 */

import { useCallback, useEffect, useState } from "react";
import type { Repo } from "@/lib/data";
import type { Group, GroupMember, SupportedSplitMethod } from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Pill, Sheet } from "./sheet";

const SPLIT_LABELS: [SupportedSplitMethod, string][] = [
  ["equal", "Equal"],
  ["exact", "Exact"],
  ["salary", "Proportional"],
];

export function ManageTallySheet({
  open,
  onClose,
  onChanged,
  repo,
  group,
  groupCount,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  /** Reload after a change; `close` shuts the sheet (delete/leave). */
  onChanged: (message: string, close: boolean) => void;
  repo: Repo;
  group: Group;
  /** How many Tallies the user belongs to — you can't leave/delete your last. */
  groupCount: number;
  meUserId: string;
}) {
  // Members are loaded here rather than passed in: this sheet can manage ANY
  // Tally, including one that isn't currently active, and the caller only has
  // the active Tally's members to hand. Deriving `iAmOwner` from the wrong
  // Tally's membership would silently show the wrong permissions.
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [renameValue, setRenameValue] = useState(group.name);
  const [newName, setNewName] = useState("");
  const [forMemberId, setForMemberId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      setMembers(await repo.listMembers(group.id));
    } catch {
      setMembers([]);
    }
  }, [repo, group.id]);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(loadMembers);
  }, [open, loadMembers]);

  const placeholders = members.filter((m) => !m.userId);
  const iAmOwner = members.find((m) => m.userId === meUserId)?.role === "owner";
  const memberName = (m: GroupMember) =>
    m.userId === meUserId ? "You" : m.profileName || m.placeholderName || "Member";

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const rename = () => {
    if (!renameValue.trim()) return setError("Give the Tally a name");
    return guarded(async () => {
      await repo.renameGroup(group.id, renameValue.trim());
      onChanged("Tally renamed", false);
    });
  };

  const pickSplit = (method: SupportedSplitMethod) =>
    guarded(async () => {
      await repo.setDefaultSplitMethod(group.id, method);
      onChanged("Default split updated", false);
    });

  const removeMember = (m: GroupMember) =>
    guarded(async () => {
      const removedUserId = await repo.removeMember(m.id);
      if (removedUserId) await repo.notifyRemoved(removedUserId, group.id);
      setConfirmRemoveId(null);
      await loadMembers();
      onChanged(`Removed ${memberName(m)}`, false);
    });

  const addPlaceholder = () => {
    if (!newName.trim()) return;
    return guarded(async () => {
      await repo.addPlaceholderMember(group.id, newName.trim());
      setNewName("");
      await loadMembers();
      onChanged("Member added", false);
    });
  };

  const createInvite = () =>
    guarded(async () => {
      setCopied(false);
      const { code } = await repo.createInvite(group.id, forMemberId);
      setCode(code);
    });

  const deleteTally = () => {
    if (groupCount <= 1) {
      setError("You need at least one Tally — create another first.");
      return;
    }
    return guarded(async () => {
      await repo.deleteGroup(group.id);
      onChanged(`Deleted "${group.name}"`, true);
    });
  };

  const leaveTally = () => {
    if (groupCount <= 1) {
      setError("You need at least one Tally — join or create another first.");
      return;
    }
    return guarded(async () => {
      await repo.leaveGroup(group.id);
      onChanged(`Left "${group.name}"`, true);
    });
  };

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : "";
  // The share payload carries everything the recipient needs — they should
  // never be asked for something they weren't sent (Phase 6 comms rework).
  const shareMessage = link
    ? `Join "${group.name}" on Tally — our shared expenses app.\n\n` +
      `1. Tap this link: ${link}\n` +
      `2. Create an account (email + password) — or log in if you already have one\n` +
      `3. You'll land straight in our Tally.\n\n` +
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
    <Sheet open={open} onClose={onClose} title={group.name}>
      {iAmOwner && (
        <>
          <Label>Tally name</Label>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input value={renameValue} onChange={setRenameValue} onEnter={rename} />
            </div>
            <Button variant="secondary" style={{ width: 84 }} disabled={busy} onClick={rename}>
              Save
            </Button>
          </div>

          <div style={{ height: 20 }} />
          <Label>Default split</Label>
          <div
            style={{
              display: "flex",
              background: "var(--s2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-input)",
              padding: 4,
              gap: 4,
            }}
          >
            {SPLIT_LABELS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => pickSplit(k)}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: group.defaultSplitMethod === k ? "var(--primary)" : "transparent",
                  color: group.defaultSplitMethod === k ? "#fff" : "var(--muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
            Pre-selected when anyone adds an expense here — they can still change it. Proportional
            splits equally until everyone has a salary set.
          </p>

          <div style={{ height: 22 }} />
        </>
      )}

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
                  {busy ? "Removing…" : "Remove from Tally"}
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
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 8px" }}>Who is this invite for?</p>
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
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 14px", wordBreak: "break-all" }}>
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
            (or logs in), and lands in this Tally.
          </p>
        </div>
      )}

      <div style={{ height: 26 }} />
      {!confirmDanger ? (
        <button
          onClick={() => setConfirmDanger(true)}
          style={{
            background: "none",
            border: "none",
            color: "var(--red)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {iAmOwner ? "Delete this Tally" : "Leave this Tally"}
        </button>
      ) : (
        <div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            {iAmOwner ? (
              <>
                Delete &quot;{group.name}&quot; and everything in it? This can&apos;t be undone.
              </>
            ) : (
              <>
                Leave &quot;{group.name}&quot;? You&apos;ll lose access to its expenses. The owner can
                invite you back later. (You must be settled up first.)
              </>
            )}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setConfirmDanger(false)}>
              {iAmOwner ? "Keep it" : "Stay"}
            </Button>
            <button
              onClick={iAmOwner ? deleteTally : leaveTally}
              disabled={busy}
              style={{
                flex: 1,
                background: "var(--redbg)",
                border: "1px solid var(--red)",
                borderRadius: "var(--r-input)",
                color: "var(--red)",
                fontSize: 14,
                fontWeight: 700,
                padding: "12px 0",
                cursor: "pointer",
              }}
            >
              {iAmOwner ? "Delete" : "Leave"}
            </button>
          </div>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
