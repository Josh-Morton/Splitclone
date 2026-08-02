"use client";

/**
 * Tally switcher (Phase 12): every Tally the user belongs to, with an active
 * check; tap to switch (persists as default). Create a new Tally or join one
 * by code.
 *
 * Managing a Tally (rename, members, default split method, delete/leave) lives
 * in ManageTallySheet, reached by tapping the Tally name in the header — this
 * sheet is purely for moving between them. Opened from Settings → Tallies.
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
  onManage,
  repo,
  groups,
  activeGroupId,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  /** Reload after a change; every action here closes the sheet. */
  onChanged: (message: string, close: boolean) => void;
  /** Open full management for a Tally — not necessarily the active one. */
  onManage: (group: Group) => void;
  repo: Repo;
  groups: Group[];
  activeGroupId: string;
  meUserId: string;
}) {
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setMode("list");
    setName("");
    setCode("");
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
    if (!name.trim()) return setError("Give the Tally a name");
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

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Your Tallies"
    >
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        A Tally is a household, trip, or shared budget. Everything — expenses, balances, the list —
        belongs to the Tally you&apos;re in. Tap one to switch to it, or tap ⋯ to rename it, manage
        members and change its split method.
      </p>

      {groups.map((g) => {
        const active = g.id === activeGroupId;
        return (
          <div
            key={g.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 8,
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
                padding: "12px 4px 12px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
              }}
            >
              <span style={{ fontSize: 18 }}>🏠</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{g.name}</span>
              {active && <span style={{ color: "var(--primary)", fontWeight: 800, fontSize: 15 }}>✓</span>}
            </button>
            <button
              onClick={() => onManage(g)}
              disabled={busy}
              aria-label={`Manage ${g.name}`}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 18,
                fontWeight: 800,
                cursor: "pointer",
                padding: "12px 14px",
                lineHeight: 1,
              }}
            >
              ⋯
            </button>
          </div>
        );
      })}

      <div style={{ height: 8 }} />
      {mode === "list" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => setMode("create")}>
            + Create a Tally
          </Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => setMode("join")}>
            Join with a code
          </Button>
        </div>
      )}

      {mode === "create" && (
        <>
          <Label>New Tally name</Label>
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
