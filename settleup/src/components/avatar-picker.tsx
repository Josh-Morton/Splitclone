"use client";

/**
 * Add / change / remove your profile photo (backlog: "Avatar photos").
 *
 * Shared by Settings and onboarding so there's one implementation of the
 * flow. The photo is centre-cropped to a square in the browser before upload
 * (see squareAvatar), so it's one tap with no cropping step, and the upload is
 * small. No `capture` attribute on the input: on a phone that would force the
 * camera, while `accept="image/*"` alone offers both the camera and the
 * photo library.
 */

import { useRef, useState } from "react";
import type { Repo } from "@/lib/data";
import { squareAvatar } from "@/lib/image";
import { Avatar } from "./avatar";

export function AvatarPicker({
  repo,
  userId,
  displayName,
  photoUrl,
  onChanged,
  size = 64,
}: {
  repo: Repo;
  userId: string;
  displayName: string;
  photoUrl: string | null;
  /** Called with the new URL (or null when removed) once saved. */
  onChanged: (url: string | null) => void;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await squareAvatar(file);
      onChanged(await repo.setAvatar(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that photo");
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failure.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await repo.removeAvatar();
      onChanged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the photo");
    } finally {
      setBusy(false);
    }
  }

  const linkStyle = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Avatar
        member={undefined}
        meUserId={userId}
        size={size}
        photoUrl={photoUrl}
        initialsFrom={displayName || "Me"}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="Choose a profile photo"
        style={{ display: "none" }}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press hit"
            style={{ ...linkStyle, color: "var(--primary)" }}
          >
            {busy ? "Saving…" : photoUrl ? "Change photo" : "Add a photo"}
          </button>
          {photoUrl && !busy && (
            <button onClick={() => void remove()} className="press hit" style={{ ...linkStyle, color: "var(--red)" }}>
              Remove
            </button>
          )}
        </div>
        <span role={error ? "alert" : undefined} style={{ fontSize: 12, color: error ? "var(--red)" : "var(--faint)" }}>
          {error || "Shown to people in your Tallies."}
        </span>
      </div>
    </div>
  );
}
