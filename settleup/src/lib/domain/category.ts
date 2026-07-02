/**
 * Auto-categorization — the design intentionally has NO manual category picker;
 * the category is detected from description keywords. Keyword map ported
 * verbatim from autoCategory() in the design prototype (keep in sync with it).
 */

import type { Category } from "./types";

const KEYWORD_MAP: [Category, string[]][] = [
  ["rent", ["rent", "airbnb", "lease", "accommodation", "bond", "deposit"]],
  [
    "utilities",
    ["electric", "water", "fibre", "fiber", "internet", "wifi", "wi-fi", "gas", "municipal", "levy", "dstv", "prepaid", "refuse"],
  ],
  [
    "eatingout",
    ["dinner", "lunch", "breakfast", "restaurant", "takeaway", "take-away", "uber eats", "mr d", "mrd", "cafe", "café", "bar ", "drinks", "date night", "marble", "sushi", "pizza", "burger"],
  ],
  [
    "transport",
    ["uber", "bolt", "petrol", "fuel", "taxi", "gautrain", "parking", "car ", "tyre", "service", "licen"],
  ],
  [
    "groceries",
    ["grocer", "woolworth", "woolies", "checkers", "pick n pay", "pnp", "spar", "food ", "coffee", "milk", "bread", "beans", "braai", "snacks", "shop"],
  ],
  [
    "household",
    ["cleaning", "pharmacy", "gym", "hardware", "furniture", "decor", "plant", "tools", "supplies", "linen", "towel"],
  ],
  [
    "entertainment",
    ["movie", "cinema", "netflix", "show", "concert", "game", "spotify", "ticket", "festival"],
  ],
];

export function autoCategory(description: string | null | undefined): Category {
  const s = (description ?? "").toLowerCase();
  for (const [cat, words] of KEYWORD_MAP) {
    if (words.some((w) => s.includes(w))) return cat;
  }
  return "other";
}

/** Display metadata per category (labels + accent colors from the design tokens). */
export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  groceries: { label: "Groceries", color: "#7FB6F5" },
  rent: { label: "Rent", color: "#A9ABF8" },
  utilities: { label: "Utilities", color: "#E9BF73" },
  eatingout: { label: "Eating out", color: "#6FD7AC" },
  transport: { label: "Transport", color: "#74D2E0" },
  household: { label: "Household", color: "#C9A6F4" },
  entertainment: { label: "Entertainment", color: "#F39DC0" },
  other: { label: "Other", color: "#AEB9CC" },
};
