import { it, expect } from "vitest";
import { command, view, authorizedImage, puzzleById } from "../lib/game";
import type { State } from "../lib/types";
const fresh = (): State => ({ players: {}, daily: {}, rooms: {} });
it("checks answers, hides future images and keeps solo state private", () => {
  const s = fresh();
  command(s, "alice", { action: "soloStart", code: "FREE" }, 1000);
  const run = s.solo!["alice:FREE"];
  expect(view(s, "bob", "solo", "FREE", 1000).solo).toBeUndefined();
  expect(view(s, "alice", "solo", "FREE", 1000).solo?.answer).toBeUndefined();
  expect(authorizedImage(s, "alice", "solo", "FREE", 1000)).toBe(
    `${run.current.puzzle}-1.webp`,
  );
  command(
    s,
    "alice",
    {
      action: "soloGuess",
      code: "FREE",
      text: puzzleById(run.current.puzzle).answer,
      key: "once",
    },
    1001,
  );
  command(
    s,
    "alice",
    {
      action: "soloGuess",
      code: "FREE",
      text: puzzleById(run.current.puzzle).answer,
      key: "once",
    },
    1002,
  );
  expect(run.score).toBe(500);
  expect(run.current.guesses).toHaveLength(1);
  expect(authorizedImage(s, "alice", "solo", "FREE", 1002)).toBe(
    `${run.current.puzzle}-6.webp`,
  );
  command(s, "alice", { action: "soloNext", code: "FREE" }, 1003);
  expect(run.position).toBe(2);
  expect(run.current.done).toBe(false);
});
it("ends flash at the server deadline and preserves best on restart", () => {
  const s = fresh();
  command(s, "alice", { action: "soloStart", code: "FLASH" }, 1000);
  const r = s.solo!["alice:FLASH"];
  command(
    s,
    "alice",
    {
      action: "soloGuess",
      code: "FLASH",
      text: puzzleById(r.current.puzzle).answer,
    },
    2000,
  );
  command(s, "alice", { action: "soloNext", code: "FLASH" }, 3000);
  command(
    s,
    "alice",
    {
      action: "soloGuess",
      code: "FLASH",
      text: puzzleById(r.current.puzzle).answer,
    },
    91000,
  );
  expect(r.score).toBe(500);
  expect(r.finished).toBe(true);
  command(s, "alice", { action: "soloStart", code: "FLASH" }, 92000);
  expect(s.solo!["alice:FLASH"].best).toBe(500);
  expect(s.solo!["alice:FLASH"].score).toBe(0);
});
it("limits each picture to five reveals and increases combo rewards", () => {
  const s = fresh();
  command(s, "a", { action: "soloStart", code: "FREE" }, 1);
  const r = s.solo!["a:FREE"];
  for (let i = 0; i < 4; i++) {
    command(
      s,
      "a",
      {
        action: "soloGuess",
        code: "FREE",
        text: puzzleById(r.current.puzzle).answer,
      },
      2 + i,
    );
    if (i < 3) command(s, "a", { action: "soloNext", code: "FREE" }, 2 + i);
  }
  expect(r.score).toBe(2500);
  command(s, "a", { action: "soloNext", code: "FREE" }, 20);
  for (let i = 0; i < 8; i++)
    command(
      s,
      "a",
      { action: "soloSkip", code: "FREE", key: String(i) },
      21 + i,
    );
  expect(r.current.guesses).toHaveLength(5);
  expect(r.streak).toBe(0);
  expect(r.current.done).toBe(true);
});
