"use client";

/**
 * Twemoji glyph (Phase 11, ADR-0016).
 *
 * Category icons used to be plain emoji characters, which meant they were
 * rendered by whatever emoji font the OS shipped — so the same expense looked
 * different on Android, iOS and desktop. These are the vendored Twemoji 15.1
 * SVGs in /public/icons/twemoji, so the glyph is identical everywhere and
 * matches the design.
 *
 * The emoji character is kept as the `alt`, which means screen readers and
 * any copy-paste still get something meaningful, and a failed image request
 * degrades to the old behaviour rather than a broken-image icon.
 */

export function Glyph({
  codepoint,
  alt,
  size = 20,
}: {
  codepoint: string;
  /** The plain emoji character — used as alt text and as the fallback. */
  alt: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static vendored SVG, no loader needed
    <img
      src={`/icons/twemoji/${codepoint}.svg`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    />
  );
}
