/**
 * Phase 18 §5: re-file legacy categories, reversibly. Run from settleup/:
 *
 *   export SUPABASE_ACCESS_TOKEN=…            # the logged-in Supabase CLI's token
 *   npm run backfill:categories               # plan: the diff + a rolled-back proof
 *   npm run backfill:categories -- apply      # write it; prints the run id
 *   npm run backfill:categories -- revert <run-id> [--dry-run]
 *
 * Talks to the Management API's database/query endpoint, because port 5432
 * is blocked on the network this project is run from. The rules live in
 * src/lib/domain/category-backfill.ts. This file only fetches, prints and
 * writes.
 *
 * Every write is ONE statement: it updates `category` only, guarded by
 * "still holds the value the plan saw", and logs each change to
 * category_backfill. It runs inside a transaction that fingerprints all
 * spending data (every expense, payer, split, template and settlement
 * column except the category and its sync bookkeeping) before and after,
 * and aborts if anything else moved. `plan` runs that same statement and
 * then rolls back.
 */

import { randomUUID } from "node:crypto";
import { categoryMeta, isGeneralCategory, parentOf, PARENT_CATEGORIES, CATEGORY_META } from "../src/lib/domain/category";
import type { CategorySource } from "../src/lib/domain/category";
import { planRefiles, type BackfillRow, type BackfillTable, type Refile } from "../src/lib/domain/category-backfill";
import { fmtR } from "../src/lib/domain/money";

const PROJECT = process.env.SUPABASE_PROJECT_REF ?? "zgoinuagmornkwgqomhq";

function token(): string {
  const raw = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!raw) {
    console.error('Set SUPABASE_ACCESS_TOKEN (macOS: security find-generic-password -s "Supabase CLI" -w).');
    process.exit(2);
  }
  // Older CLI versions store the keychain value base64-wrapped.
  return raw.startsWith("go-keyring-base64:")
    ? Buffer.from(raw.slice("go-keyring-base64:".length), "base64").toString("utf8")
    : raw;
}

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`database/query → HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text) as T[];
}

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** md5 over all spending data except category + sync bookkeeping. */
const FINGERPRINT = `md5(concat_ws('|',
  (select string_agg(md5((to_jsonb(e) - 'category' - 'category_source' - 'version' - 'updated_at')::text), '' order by e.id) from expense e),
  (select string_agg(md5(to_jsonb(p)::text), '' order by p.id) from expense_payer p),
  (select string_agg(md5(to_jsonb(s)::text), '' order by s.id) from expense_split s),
  (select string_agg(md5((to_jsonb(r) - 'category' - 'version' - 'updated_at')::text), '' order by r.id) from recurring_expense r),
  (select string_agg(md5(to_jsonb(t)::text), '' order by t.id) from settlement t)))`;

const GUARD = `do $guard$ begin
  if (select v from _fp) is distinct from ${FINGERPRINT} then
    raise exception 'spending fingerprint changed: aborting, nothing written';
  end if;
end $guard$;`;

const DISTRIBUTION = `(select json_agg(d) from (
  select category, count(*)::int as n, sum(amount_cents)::bigint as cents
  from expense where deleted_at is null group by category) d)`;

interface Row extends BackfillRow {
  amountCents: number | null;
}
interface Dist {
  category: string;
  n: number;
  cents: number | string;
}

async function fetchRows(): Promise<Row[]> {
  const raw = await sql<{
    tbl: BackfillTable;
    id: string;
    group_id: string;
    description: string;
    category: string;
    source: CategorySource;
    amount_cents: number | string | null;
  }>(`
    select 'expense' as tbl, id, group_id, description, category, category_source as source, amount_cents
      from expense where deleted_at is null
    union all
    select 'recurring_expense', id, group_id, description, category, 'auto', amount_cents
      from recurring_expense where deleted_at is null`);
  return raw.map((r) => ({
    table: r.tbl,
    id: r.id,
    groupId: r.group_id,
    description: r.description,
    category: r.category,
    source: r.source,
    amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
  }));
}

const label = (slug: string) => {
  const m = categoryMeta(slug);
  return m.label === m.parentLabel ? m.label : `${m.parentLabel} › ${m.label}`;
};

function printPlan(rows: Row[], plan: Refile[]) {
  const expenses = rows.filter((r) => r.table === "expense");
  const general = rows.filter((r) => isGeneralCategory(r.category));
  console.log(
    `${expenses.length} live expenses · ${rows.length - expenses.length} recurring templates · ` +
      `${general.length} rows in a general bucket\n`
  );
  if (plan.length === 0) {
    console.log("Nothing to re-file.");
    return;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  console.log(`Re-file ${plan.length} row(s):\n`);
  const sorted = [...plan].sort(
    (a, b) => a.reason.localeCompare(b.reason) || a.after.localeCompare(b.after) || a.before.localeCompare(b.before)
  );
  for (const p of sorted) {
    const r = byId.get(p.id)!;
    const amount = r.amountCents === null ? "—" : fmtR(r.amountCents);
    const tag = p.table === "recurring_expense" ? " (recurring template)" : "";
    console.log(
      `  ${amount.padStart(8)}  ${label(p.before)} → ${label(p.after)}  [${p.reason}]  ${JSON.stringify(r.description)}${tag}`
    );
  }
  const left = general.filter((r) => !plan.some((p) => p.id === r.id));
  console.log(`\n${left.length} general-bucket row(s) stay put (no household filing, no qualifying engine match).`);
}

/** Expense count and Rand by parent, plus Other's share of spend. */
function printDistribution(title: string, dist: Dist[]) {
  const total = dist.reduce((a, d) => a + Number(d.cents), 0);
  const byParent = new Map<string, { n: number; cents: number }>();
  for (const d of dist) {
    const p = parentOf(d.category);
    const cur = byParent.get(p) ?? { n: 0, cents: 0 };
    byParent.set(p, { n: cur.n + d.n, cents: cur.cents + Number(d.cents) });
  }
  const general = dist.filter((d) => isGeneralCategory(d.category));
  const other = dist.find((d) => d.category === "other");
  console.log(`\n${title}`);
  for (const p of PARENT_CATEGORIES) {
    const v = byParent.get(p);
    if (!v) continue;
    const pct = total ? Math.round((v.cents / total) * 100) : 0;
    console.log(`  ${CATEGORY_META[p].label.padEnd(14)} ${String(v.n).padStart(4)} rows  ${fmtR(v.cents).padStart(10)}  ${pct}%`);
  }
  const otherCents = other ? Number(other.cents) : 0;
  console.log(
    `  "Other" itself: ${other?.n ?? 0} rows, ${fmtR(otherCents)} (${total ? Math.round((otherCents / total) * 100) : 0}% of spend)` +
      ` · any general bucket: ${general.reduce((a, d) => a + d.n, 0)} rows`
  );
}

function applyStatement(runId: string, plan: Refile[], commit: boolean): string {
  const values = plan
    .map((p) => `(${lit(p.table)}, ${lit(p.id)}::uuid, ${lit(p.before)}, ${lit(p.after)}, ${lit(p.reason)})`)
    .join(",\n    ");
  return `
