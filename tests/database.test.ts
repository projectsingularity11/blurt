import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { command, dailyRun, puzzleById } from "../lib/game";
import type { State } from "../lib/types";
import puzzles from "../content/puzzles.json";
it("applies PostgreSQL migration, projects real gameplay and enforces uniqueness", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync(
        "supabase/migrations/20261116001000_blurt_initial.sql",
        "utf8",
      ),
    );
    for (const p of puzzles)
      await db.query(
        "INSERT INTO blurt_private.puzzles(id,canonical_answer,category) VALUES($1,$2,$3)",
        [p.id, p.answer, p.category],
      );
    const s: State = { players: {}, rooms: {}, daily: {} };
    dailyRun(s, "alice", 1000);
    await db.query(
      "UPDATE blurt_private.game_state SET payload=$1 WHERE id=1",
      [JSON.stringify(s)],
    );
    command(
      s,
      "alice",
      {
        action: "dailyGuess",
        text: puzzleById(dailyRun(s, "alice", 1000).puzzle).answer,
        key: "daily",
      },
      1000,
    );
    const code = command(
      s,
      "alice",
      { action: "create", name: "Alice" },
      1000,
    )!;
    command(s, "bob", { action: "join", code, name: "Bob" }, 1000);
    for (const id of ["alice", "bob"])
      command(s, id, { action: "ready", code }, 1000);
    command(s, "alice", { action: "start", code }, 1000);
    command(
      s,
      "alice",
      { action: "partyGuess", code, text: "not an answer", key: "one" },
      5000,
    );
    await db.query(
      "UPDATE blurt_private.game_state SET payload=$1 WHERE id=1",
      [JSON.stringify(s)],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM blurt_private.daily_guesses",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM blurt_private.party_guesses",
        )
      ).rows[0].n,
    ).toBe(1);
    await db.query(
      "UPDATE blurt_private.game_state SET payload=$1 WHERE id=1",
      [JSON.stringify(s)],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM blurt_private.party_guesses",
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      db.exec(
        "INSERT INTO blurt_private.daily_guesses SELECT * FROM blurt_private.daily_guesses",
      ),
    ).rejects.toThrow();
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='blurt_private' AND relkind='r'",
    );
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    await db.exec("CREATE ROLE anon; SET ROLE anon;");
    await expect(
      db.query("SELECT * FROM blurt_private.game_state"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
