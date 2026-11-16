import { resolve } from "node:path";
const cache = resolve(process.env.BLURT_CATALOG_DIR || ".cache/blurt-catalog");
const root = process.cwd();
import fs from "node:fs/promises";
import sharp from "sharp";
let all = JSON.parse(await fs.readFile(`${cache}/prepared.json`, "utf8"));
// Short descriptions catch ambiguous breed names that resolve to cities or regions.
const descriptions = new Map();
for (const name of await fs.readdir("${cache}"))
  if (/^wiki-\d+\.json$/.test(name)) {
    const data = JSON.parse(await fs.readFile("${cache}/" + name, "utf8"));
    for (const page of data.query?.pages || [])
      descriptions.set(
        page.title,
        page.pageprops?.["wikibase-shortdesc"] || "",
      );
  }
const rejected = [];
all = all.filter((p) => {
  const desc = descriptions.get(p.article) || "";
  p.description = desc;
  const wrong =
    /\b(capital|city|region|country|municipality|suburb|neighborhood|neighbourhood|language|ethnic group|people of|politician|actor|singer|album|software|television series|company|airline|brand|disambiguation)\b/i.test(
      desc,
    );
  if ((p.category === "Animals" || p.category === "Food") && wrong) {
    rejected.push({ id: p.id, answer: p.answer, reason: desc });
    return false;
  }
  if (
    p.category === "Animals" &&
    /\bplant|trees?|shrub|flower|fruit|vegetable\b/i.test(desc)
  ) {
    rejected.push({ id: p.id, answer: p.answer, reason: desc });
    return false;
  }
  if (/\b(genus|family|order|clade) of\b/i.test(desc) && !p.daily) {
    rejected.push({
      id: p.id,
      answer: p.answer,
      reason: "Broad taxonomic group",
    });
    return false;
  }
  return true;
});
const cosine = Array.from({ length: 8 }, (_, u) =>
  Array.from({ length: 32 }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / 64),
  ),
);
async function phash(path) {
  const b = await sharp(path)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const temp = Array.from({ length: 8 }, () => new Float64Array(32));
  for (let u = 0; u < 8; u++)
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) temp[u][y] += b[y * 32 + x] * cosine[u][x];
  const c = [];
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 32; y++) s += temp[u][y] * cosine[v][y];
      c.push(s);
    }
  const sorted = c.slice(1).sort((a, b) => a - b);
  const median = sorted[31];
  return c.reduce((n, v, i) => (v > median ? n | (1n << BigInt(i)) : n), 0n);
}
function distance(a, b) {
  let n = a ^ b,
    count = 0;
  while (n) {
    n &= n - 1n;
    count++;
    if (count > 4) return count;
  }
  return count;
}
const kept = [],
  duplicates = [];
const priorNames = new Set([
  "cat",
  "dog",
  "pineapple",
  "camera",
  "bicycle",
  "strawberry",
  "coffee",
  "elephant",
  "mountain",
  "ocean",
]);
for (const p of all) {
  if (priorNames.has(p.answer)) {
    rejected.push({
      id: p.id,
      answer: p.answer,
      reason: "Existing launch puzzle subject",
    });
    continue;
  }
  const h = await phash(`${root}/content/originals/${p.id}.jpg`);
  const same = kept.find((q) => distance(h, q.hash) <= 4);
  if (same) {
    duplicates.push({ id: p.id, answer: p.answer, similar: same.answer });
    continue;
  }
  kept.push({ ...p, hash: h });
  if (kept.length % 100 === 0) console.log("Deduplicated", kept.length);
}
// Keep one full year reserved, filling a dropped duplicate from the remaining unique catalog.
let daily = kept.filter((p) => p.daily).length;
for (const p of kept) {
  if (daily >= 366) break;
  if (!p.daily) {
    p.daily = true;
    daily++;
  }
}
if (daily < 366) throw Error("Daily schedule lacks unique pictures");
const prior = JSON.parse(
  await fs.readFile(`${root}/content/puzzles.json`, "utf8"),
).filter((p) => p.id.startsWith("a"));
const catalog = prior.map((p) => ({
  ...p,
  retired: true,
  release: "photographs-v1",
  daily: false,
  credit: {
    author: "",
    license: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
    sourceUrl: `https://images.unsplash.com/photo-${p.photo}`,
  },
}));
for (const p of kept)
  catalog.push({
    id: p.id,
    answer: p.answer,
    aliases: p.aliases,
    category: p.category,
    photo: "",
    release: "photographs-v2",
    daily: !!p.daily,
    retired: false,
    sourceSha1: p.sourceSha1,
    credit: {
      author: p.author,
      license: p.license,
      licenseUrl: p.licenseUrl,
      sourceUrl: p.sourceFileUrl,
    },
  });
await fs.writeFile(
  `${root}/content/puzzles.json`,
  JSON.stringify(catalog, null, 2) + "\n",
);
const sources = kept.map((p) => {
  const copy = { ...p };
  delete copy.hash;
  delete copy.summary;
  return copy;
});
await fs.writeFile(
  `${root}/content/sources.json`,
  JSON.stringify(sources, null, 2) + "\n",
);
await fs.writeFile(`${cache}/rejected.json`, JSON.stringify(rejected, null, 2));
await fs.writeFile(
  `${cache}/duplicates.json`,
  JSON.stringify(duplicates, null, 2),
);
const summary = {
  total: kept.length,
  daily: 366,
  stack: kept.length - 366,
  categories: Object.fromEntries(
    ["Animals", "Food", "Objects", "Nature"].map((c) => [
      c,
      kept.filter((p) => p.category === c && !p.daily).length,
    ]),
  ),
  source: "Wikimedia Commons",
  resolution: 1080,
};
await fs.writeFile(
  `${root}/content/catalog-summary.json`,
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  "FINAL CATALOG",
  summary,
  "similar images excluded",
  duplicates.length,
);
