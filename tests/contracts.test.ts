import { it, expect } from "vitest";
import { commandInput } from "../lib/contracts";
const key = "11111111-1111-4111-8111-111111111111";
it("rejects caller-controlled identity, correctness, stage and points", () => {
  for (const extra of [
    { player: "someone-else" },
    { correct: true },
    { stage: 1 },
    { points: 500 },
    { reservedCode: "ABCDE" },
  ])
    expect(
      commandInput.safeParse({
        action: "partyGuess",
        code: "ABCDE",
        text: "cat",
        key,
        ...extra,
      }).success,
    ).toBe(false);
});
it("requires idempotency for guesses and creation", () => {
  expect(
    commandInput.safeParse({ action: "dailyGuess", text: "cat" }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({ action: "create", name: "Alice" }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({ action: "dailyGuess", text: "cat", key }).success,
  ).toBe(true);
});
it("bounds content and settings before it reaches the game", () => {
  expect(
    commandInput.safeParse({
      action: "partyGuess",
      code: "ABCDE",
      text: "x".repeat(81),
      key,
    }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({
      action: "create",
      name: "Alice",
      rounds: 100,
      key,
    }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({
      action: "create",
      name: "Alice",
      duration: 1,
      key,
    }).success,
  ).toBe(false);
});
it("requires membership targets and names for room actions", () => {
  expect(
    commandInput.safeParse({ action: "join", code: "ABCDE" }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({ action: "remove", code: "ABCDE" }).success,
  ).toBe(false);
  expect(
    commandInput.safeParse({ action: "partyGuess", text: "cat", key }).success,
  ).toBe(false);
});
