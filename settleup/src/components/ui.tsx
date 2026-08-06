"use client";

/**
 * Tiny shared UI primitives styled purely with the design tokens
 * (globals.css / ADR-0007, retuned by ADR-0016).
 *
 * These are the leverage points for a reskin: the more a screen composes
 * from here, the less a future theme change costs. Nothing in this file
 * invents a colour, radius, size or weight — every value is a token.
 */

import type { CSSProperties, ReactNode } from "react";

export function Screen({
  children,
  padding = 18,
  center = false,
}: {
  children: ReactNode;
  padding?: number;
  center?: boolean;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        padding: `max(env(safe-area-inset-top), 24px) ${padding}px 32px`,
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        ...(center ? { justifyContent: "center" } : {}),
      }}
    >
      {children}
    </main>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        borderRadius: "var(--r-card)",
        border: "1px solid var(--line)",
        padding: 22,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  // Fully pill (ADR-0016) and flat — separation comes from colour and
  // hairlines now, not shadow.
  const base: CSSProperties = {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "var(--r-pill)",
    fontSize: 15,
    fontWeight: "var(--w-bold)" as unknown as number,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    border: "2px solid transparent",
    transition: "opacity var(--d-fast), transform var(--d-fast)",
  };
  const variants: Record<string, CSSProperties> = {
    primary: {
      background: "var(--primary)",
      color: "var(--on-accent)",
    },
    secondary: {
      background: "var(--surface)",
      color: "var(--ink)",
      border: "2px solid var(--line2)",
    },
    ghost: {
      background: "transparent",
      color: "var(--muted)",
    },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoFocus,
  maxLength,
  prefix,
  center = false,
  letterSpacing,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "email" | "numeric" | "decimal";
  autoFocus?: boolean;
  maxLength?: number;
  prefix?: string;
  center?: boolean;
  letterSpacing?: number;
  onEnter?: () => void;
}) {
  const input = (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      style={{
        width: "100%",
        background: prefix ? "transparent" : "var(--surface)",
        border: prefix ? "none" : "2px solid var(--line)",
        borderRadius: "var(--r-input)",
        outline: "none",
        color: "var(--ink)",
        fontSize: 16,
        fontWeight: "var(--w-medium)" as unknown as number,
        padding: prefix ? "14px 8px 14px 0" : "14px 16px",
        textAlign: center ? "center" : "left",
        letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
      }}
    />
  );
  if (!prefix) return input;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--surface)",
        border: "2px solid var(--line)",
        borderRadius: "var(--r-input)",
        paddingLeft: 16,
      }}
    >
      <span style={{ color: "var(--faint)", fontSize: 16, fontWeight: "var(--w-bold)" as unknown as number }}>{prefix}</span>
      {input}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: "var(--t-label)",
        fontWeight: "var(--w-heavy)" as unknown as number,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--faint)",
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}

export function Logo({ size = 64 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand icon
    <img
      src="/icons/icon-192.png"
      alt="Tally"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p style={{ color: "var(--red)", fontSize: "var(--t-body-sm)", fontWeight: "var(--w-medium)" as unknown as number, marginTop: 10 }}>{children}</p>;
}

export function Spinner() {
  return (
    <div
      aria-label="Loading"
      style={{
        width: 22,
        height: 22,
        border: "3px solid var(--line)",
        borderTopColor: "var(--primary)",
        borderRadius: "50%",
        animation: "spin 1.4s linear infinite",
        margin: "0 auto",
      }}
    />
  );
}
