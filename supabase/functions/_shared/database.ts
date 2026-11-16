import postgres from "npm:postgres@3.4.8";
import migrations from "./migrations.json" with { type: "json" };
const connection = Deno.env.get("SUPABASE_DB_URL");
if (!connection) throw Error("Database connection is unavailable");
const sql = postgres(connection, {
  prepare: false,
  max: 3,
  idle_timeout: 15,
  connect_timeout: 10,
});
let schema: Promise<void> | undefined;
export async function ensureSchema() {
  schema ??= sql
    .begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(281975441)`;
      await tx.unsafe(
        "create schema if not exists blurt_private; create table if not exists blurt_private.schema_migrations(name text primary key,applied_at timestamptz default now()); revoke all on schema blurt_private from public;",
      );
      for (const migration of migrations) {
        const prior =
          await tx`select name from blurt_private.schema_migrations where name=${migration.name}`;
        if (!prior.length) {
          await tx.unsafe(migration.sql);
          await tx`insert into blurt_private.schema_migrations(name) values(${migration.name})`;
        }
      }
      await tx.unsafe(
        "alter table blurt_private.schema_migrations enable row level security; notify pgrst,'reload schema';",
      );
    })
    .then(() => {})
    .catch((e) => {
      schema = undefined;
      throw e;
    });
  await schema;
}
export async function database<T>(
  name: string,
  a: Record<string, unknown>,
): Promise<T> {
  let rows;
  switch (name) {
    case "blurt_register_viewer":
      rows=await sql`select public.blurt_register_viewer(${a.p_player as string}::uuid,${a.p_pictures as string[]},${a.p_deal as string},${a.p_match_deal as string}) as result`;
      break;
    case "blurt_draw_puzzles":
      rows=await sql`select public.blurt_draw_puzzles(${a.p_players as string[]},${a.p_category as string},${a.p_count as number},${a.p_deal as string}) as result`;
      break;
    case "blurt_seed_catalog":
      if((await sql`select 1 from blurt_private.content_releases where version=${a.p_version as string}`).length)return undefined as T;
      rows =
        await sql`select public.blurt_seed_catalog(${a.p_version as string},${sql.json(a.p_puzzles as never)}) as result`;
      break;
    case "blurt_read_document":
      rows =
        await sql`select public.blurt_read_document(${a.p_scope as string}) as result`;
      break;
    case "blurt_commit_document":
      rows =
        await sql`select public.blurt_commit_document(${a.p_scope as string},${a.p_revision as number},${sql.json(a.p_payload as never)}) as result`;
      break;
    case "blurt_rate_limit":
      rows =
        await sql`select public.blurt_rate_limit(${a.p_actor as string},${a.p_bucket as string},${a.p_limit as number},${a.p_window as number}) as result`;
      break;
    case "blurt_daily_puzzle":
      rows =
        await sql`select public.blurt_daily_puzzle(${a.p_day as number}) as result`;
      break;
    case "blurt_player_stats":
      rows =
        await sql`select public.blurt_player_stats(${a.p_player as string}) as result`;
      break;
    default:
      throw Error("Unknown database operation");
  }
  return rows[0].result as T;
}
