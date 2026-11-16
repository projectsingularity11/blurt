import { it, expect } from "vitest";
import catalog from "../content/puzzles.json";
import sources from "../content/sources.json";
import summary from "../content/catalog-summary.json";
import { normalize } from "../lib/rules";
it("ships a licensed, high-resolution, non-repeating audited catalog", () => {
  const fresh = catalog.filter((p) => p.release === "photographs-v2");
  expect(fresh.length).toBeGreaterThan(2000);
  expect(new Set(fresh.map((p) => normalize(p.answer))).size).toBe(
    fresh.length,
  );
  expect(new Set(fresh.map((p) => p.id)).size).toBe(fresh.length);
  expect(new Set(sources.map((p) => p.sourceSha1)).size).toBe(sources.length);
  expect(new Set(sources.map((p) => p.pixelHash)).size).toBe(sources.length);
  expect(fresh.filter((p) => p.daily)).toHaveLength(366);
  expect(fresh.filter((p) => !p.daily)).toHaveLength(summary.stack);
  expect(sources).toHaveLength(summary.total);
  for (const p of sources) {
    expect(Math.max(p.width, p.height)).toBeGreaterThanOrEqual(1080);
    expect(p.author).toBeTruthy();
    expect(p.license).toMatch(/CC BY|CC0|Public domain|PDM/i);
    expect(p.sourceFileUrl).toMatch(/^https:\/\/commons.wikimedia.org\//);
    expect(p.assets).toHaveLength(6);
    expect(new Set(p.assets.map((a) => a.name)).size).toBe(6);
    for (const a of p.assets) expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(p.assets[0].bytes).toBeLessThan(5000);
    expect(new Set(p.aliases.map(normalize)).size).toBe(p.aliases.length);
  }
});
