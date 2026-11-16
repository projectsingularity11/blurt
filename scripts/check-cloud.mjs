import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
const base =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://buwlkrqbbhsxyepeqjim.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_c04uWh26c1Xazz_N6aTb4A_cmId6wTP";
async function guest() {
  const r = await fetch(base + "/auth/v1/signup", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  const a = await r.json();
  assert.equal(r.status, 200, a.msg);
  return a.access_token;
}
async function call(token, body) {
  const r = await fetch(base + "/functions/v1/blurt-api", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    data: r.headers.get("content-type")?.includes("image")
      ? Buffer.from(await r.arrayBuffer())
      : await r.json(),
  };
}
async function run(token, body) {
  const r = await call(token, body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const action = (action, data = {}) => ({
  kind: "command",
  command: { action, key: crypto.randomUUID(), ...data },
});
const a = await guest(),
  b = await guest();
let daily = await run(a, { kind: "view", mode: "daily" });
assert.equal(daily.daily.answer, undefined);
const image = await run(a, { kind: "image", mode: "daily" });
const puzzles = JSON.parse(await fs.readFile("content/puzzles.json", "utf8"));
let answer;
for (const p of puzzles)
  if (image.equals(await fs.readFile(`content/prepared/${p.id}-1.webp`)))
    answer = p.answer;
assert.ok(answer, "Private storage returns an actual prepared picture");
const guess = action("dailyGuess", { text: answer });
daily = await run(a, guess);
assert.equal(daily.daily.solved, true);
daily = await run(a, guess);
assert.equal(daily.daily.guesses.length, 1);
console.log(
  "PASS: Auth guests, private Storage, official daily result and duplicate protection",
);
const room = await run(
  a,
  action("create", {
    name: "Backend test A",
    rounds: 3,
    duration: 15,
    category: "Nature",
  }),
);
const code = room.code;
await run(b, action("join", { code, name: "Backend test B" }));
assert.equal((await call(b, action("start", { code }))).status, 400);
const outsider = await guest();
assert.equal(
  (await call(outsider, { kind: "view", mode: "room", code })).status,
  400,
);
await run(a, action("ready", { code }));
await run(b, action("ready", { code }));
await run(a, action("start", { code }));
console.log(
  "PASS: real private room, membership and host authorization; waiting for unattended transitions",
);
await new Promise((r) => setTimeout(r, 27000));
const current = await run(a, { kind: "view", mode: "room", code });
assert.equal(current.room.round, 2);
assert.equal(current.room.answer, undefined);
console.log(
  "PASS: unattended round progression",
  JSON.stringify({ code, round: current.room.round }),
);
const currentImage = await run(a, { kind: "image", mode: "room", code });
let currentAnswer;
for (const p of puzzles)
  if (
    currentImage.equals(
      await fs.readFile(`content/prepared/${p.id}-${current.room.stage}.webp`),
    )
  )
    currentAnswer = p.answer;
assert.ok(currentAnswer);
const correct = action("partyGuess", { code, text: currentAnswer });
const scored = await run(a, correct);
await run(a, correct);
assert.equal(
  scored.room.solved[scored.me],
  (6 - scored.room.myGuesses.at(-1).stage) * 100,
);
const bob = await run(b, { kind: "view", mode: "room", code });
assert.equal(bob.room.answer, undefined);
assert.equal(bob.room.feed.length, 0);
console.log("PASS: authoritative stage scores and answer secrecy");
await run(a, action("leave", { code }));
const after = await run(b, { kind: "view", mode: "room", code });
assert.equal(after.room.host, after.me);
await run(b, action("leave", { code }));
console.log("PASS: host transfer");
