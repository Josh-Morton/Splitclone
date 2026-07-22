"use client";

/**
 * Spaces manager (Phase 6 + Tally polish): every space the user belongs to with
 * an active check; tap to switch (persists as default). Manage a space inline —
 * rename or delete (with guards: at least one space must remain; deleting the
 * active space switches to another first). Create a new space or join by code.
 * Opened from the header ▾ and from Settings → Manage spaces.
 */

import { useState } from "react";
import type { Repo } from "@/lib/data";
import type { Group } from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Sheet } from "./sheet";

export function SpacesSheet({
  open,
  onClose,
  onChanged,
  repo,
  groups,
  activeGroupId,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  /** Reload after a change; close the sheet only for switch/create/join. */
  onChanged: (message: string, close: boolean) => void;
  repo: Repo;
  groups: Group[];
  activeGroupId: string;
  meUserId: string;
}) {
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [manageId, setManageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setMode("list");
    setName("");
    setCode("");
    setManageId(null);
    setConfirmDelete(false);
    setError("");
  }

  const setDefault = (groupId: string) => repo.updateProfile({ userId: meUserId, defaultGroupId: groupId });

  async function run(fn: () => Promise<{ message: string; close: boolean }>) {
    setBusy(true);
    setError("");
    try {
      const { message, close } = await fn();
      reset();
      onChanged(message, close);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (g: Group) =>
    g.id === activeGroupId
      ? onClose()
      : run(async () => {
          await setDefault(g.id);
          return { message: `Switched to ${g.name}`, close: true };
        });

  const createSpace = () => {
    if (!name.trim()) return setError("Give the space a name");
    return run(async () => {
      const g = await repo.createGroup(name.trim());
      await setDefault(g.id);
      return { message: `Switched to ${g.name}`, close: true };
    });
  };

  const joinSpace = () => {
    if (!code.trim()) return setError("Enter the invite code");
    return run(async () => {
      const { groupId, groupName } = await repo.redeemInvite(code.trim());
      await setDefault(groupId);
      return { message: `Joined ${groupName}`, close: true };
    });
  };

  const renameSpace = (g: Group) => {
    if (!renameValue.trim()) return setError("Give the space a name");
    return run(async () => {
      await repo.renameGroup(g.id, renameValue.trim());
      return { message: "Space renamed", close: false };
    });
  };

  const deleteSpace = (g: Group) => {
    if (groups.length <= 1) {
      setError("You need at least one space — create another first.");
      return;
    }
    return run(async () => {
      // If deleting the active space, switch to any other one first.
      if (g.id === activeGroupId) {
        const other = groups.find((x) => x.id !== g.id)!;
        await setDefault(other.id);
      }
      await repo.deleteGroup(g.id);
      return { message: `Deleted "${g.name}"`, close: false };
    });
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Spaces"
    >
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        A space is a household, trip, or shared budget. Everything — expenses, balances, the list —
        belongs to the space you&apos;re in. Tap to switch; tap ⋯ to rename or delete.
      </p>

      {groups.map((g) => {
        const active = g.id === activeGroupId;
        const managing = manageId === g.id;
        return (
          <div key={g.id} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: "var(--r-card)",
                background: active ? "var(--bluebg)" : "var(--surface)",
                border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
              }}
            >
              <button
                onClick={() => switchTo(g)}
                disabled={busy}
                aria-label={`Switch to ${g.name}`}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--ink)",
                }}
              >
                <span style={{ fontSize: 18 }}>🏠</span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{g.name}</span>
                {active && <span style={{ color: "var(--primary)", fontWeight: 800, fontSize: 15 }}>✓</span>}
              </button>
              <button
                onClick={() => {
                  setManageId(managing ? null : g.id);
                  setRenameValue(g.name);
                  setConfirmDelete(false);
                }}
                aria-label={`Manage ${g.name}`}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 18,
                  fontWeight: 800,
                  cursor: "pointer",
                  padding: "0 6px",
                }}
              >
                ⋯
              </button>
            </div>

            {managing && (
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderTop: "none",
                  borderRadius: "0 0 var(--r-card) var(--r-card)",
                  margin: "-4px 8px 0",
                  padding: "12px 14px 14px",
                  background: "var(--s2)",
                }}
              >
                <Label>Rename</Label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Input value={renameValue} onChange={setRenameValue} onEnter={() => renameSpace(g)} />
                  </div>
                  <Button variant="secondary" style={{ width: 84 }} disabled={busy} onClick={() => renameSpace(g)}>
                    Save
                  </Button>
                </div>
                <div style={{ height: 12 }} />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--red)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Delete this space
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
                      Delete &quot;{g.name}&quot; and everything in it? This can&apos;t be undone.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
                        Keep it
                      </Button>
                      <button
                        onClick={() => deleteSpace(g)}
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
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ height: 8 }} />
      {mode === "list" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => setMode("create")}>
            + Create a space
          </Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => setMode("join")}>
            Join with a code
          </Button>
        </div>
      )}

      {mode === "create" && (
        <>
          <Label>New space name</Label>
          <Input value={name} onChange={setName} placeholder="e.g. December trip" autoFocus onEnter={createSpace} />
          <div style={{ height: 10 }} />
          <Button onClick={createSpace} disabled={busy}>
            {busy ? "Creating…" : "Create & switch"}
          </Button>
          <Button variant="ghost" onClick={() => setMode("list")} style={{ marginTop: 6 }}>
            Back
          </Button>
        </>
      )}

      {mode === "join" && (
        <>
          <Label>Invite code</Label>
          <Input
            value={code}
            onChange={(v) => setCode(v.toUpperCase())}
            placeholder="e.g. SAM-4K2Q"
            center
            letterSpacing={2}
            autoFocus
            onEnter={joinSpace}
          />
          <div style={{ height: 10 }} />
          <Button onClick={joinSpace} disabled={busy}>
            {busy ? "Joining…" : "Join & switch"}
          </Button>
          <Button variant="ghost" onClick={() => setMode("list")} style={{ marginTop: 6 }}>
            Back
          </Button>
        </>
      )}

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
