import fs from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL)
  throw Error("Set DATABASE_URL in your environment");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(281975441)");
  await client.query(
    "CREATE SCHEMA IF NOT EXISTS blurt_private; CREATE TABLE IF NOT EXISTS blurt_private.schema_migrations (name text primary key, applied_at timestamptz default now()); REVOKE ALL ON SCHEMA blurt_private FROM public;",
  );
  for (const file of (await fs.readdir("supabase/migrations")).sort()) {
    if (
      process.env.BLURT_FULL_SUPABASE_SCHEMA !== "true" &&
      file !== "20261116001000_blurt_initial.sql"
    )
      continue;
    const prior = await client.query(
      "SELECT name FROM blurt_private.schema_migrations WHERE name=$1",
      [file],
    );
    if (!prior.rowCount) {
      await client.query(
        await fs.readFile(`supabase/migrations/${file}`, "utf8"),
      );
      await client.query(
        "INSERT INTO blurt_private.schema_migrations(name) VALUES($1)",
        [file],
      );
    }
  }
  const puzzles = JSON.parse(await fs.readFile("content/puzzles.json", "utf8"));
  for (const p of puzzles) {
    await client.query(
      "INSERT INTO blurt_private.puzzles(id,canonical_answer,category) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET canonical_answer=excluded.canonical_answer,category=excluded.category",
      [p.id, p.answer, p.category],
    );
    for (const a of [p.answer, ...p.aliases])
      await client.query(
        "INSERT INTO blurt_private.puzzle_answers VALUES($1,$2) ON CONFLICT DO NOTHING",
        [p.id, a],
      );
    for (let stage = 1; stage <= 6; stage++)
      await client.query(
        "INSERT INTO blurt_private.puzzle_assets VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [p.id, stage, `${p.id}-${stage}.webp`],
      );
  }
  await client.query("COMMIT");
  console.log("Migration and puzzle catalog applied.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
