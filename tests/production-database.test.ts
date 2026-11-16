import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import puzzles from "../content/puzzles.json";
import { command, dailyRun } from "../lib/game";
import type { State } from "../lib/types";
const initial = () => ({ players: {}, daily: {}, rooms: {} }) as State;
it("runs isolated production documents, optimistic conflicts, projections, and unattended deadlines", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';create schema realtime;create table realtime.messages(id integer);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as 'select ''''';create function realtime.send(jsonb,text,text,boolean) returns void language sql as 'select';create schema cron;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261116001000_blurt_initial.sql",
        "utf8",
      ),
    );
    const migration = readFileSync(
      "supabase/migrations/20261116010000_production_backend.sql",
      "utf8",
    )
      .replace(/create extension if not exists pg_cron;/, "")
      .replace(/^select cron.schedule.*$/gm, "");
    await db.exec(migration);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261116020000_schedule_and_access.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261116030000_atomic_document_creation.sql",
        "utf8",
      ).replace(/^select cron.schedule.*$/gm, ""),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261116040000_solo_modes.sql",
        "utf8",
      ).replace(/^select cron.schedule.*$/gm, ""),
    );
    await db.query("select public.blurt_seed_catalog($1,$2::jsonb)", [
      "v1",
      JSON.stringify(puzzles),
    ]);
    const pinned = (
      await db.query<{ id: string }>(
        "select public.blurt_daily_puzzle(20800) id",
      )
    ).rows[0].id;
    await db.query(
      "update blurt_private.puzzles set status='inactive' where id=$1",
      [pinned],
    );
    expect(
      (
        await db.query<{ id: string }>(
          "select public.blurt_daily_puzzle(20800) id",
        )
      ).rows[0].id,
    ).toBe(pinned);
    const id = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users values($1),($2)", [id, bob]);
    const s = initial();
    dailyRun(s, id);
    const scope = `daily:${id}:today`;
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.blurt_commit_document($1,0,$2::jsonb) ok",
          [scope, JSON.stringify(s)],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.blurt_commit_document($1,0,$2::jsonb) ok",
          [scope, JSON.stringify(s)],
        )
      ).rows[0].ok,
    ).toBe(false);
    const losing = structuredClone(s);
    for (const run of Object.values(losing.daily)) {
      run.done = true;
      run.solved = true;
      run.guesses = [{ text: "cat", stage: 1, correct: true }];
    }
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.blurt_commit_document($1,0,$2::jsonb) ok",
          [scope, JSON.stringify(losing)],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from blurt_private.daily_runs where player_id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe("active");
    const room = initial();
    const now = Date.now() - 180000;
    const code = command(
      room,
      id,
      { action: "create", name: "Alice", rounds: 3 },
      now,
    )!;
    command(room, bob, { action: "join", code, name: "Bob" }, now);
    for (const player of [id, bob])
      command(room, player, { action: "ready", code }, now);
    command(room, id, { action: "start", code }, now);
    await db.query("select public.blurt_commit_document($1,0,$2::jsonb)", [
      `room:${code}`,
      JSON.stringify(room),
    ]);
    await db.query("select blurt_private.advance_due_rooms()");
    const result = await db.query<{ state: { payload: State } }>(
      "select public.blurt_read_document($1) state",
      [`room:${code}`],
    );
    expect(result.rows[0].state.payload.rooms[code].status).toBe("finished");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from blurt_private.matches",
        )
      ).rows[0].n,
    ).toBe(1);
    const limit = async () =>
      (
        await db.query<{ allowed: boolean }>(
          "select public.blurt_rate_limit('actor','test',2,60) allowed",
        )
      ).rows[0].allowed;
    expect(await limit()).toBe(true);
    expect(await limit()).toBe(true);
    expect(await limit()).toBe(false);
    const solo = initial();
    command(
      solo,
      id,
      { action: "soloStart", code: "FLASH" },
      Date.now() - 100000,
    );
    const soloScope = `solo:${id}:FLASH`;
    await db.query("select public.blurt_commit_document($1,0,$2::jsonb)", [
      soloScope,
      JSON.stringify(solo),
    ]);
    await db.query("select blurt_private.advance_due_solos()");
    const finished = await db.query<{ state: { payload: State } }>(
      "select public.blurt_read_document($1) state",
      [soloScope],
    );
    expect(finished.rows[0].state.payload.solo![`${id}:FLASH`].finished).toBe(
      true,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from blurt_private.solo_sessions where finished",
        )
      ).rows[0].n,
    ).toBe(1);
    await db.exec("set role anon");
    await expect(
      db.query("select public.blurt_read_document('room:AAAAA')"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
