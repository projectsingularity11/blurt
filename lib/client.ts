import type { View } from "./types";
async function sessionRequest<T>(request: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("blurt-session", request);
  return request();
}
export async function api(
  action: string,
  data: Record<string, unknown> = {},
): Promise<View & { code?: string }> {
  return sessionRequest(async () => {
    const r = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, key: crypto.randomUUID(), ...data }),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "Try again");
    return value;
  });
}
export async function load(mode: string, code = ""): Promise<View> {
  return sessionRequest(async () => {
    const r = await fetch(
      `/api/game?mode=${mode}&code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "Try again");
    return value;
  });
}
export async function copy(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw Error("Copy unavailable");
}
export function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function shareText(
  number: number,
  guesses: { correct: boolean }[],
  link: string,
) {
  return `blurt. #${number}\n${guesses.map((g) => (g.correct ? "🟦" : "▫️")).join("")}\n${link}`;
}
