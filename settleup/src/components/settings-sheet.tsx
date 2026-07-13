"use client";

/**
 * Settings bottom sheet (Phase-3 basic cut of the design's Settings screen):
 * editable display name and monthly salary (private; powers proportional
 * splits), salary-visibility opt-in, sign out. Full-screen Settings with
 * members/preferences arrives with the fidelity pass (see ROADMAP backlog).
 */

import { useEffect, useState } from "react";
import type { Repo } from "@/lib/data";
import { fmt, parseCents, type User } from "@/lib/domain";
import { Button, ErrorText, Input, Label } from "./ui";
import { Sheet } from "./sheet";

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function SettingsSheet({
  open,
  onClose,
  onSaved,
  onSignOut,
  repo,
  user,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onSignOut: () => void;
  repo: Repo;
  user: User;
}) {
  const [name, setName] = useState(user.displayName);
  const [salary, setSalary] = useState("");
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void repo.getProfile(user.id).then((p) => {
      if (cancelled) return;
      setSalary(p?.monthlySalaryCents ? centsToInput(p.monthlySalaryCents) : "");
      setSalaryVisible(p?.salaryVisible ?? false);
      setName(user.displayName);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, repo, user.id, user.displayName]);

  async function save() {
    if (!name.trim()) {
      setError("Display name can't be empty");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cents = parseCents(salary);
      await repo.updateProfile({
        userId: user.id,
        displayName: name.trim(),
        monthlySalaryCents: salary.trim() === "" ? null : cents,
        salaryVisible,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      {!loaded ? null : (
        <>
          <Label>Display name</Label>
          <Input value={name} onChange={setName} placeholder="Your name" />

          <div style={{ height: 16 }} />
          <Label>Monthly net salary (private)</Label>
          <Input value={salary} onChange={setSalary} placeholder="0,00" inputMode="decimal" prefix="R" />
          {parseCents(salary) > 0 && (
            <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>
              = {fmt(parseCents(salary))} — powers proportional splits. Your partner only ever
              sees the split amounts, never this figure.
            </p>
          )}

          <div style={{ height: 16 }} />
          <button
            onClick={() => setSalaryVisible((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--s2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-input)",
              padding: "13px 16px",
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, textAlign: "left" }}>
              Let the household see my salary figure
            </span>
            <span
              aria-checked={salaryVisible}
              role="switch"
              style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                background: salaryVisible ? "var(--primary)" : "var(--s3)",
                position: "relative",
                flexShrink: 0,
                transition: "background .16s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: salaryVisible ? 20 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .16s",
                }}
              />
            </span>
          </button>
          <p style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
            Off by default. Proportional splits work either way — only the resulting shares are
            ever shown.
          </p>

          <div style={{ height: 18 }} />
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Sheet>
  );
}
