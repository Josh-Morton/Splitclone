"use client";

/**
 * Category picker (Phase 6, ADR-0011): the subcategories grouped under their
 * parent, each parent tinted with its accent colour. Auto-detection still runs
 * on the description; this lets the user override to any subcategory.
 */

import {
  CATEGORY_META,
  CATEGORY_TREE,
  PARENT_CATEGORIES,
  type Category,
} from "@/lib/domain";
import { Sheet } from "./sheet";

export function CategoryPickerSheet({
  open,
  onClose,
  selected,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  selected: Category;
  onPick: (slug: Category) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Choose a category">
      {PARENT_CATEGORIES.map((parent) => {
        const meta = CATEGORY_META[parent];
        return (
          <div key={parent} style={{ marginBottom: 16 }}>
            <p
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: meta.color,
                marginBottom: 8,
              }}
            >
              {meta.icon} {meta.label}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORY_TREE[parent].map((sub) => {
                const active = sub.slug === selected;
                return (
                  <button
                    key={sub.slug}
                    onClick={() => onPick(sub.slug)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 999,
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: active ? `${meta.color}29` : "var(--s2)",
                      color: active ? meta.color : "var(--muted)",
                      border: `1px solid ${active ? meta.color : "var(--line)"}`,
                    }}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}
