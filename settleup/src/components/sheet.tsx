"use client";

/**
 * Bottom sheet per the design tokens: scrim + slide-up panel
 * (.28s cubic-bezier(.2,.8,.2,1)), 26px top radius, sheet surface + shadow.
 */

import type { ReactNode } from "react";

export function Sheet({
  open,
  onClose,
  title,
  children,
  headerRight,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 430,
          maxHeight: "88dvh",
          overflowY: "auto",
          background: "var(--sheet)",
          borderRadius: "26px 26px 0 0",
          boxShadow: "var(--shadow-sheet)",
          padding: "10px 18px calc(env(safe-area-inset-bottom) + 22px)",
          animation: "sheetUp .28s var(--ease-sheet)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--s3)",
            margin: "4px auto 12px",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              padding: 4,
            }}
          >
            Cancel
          </button>
          <p style={{ fontSize: 15, fontWeight: 800 }}>{title}</p>
          <div style={{ minWidth: 48, textAlign: "right" }}>{headerRight}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: 999,
        fontSize: 13.5,
        fontWeight: 700,
        cursor: "pointer",
        background: active ? "var(--bluebg)" : "var(--s2)",
        color: active ? "var(--primary)" : "var(--muted)",
        border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
      }}
    >
      {children}
    </button>
  );
}
