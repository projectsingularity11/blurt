import { describe, it, expect } from "vitest";
import {
  accepted,
  dailyAt,
  normalize,
  normalizeCode,
  ranking,
  score,
  stageAt,
} from "../lib/rules";
import {
  advance,
  authorizedImage,
  command,
  dailyRun,
  puzzleById,
  view,
} from "../lib/game";
import type { State } from "../lib/types";
const fresh = (): State => ({ players: {}, daily: {}, rooms: {} });
const create = (s: State) =>
  command(
    s,
    "alice",
    { action: "create", name: "Alice", rounds: 3, duration: 25 },
    1000,
  )!;
describe("rules", () => {
  it("normalizes punctuation, case, spaces and accents", () =>
    expect(normalize("  CÁt!!   toy ")).toBe("cat toy"));
  it("accepts configured aliases and misspellings only", () => {
    const p = { answer: "pineapple", aliases: ["pinapple"] };
    expect(accepted("PINAPPLE!", p)).toBe(true);
    expect(accepted("apple", p)).toBe(false);
  });
  it("uses authoritative stage boundaries", () => {
    expect(stageAt(1000, 25, 999)).toBe(1);
    expect(stageAt(1000, 25, 5999)).toBe(1);
    expect(stageAt(1000, 25, 6000)).toBe(2);
    expect(stageAt(1000, 25, 90000)).toBe(5);
  });
  it("scores stages without speed bonus", () =>
    expect([1, 2, 3, 4, 5, 6].map(score)).toEqual([
      500, 400, 300, 200, 100, 0,
    ]));
  it("shares ranks on ties", () =>
    expect(
      ranking([{ points: 300 }, { points: 100 }, { points: 300 }]).map(
        (p) => p.rank,
      ),
    ).toEqual([1, 1, 3]));
  it("switches daily only at UTC midnight", () =>
    expect(
      dailyAt(Date.UTC(2026, 0, 2)) - dailyAt(Date.UTC(2026, 0, 1, 23, 59, 59)),
    ).toBe(1));
  it("normalizes room codes", () =>
    expect(normalizeCode(" ab-cd2 ")).toBe("ABCD2"));
});
describe("authoritative game", () => {
  it("preserves completed daily runs and deduplicates retries", () => {
    const s = fresh();
    const a = { action: "dailyGuess", text: "wrong", key: "one" };
    command(s, "alice", a, 1000);
    command(s, "alice", a, 1000);
    expect(dailyRun(s, "alice", 1000).guesses).toHaveLength(1);
    const answer = puzzleById(dailyRun(s, "alice", 1000).puzzle).answer;
    command(
      s,
      "alice",
      { action: "dailyGuess", text: answer, key: "two" },
      1000,
    );
    command(s, "alice", { action: "skip" }, 1000);
    expect(dailyRun(s, "alice", 1000).guesses).toHaveLength(2);
    expect(dailyRun(s, "alice", 1000).solved).toBe(true);
  });
  it("rejects empty guesses without consuming attempts", () => {
    const s = fresh();
    expect(() =>
      command(s, "alice", { action: "dailyGuess", text: "..." }, 1000),
    ).toThrow("Enter a guess");
    expect(dailyRun(s, "alice", 1000).guesses).toHaveLength(0);
  });
  it("blocks non-host start, outsider guesses, and unready starts", () => {
    const s = fresh();
    const code = create(s);
    command(s, "bob", { action: "join", code }, 1000);
    expect(() => command(s, "bob", { action: "start", code }, 1000)).toThrow(
      "Only the host",
    );
    expect(() =>
      command(s, "eve", { action: "partyGuess", code, text: "cat" }, 1000),
    ).toThrow("Join this room");
    expect(() => command(s, "alice", { action: "start", code }, 1000)).toThrow(
      "Everyone",
    );
  });
  it("does not leak answer keys or future images and awards once", () => {
    const s = fresh();
    const code = create(s);
    command(s, "bob", { action: "join", code }, 1000);
    for (const id of ["alice", "bob"])
      command(s, id, { action: "ready", code }, 1000);
    command(s, "alice", { action: "start", code }, 1000);
    const r = s.rooms[code];
    const answer = puzzleById(r.roundData!.puzzle).answer;
    command(
      s,
      "alice",
      { action: "partyGuess", code, text: answer, key: "same" },
      5000,
    );
    command(
      s,
      "alice",
      { action: "partyGuess", code, text: answer, key: "same" },
      5000,
    );
    expect(r.members[0].points).toBe(500);
    expect(view(s, "bob", "room", code, 5000).room?.feed).toEqual([]);
    expect(view(s, "bob", "room", code, 5000).room?.answer).toBeUndefined();
    expect(() => authorizedImage(s, "eve", "room", code)).toThrow();
  });
  it("enforces one guess per stage and filters text", () => {
    const s = fresh();
    const code = create(s);
    command(s, "bob", { action: "join", code }, 1000);
    for (const id of ["alice", "bob"])
      command(s, id, { action: "ready", code }, 1000);
    command(s, "alice", { action: "start", code }, 1000);
    expect(() =>
      command(s, "alice", { action: "partyGuess", code, text: "shit" }, 5000),
    ).toThrow("Try another");
    command(s, "alice", { action: "partyGuess", code, text: "nonsense" }, 5000);
    expect(() =>
      command(s, "alice", { action: "partyGuess", code, text: "cat" }, 5000),
    ).toThrow("One guess");
    command(
      s,
      "alice",
      { action: "partyGuess", code, text: "nonsense" },
      10000,
    );
    expect(s.rooms[code].roundData?.guesses).toHaveLength(2);
  });
  it("reconstructs rounds from persisted deadlines and transfers host", () => {
    const s = fresh();
    const code = create(s);
    command(s, "bob", { action: "join", code }, 1000);
    for (const id of ["alice", "bob"])
      command(s, id, { action: "ready", code }, 1000);
    command(s, "alice", { action: "start", code }, 1000);
    command(s, "alice", { action: "leave", code }, 5000);
    expect(s.rooms[code].host).toBe("bob");
    advance(s.rooms[code], 35000);
    expect(s.rooms[code].round).toBe(2);
  });
  it("locks entry to spectators and resets a rematch", () => {
    const s = fresh();
    const code = create(s);
    command(s, "bob", { action: "join", code }, 1000);
    for (const id of ["alice", "bob"])
      command(s, id, { action: "ready", code }, 1000);
    command(s, "alice", { action: "start", code }, 1000);
    command(s, "charlie", { action: "join", code }, 5000);
    expect(s.rooms[code].members[2].spectator).toBe(true);
    s.rooms[code].status = "finished";
    s.rooms[code].used = Array.from(
      { length: 10 },
      (_, i) => `a${String(i + 1).padStart(2, "0")}`,
    );
    command(s, "alice", { action: "rematch", code }, 5000);
    expect(s.rooms[code].repeat).toBe(false);
    expect(
      s.rooms[code].members.every(
        (m) => !m.ready && !m.spectator && m.points === 0,
      ),
    ).toBe(true);
  });
});
