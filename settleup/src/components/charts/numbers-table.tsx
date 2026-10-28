"use client";

/**
 * "Show numbers" — the table twin every Phase 20 chart has, so no value is
 * reachable only by looking at (or hovering over) a chart. Collapsed by
 * default; a native <details>, so it's keyboard- and reader-friendly free.
 */

export function NumbersTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="hit" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer", width: "fit-content" }}>
        Show numbers
      </summary>
      <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 12.5 }}>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                style={{ textAlign: i === 0 ? "left" : "right", color: "var(--muted)", fontWeight: 700, padding: "4px 0", borderBottom: "1px solid var(--line)" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? "left" : "right",
                    padding: "4px 0",
                    borderBottom: "1px solid var(--line)",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: ci === 0 ? 600 : 500,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
