/**
 * Regenerates the generated parts of docs/CATEGORY-MATRIX.md from
 * src/lib/domain/category.ts: the headline counts, "Parents at a glance",
 * "Matrix overview" and "By subcategory". The hand-written sections (how
 * matching works, the requirements audit, notes) are kept as they are.
 *
 *   npm run gen:category-matrix
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATEGORY_META, PARENT_CATEGORIES, SUBCATEGORIES, type SubcategoryDef } from "../src/lib/domain/category";

const DOC = fileURLToPath(new URL("../../docs/CATEGORY-MATRIX.md", import.meta.url));

const n = (x: number) => x.toLocaleString("en-ZA").replace(/[\s,]/g, " ");
const vocab = (s: SubcategoryDef) =>
  s.keywords.length + (s.brands?.length ?? 0) + (s.weak?.length ?? 0) + (s.retailers?.length ?? 0);
const live = SUBCATEGORIES.filter((s) => !s.legacy);
const total = SUBCATEGORIES.reduce((a, s) => a + vocab(s), 0);

function parentsTable(): string {
  const rows = PARENT_CATEGORIES.map((p, i) => {
    const m = CATEGORY_META[p];
    const subs = SUBCATEGORIES.filter((s) => s.parent === p);
    return `| ${i + 1} | ${m.label} | \`${p}\` | ${m.icon} | \`${m.color}\` | ${subs.filter((s) => !s.legacy).length} | ${subs.reduce((a, s) => a + vocab(s), 0)} |`;
  });
  return [
    "| # | Parent | Slug | Icon | Colour token | Subcategories | Vocabulary |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function overviewTable(): string {
  const rows = SUBCATEGORIES.map((s) => {
    const label = s.legacy ? `${s.label} *(legacy alias, hidden)*` : s.label;
    return `| ${CATEGORY_META[s.parent].label} | ${label} | \`${s.slug}\` | ${s.brands?.length ?? 0} | ${s.keywords.length} | ${s.weak?.length ?? 0} | ${s.retailers?.length ?? 0} |`;
  });
  return [
    "| Parent | Subcategory | Stored slug | Brands | Keywords | Weak | Retailers |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function bySubcategory(): string {
  const words = (ws: string[] | undefined) => (ws ?? []).map((w) => `\`${w}\``).join(", ");
  const out: string[] = [];
  for (const p of PARENT_CATEGORIES) {
    const m = CATEGORY_META[p];
    out.push(`### ${m.icon} ${m.label} — \`${p}\``, "");
    for (const s of live.filter((x) => x.parent === p)) {
      out.push(`#### ${s.label} — \`${s.slug}\``, "");
      const tiers: [string, string[] | undefined][] = [
        ["Brands", s.brands],
        ["Keywords", s.keywords],
        ["Weak", s.weak],
        ["Retailers", s.retailers],
      ];
      for (const [name, ws] of tiers) if (ws?.length) out.push(`- **${name}:** ${words(ws)}`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd();
}

/** Replace the body of a "## Heading" section, up to the next "## ". */
function replaceSection(doc: string, heading: string, body: string, keepIntro = false): string {
  const start = doc.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`missing section: ${heading}`);
  const bodyStart = start + heading.length + 5;
  const next = doc.indexOf("\n## ", bodyStart);
  const old = doc.slice(bodyStart, next);
  // An overview keeps its one-line intro paragraph above the table.
  const intro = keepIntro ? old.slice(0, old.indexOf("\n|") + 1) : "\n";
  return doc.slice(0, bodyStart) + intro + body + "\n" + doc.slice(next);
}

let doc = readFileSync(DOC, "utf8");
doc = doc.replace(
  /\*\*7 parents · \d+ pickable subcategories · [\d  ]+ vocabulary entries\.\*\*/,
  `**${PARENT_CATEGORIES.length} parents · ${live.length} pickable subcategories · ${n(total)} vocabulary entries.**`
);
doc = replaceSection(doc, "Parents at a glance", parentsTable());
doc = replaceSection(doc, "Matrix overview", overviewTable(), true);
doc = replaceSection(doc, "By subcategory", bySubcategory());
writeFileSync(DOC, doc);
console.log(`docs/CATEGORY-MATRIX.md: ${live.length} subcategories, ${n(total)} entries`);
