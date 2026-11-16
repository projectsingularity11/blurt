import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { Pool } from "pg";
import type { State } from "./types";
const initial = (): State => ({ players: {}, daily: {}, rooms: {} });
let sqlite: DatabaseSync | undefined;
let pool: Pool | undefined;
function local() {
  if (!sqlite) {
    mkdirSync(".data", { recursive: true });
    sqlite = new DatabaseSync(
      process.env.BLURT_SQLITE_PATH || ".data/blurt.sqlite",
    );
    sqlite.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS game_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);",
    );
    sqlite
      .prepare("INSERT OR IGNORE INTO game_state VALUES (1,?)")
      .run(JSON.stringify(initial()));
  }
  return sqlite;
}
export async function transaction<T>(fn: (state: State) => T): Promise<T> {
  if (process.env.DATABASE_URL) {
    pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        "SELECT payload FROM blurt_private.game_state WHERE id=1 FOR UPDATE",
      );
      if (!r.rows[0]) throw Error("Run the database migration first");
      const state = r.rows[0].payload as State;
      const before = JSON.stringify(state);
      const result = fn(state);
      const after = JSON.stringify(state);
      if (after !== before)
        await c.query(
          "UPDATE blurt_private.game_state SET payload=$1 WHERE id=1",
          [after],
        );
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  if (process.env.VERCEL)
    throw Error("Database is not connected yet. Try again after setup");
  const db = local();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT payload FROM game_state WHERE id=1")
      .get() as { payload: string };
    const state = JSON.parse(row.payload) as State;
    const before = JSON.stringify(state);
    const result = fn(state);
    const after = JSON.stringify(state);
    if (after !== before)
      db.prepare("UPDATE game_state SET payload=? WHERE id=1").run(after);
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
