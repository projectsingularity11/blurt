import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
it("pins a unique daily year and deals cross-mode pictures without repetition", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';create schema realtime;create table realtime.messages(id integer);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as 'select ''''';create function realtime.send(jsonb,text,text,boolean) returns void language sql as 'select';create schema cron;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));`,
    );
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(
        readFileSync(`supabase/migrations/${file}`, "utf8")
          .replace(/create extension if not exists pg_cron;/g, "")
          .replace(/^select cron.schedule.*$/gm, ""),
      );
    const fixtures = Array.from({ length: 406 }, (_, i) => ({
      id: `p${i.toString(16).padStart(15, "0")}`,
      answer: `picture ${i}`,
      aliases: [],
      category: "Objects",
      daily: i < 366,
      release: "photographs-v2",
      sourceSha1: `source-${i}`,
      credit: {
        author: "Fixture",
        license: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        sourceUrl: "https://commons.wikimedia.org/",
      },
    }));
    const names = fixtures.flatMap((p) =>
      Array.from({ length: 6 }, (_, i) => `v2/${p.id}-${i + 1}.webp`),
    );
    await db.query(
      "insert into storage.objects select 'blurt-puzzles',jsonb_array_elements_text($1::jsonb)",
      [JSON.stringify(names)],
    );
    await db.query("select public.blurt_seed_catalog($1,$2::jsonb)", [
      "photographs-v2",
      JSON.stringify(fixtures),
    ]);
    const calendar = (
      await db.query<{ n: number; unique: number; days: number }>(
        "select count(*)::int n,count(distinct puzzle_id)::int unique,(max(day)-min(day)+1)::int days from blurt_private.daily_puzzles",
      )
    ).rows[0];
    expect(calendar).toEqual({ n: 366, unique: 366, days: 366 });
    const alice = "11111111-1111-4111-8111-111111111111",
      bob = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users values($1),($2)", [alice, bob]);
    const deal = async (players: string[], key: string, n = 1) =>
      (
        await db.query<{ picked: string[] }>(
          "select public.blurt_draw_puzzles($1,$2,$3,$4) picked",
          [players, "All pictures", n, key],
        )
      ).rows[0].picked;
    const solo = await deal([alice], "free:one");
    expect(await deal([alice], "free:one")).toEqual(solo);
    const flash = await deal([alice], "flash:one");
    const party = await deal([alice, bob], "party:one", 7);
    expect(new Set([...solo, ...flash, ...party]).size).toBe(9);
    expect(
      [...solo, ...flash, ...party].every(
        (id) => !fixtures.find((p) => p.id === id)?.daily,
      ),
    ).toBe(true);
    await expect(deal([bob], "free:one")).rejects.toThrow(
      "Deal does not match",
    );
    await expect(
      db.query("select public.blurt_register_viewer($1,$2,$3,$4)", [
        alice,
        solo,
        "watch:other",
        "party:other",
      ]),
    ).rejects.toThrow("You have already seen");
    await db.query("select public.blurt_register_viewer($1,$2,$3,$4)", [
      alice,
      party,
      "watch:party",
      "party:one",
    ]);
    const unseen = fixtures.find(
      (p) => !p.daily && ![...solo, ...flash, ...party].includes(p.id),
    )!.id;
    await db.query("select public.blurt_register_viewer($1,$2,$3,$4)", [
      bob,
      [unseen],
      "watch:next",
      "party:next",
    ]);
    await db.query("select public.blurt_register_viewer($1,$2,$3,$4)", [
      bob,
      [unseen],
      "watch:next",
      "party:next",
    ]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from blurt_private.seen_puzzles where player_id=$1::uuid and puzzle_id=$2",
          [bob, unseen],
        )
      ).rows[0].n,
    ).toBe(1);
    await db.query(
      "insert into blurt_private.seen_puzzles(player_id,puzzle_id,first_deal) select $1::uuid,id,'exhausted' from blurt_private.puzzles where not daily_reserved on conflict do nothing",
      [alice],
    );
    await expect(deal([alice], "no-repeat")).rejects.toThrow(
      "No unseen pictures left",
    );
    const booked = (
      await db.query<{ n: number }>(
        "select count(*)::int n from blurt_private.puzzle_deals where id='no-repeat'",
      )
    ).rows[0].n;
    expect(booked).toBe(0);
    await db.exec("set role anon");
    await expect(
      db.query("select * from blurt_private.seen_puzzles"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
