export const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
export const normalizeCode = (s: string) =>
  s.toUpperCase().replace(/[^A-Z2-9]/g, "");
export const accepted = (
  guess: string,
  puzzle: { answer: string; aliases: string[] },
) =>
  [puzzle.answer, ...puzzle.aliases].map(normalize).includes(normalize(guess));
export const stageAt = (starts: number, duration: number, now = Date.now()) =>
  Math.min(
    5,
    Math.max(1, Math.floor((now - starts) / ((duration * 1000) / 5)) + 1),
  );
export const score = (stage: number) =>
  stage >= 1 && stage <= 5 ? (6 - stage) * 100 : 0;
export const dailyAt = (now = Date.now()) => Math.floor(now / 86400000);
export const ranking = <T extends { points: number }>(players: T[]) =>
  [...players]
    .sort((a, b) => b.points - a.points)
    .map((p, _, all) => ({
      ...p,
      rank: all.filter((q) => q.points > p.points).length + 1,
    }));
export const newCode = () =>
  Array.from(
    { length: 5 },
    () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[
        crypto.getRandomValues(new Uint32Array(1))[0] % 32
      ],
  ).join("");
