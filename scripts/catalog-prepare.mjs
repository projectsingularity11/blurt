import { resolve } from "node:path";
const cache = resolve(process.env.BLURT_CATALOG_DIR || ".cache/blurt-catalog");
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
const root = process.cwd();
const source = JSON.parse(await fs.readFile(`${cache}/licensed.json`, "utf8"));
const normalize = (s) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
const common = new Set();
for (const filename of [
  "animals-common",
  "objects-objects",
  "objects-clothing",
  "technology-appliances",
  "foods-fruits",
  "foods-vegetables",
  "plants-flowers",
]) {
  try {
    const o = JSON.parse(
      await fs.readFile(`${cache}/${filename}.json`, "utf8"),
    );
    const walk = (x) => {
      if (typeof x === "string" && x.length < 45) common.add(normalize(x));
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object")
        Object.entries(x)
          .filter(([k]) => k !== "description")
          .forEach(([, v]) => walk(v));
    };
    walk(o);
  } catch {}
}
const seen = new Set(),
  hashes = new Set();
const pool = [];
for (const p of source) {
  if (Math.max(p.width, p.height) < 1080) continue;
  if (
    /^(list of|glossary of|history of|outline of|types of|index of|comparison of)\b/.test(
      p.answer,
    ) ||
    p.answer.length > 43
  )
    continue;
  if (
    /\b(surname|politician|novelist|television|rapper|programming|sexual|penis|vagina|fuck|suicide|cannabis|killing|pornograph|blood tongue)\b/i.test(
      p.answer + " " + p.summary,
    )
  )
    continue;
  if (
    /\b(genus|clade|taxon|family|extinct|dinosaur)\b/.test(
      p.summary.toLowerCase(),
    ) &&
    !common.has(normalize(p.answer)) &&
    p.answer.split(" ").length === 1
  )
    continue;
  if (p.answer.length < 3 || p.author.length > 400) continue;
  const n = normalize(p.answer);
  if (seen.has(n) || hashes.has(p.sourceSha1)) continue;
  seen.add(n);
  hashes.add(p.sourceSha1);
  p.id =
    "p" +
    crypto.createHash("sha256").update(p.sourceSha1).digest("hex").slice(0, 15);
  p.priority =
    (common.has(n) ? 0 : 1) * 100 +
    p.answer.split(" ").length * 3 +
    p.answer.length / 10;
  p.aliases = [p.answer.replace(/-/g, " "), p.answer.replace(/-/g, "")].filter(
    (a) => a !== p.answer,
  );
  if (p.answer.includes(" and ")) continue;
  pool.push(p);
}
pool.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
const daily = [];
const cats = ["Animals", "Food", "Objects", "Nature"];
while (daily.length < 366) {
  let count = 0;
  for (const cat of cats) {
    const p = pool.find(
      (p) => !p.daily && p.category === cat && p.priority < 120,
    );
    if (p) {
      p.daily = true;
      daily.push(p);
      count++;
      if (daily.length === 366) break;
    }
  }
  if (!count) throw Error("Not enough daily subjects");
}
const selected = [...daily];
const rest = pool.filter((p) => !p.daily);
const cap = 3072;
let cursor = 0;
while (selected.length < cap && rest.length) {
  const category = cats[cursor++ % cats.length];
  const i = rest.findIndex((p) => p.category === category);
  if (i >= 0) selected.push(rest.splice(i, 1)[0]);
  else if (cursor > cap * 5) break;
}
await fs.mkdir(`${root}/content/originals`, { recursive: true });
await fs.mkdir(`${root}/content/prepared`, { recursive: true });
let done = 0;
const successes = [],
  errors = [];
const binaryHashes = new Set();
let next = 0;
async function prepare(p) {
  const original = `${root}/content/originals/${p.id}.jpg`;
  let data;
  try {
    data = await fs.readFile(original);
  } catch {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(p.downloadUrl.split("?")[0], {
          headers: {
            "User-Agent":
              "BLURT/3.0 (licensed picture game; https://blurt-eight.vercel.app)",
          },
          signal: AbortSignal.timeout(40000),
        });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        data = Buffer.from(await r.arrayBuffer());
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    await fs.writeFile(original, data);
  }
  const base = await sharp(data)
    .rotate()
    .resize(1080, 1080, {
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const digest = crypto.createHash("sha256").update(base).digest("hex");
  if (binaryHashes.has(digest)) throw Error("Duplicate decoded image");
  binaryHashes.add(digest);
  const assets = [];
  for (let stage = 1; stage <= 6; stage++) {
    const size = [12, 22, 42, 90, 240, 1080][stage - 1];
    const filename = `${p.id}-${stage}.webp`;
    let bytes;
    try {
      bytes = await fs.readFile(`${root}/content/prepared/${filename}`);
      if ((await sharp(bytes).metadata()).width !== size)
        throw Error("Resize required");
    } catch {
      bytes = await sharp(base)
        .resize(size, size)
        .webp({
          quality: stage === 6 ? 90 : 86,
          lossless: stage <= 3,
          effort: 3,
        })
        .toBuffer();
      await fs.writeFile(`${root}/content/prepared/${filename}`, bytes);
    }
    assets.push({
      name: filename,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return { ...p, pixelHash: digest, assets };
}
console.log(
  "Selected",
  selected.length,
  "daily",
  daily.length,
  "available after filtering",
  pool.length,
);
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < selected.length) {
      const p = selected[next++];
      try {
        successes.push(await prepare(p));
      } catch (e) {
        errors.push({ id: p.id, answer: p.answer, error: e.message });
      }
      if (++done % 40 === 0) {
        await fs.writeFile(
          `${cache}/prepared-progress.json`,
          JSON.stringify(successes),
        );
        console.log(
          "Prepared",
          done,
          "success",
          successes.length,
          "errors",
          errors.length,
        );
      }
    }
  }),
);
await fs.writeFile(`${cache}/prepared.json`, JSON.stringify(successes));
await fs.writeFile(`${cache}/errors.json`, JSON.stringify(errors));
console.log(
  "DONE",
  successes.length,
  "DAILY",
  successes.filter((p) => p.daily).length,
  "BYTES",
  successes.reduce(
    (sum, p) => sum + p.assets.reduce((s, a) => s + a.bytes, 0),
    0,
  ),
);
