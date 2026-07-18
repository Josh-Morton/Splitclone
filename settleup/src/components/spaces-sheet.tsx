"use client";

/**
 * Spaces switcher bottom sheet (design "Spaces switcher" + Phase-6 household
 * management): every space the user belongs to with an active check; tapping
 * switches the whole app and persists as the default. Create a new space or
 * join one by invite code without leaving the sheet.
 */

import { useState } from "react";
import type { Repo } from "@/lib/data";
import type { Group } from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Sheet } from "./sheet";

export function SpacesSheet({
  open,
  onClose,
  onSwitched,
  repo,
  groups,
  activeGroupId,
  meUserId,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after the default group changed (switch/create/join). */
  onSwitched: (groupName: string) => void;
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

  async function setDefault(groupId: string) {
    await repo.updateProfile({ userId: meUserId, defaultGroupId: groupId });
  }

  async function switchTo(g: Group) {
    if (g.id === activeGroupId) {
      onClose();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setDefault(g.id);
      reset();
      onSwitched(g.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createSpace() {
    if (!name.trim()) {
      setError("Give the space a name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const g = await repo.createGroup(name.trim());
      await setDefault(g.id);
      reset();
      onSwitched(g.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinSpace() {
    if (!code.trim()) {
      setError("Enter the invite code");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { groupId, groupName } = await repo.redeemInvite(code.trim());
      await setDefault(groupId);
      reset();
      onSwitched(groupName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        A space is a household, trip, or shared budget. Everything in the app — expenses,
        balances, the list — belongs to the space you&apos;re in.
      </p>

      {groups.map((g) => {
        const active = g.id === activeGroupId;
        return (
          <button
            key={g.id}
            onClick={() => switchTo(g)}
            disabled={busy}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              marginBottom: 8,
              borderRadius: "var(--r-card)",
              cursor: "pointer",
              textAlign: "left",
              background: active ? "var(--bluebg)" : "var(--surface)",
              border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
              color: "var(--ink)",
            }}
          >
            <span style={{ fontSize: 18 }}>🏠</span>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{g.name}</span>
            {active && (
              <span style={{ color: "var(--primary)", fontWeight: 800, fontSize: 15 }}>✓</span>
            )}
          </button>
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