begin;
create temp table _fp on commit drop as select ${FINGERPRINT} as v;
with plan(tbl, id, before, after, reason) as (values
    ${values}),
e as (
  update expense x set category = p.after from plan p
  where p.tbl = 'expense' and x.id = p.id and x.category = p.before
    and x.category_source = 'auto' and x.deleted_at is null
  returning p.tbl, x.id, p.before, p.after, p.reason),
r as (
  update recurring_expense x set category = p.after from plan p
  where p.tbl = 'recurring_expense' and x.id = p.id and x.category = p.before and x.deleted_at is null
  returning p.tbl, x.id, p.before, p.after, p.reason)
insert into category_backfill (run_id, table_name, row_id, category_before, category_after, reason)
select ${lit(runId)}::uuid, tbl, id, before, after, reason from (select * from e union all select * from r) u;
${GUARD}
select (select count(*)::int from category_backfill where run_id = ${lit(runId)}::uuid) as written,
       (select v from _fp) = ${FINGERPRINT} as fingerprint_ok,
       ${DISTRIBUTION} as dist;
${commit ? "commit" : "rollback"};`;
}

function revertStatement(runId: string, commit: boolean): string {
  return `
begin;
create temp table _fp on commit drop as select ${FINGERPRINT} as v;
with b as (select * from category_backfill where run_id = ${lit(runId)}::uuid and reverted_at is null),
e as (
  update expense x set category = b.category_before from b
  where b.table_name = 'expense' and x.id = b.row_id and x.category = b.category_after
  returning b.id),
r as (
  update recurring_expense x set category = b.category_before from b
  where b.table_name = 'recurring_expense' and x.id = b.row_id and x.category = b.category_after
  returning b.id)
update category_backfill c set reverted_at = now()
where c.id in (select id from e union all select id from r);
${GUARD}
select (select count(*)::int from category_backfill where run_id = ${lit(runId)}::uuid and reverted_at is not null) as reverted,
       (select count(*)::int from category_backfill where run_id = ${lit(runId)}::uuid and reverted_at is null) as skipped,
       (select v from _fp) = ${FINGERPRINT} as fingerprint_ok,
       ${DISTRIBUTION} as dist;
${commit ? "commit" : "rollback"};`;
}

async function main() {
  const [mode = "plan", arg] = process.argv.slice(2);

  if (mode === "revert") {
    if (!arg || !/^[0-9a-f-]{36}$/i.test(arg)) throw new Error("usage: revert <run-id> [--dry-run]");
    const dry = process.argv.includes("--dry-run");
    const [res] = await sql<{ reverted: number; skipped: number; fingerprint_ok: boolean; dist: Dist[] }>(
      revertStatement(arg, !dry)
    );
    console.log(
      `${dry ? "Dry run (rolled back): would revert" : "Reverted"} ${res.reverted} row(s); ` +
        `${res.skipped} skipped because they've changed since. Spending fingerprint unchanged: ${res.fingerprint_ok}.`
    );
    printDistribution("After revert:", res.dist ?? []);
    return;
  }
  if (mode !== "plan" && mode !== "apply") throw new Error(`unknown mode "${mode}" (plan | apply | revert)`);

  const rows = await fetchRows();
  const plan = planRefiles(rows);
  console.log(`Tally category backfill (${mode === "plan" ? "plan, writes nothing" : "APPLY"})\n`);
  printPlan(rows, plan);

  const [before] = await sql<{ dist: Dist[] }>(`select ${DISTRIBUTION} as dist`);
  printDistribution("Before:", before.dist ?? []);
  if (plan.length === 0) return;

  const runId = randomUUID();
  const [res] = await sql<{ written: number; fingerprint_ok: boolean; dist: Dist[] }>(
    applyStatement(runId, plan, mode === "apply")
  );
  printDistribution(mode === "apply" ? "After:" : "After (proven in a rolled-back transaction):", res.dist ?? []);
  console.log(
    `\n${mode === "apply" ? "Wrote" : "Would write"} ${res.written} of ${plan.length} planned change(s). ` +
      `Spending fingerprint unchanged: ${res.fingerprint_ok}.`
  );
  if (mode === "apply") console.log(`Run id: ${runId}  (undo: npm run backfill:categories -- revert ${runId})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
