import { resolve } from "node:path";
import fs from "node:fs/promises";
const root = process.cwd(),
  cache = resolve(process.env.BLURT_CATALOG_DIR || ".cache/blurt-catalog");
const candidates = Object.keys(
  JSON.parse(await fs.readFile(`${cache}/candidates.json`, "utf8")),
);
const byTitle = new Map();
for (const filename of await fs.readdir(cache)) {
  const match = filename.match(/^wiki-(\d+)\.json$/);
  if (!match) continue;
  const start = +match[1];
  const q =
    JSON.parse(await fs.readFile(`${cache}/${filename}`, "utf8")).query || {};
  const links = new Map(
    [...(q.normalized || []), ...(q.redirects || [])].map((x) => [
      x.from,
      x.to,
    ]),
  );
  for (let name of candidates.slice(start, start + 40)) {
    const alias = name;
    for (let i = 0; i < 8; i++) name = links.get(name) || name;
    const set = byTitle.get(name) || new Set();
    set.add(alias);
    byTitle.set(name, set);
  }
}
const normalize = (s) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
const special = {
  airplane: ["plane", "aeroplane"],
  "mobile phone": ["phone", "cellphone", "cell phone"],
  "fixed-wing aircraft": ["airplane", "plane", "aeroplane"],
  spectacles: ["glasses", "eyeglasses"],
  "bell pepper": ["pepper", "sweet pepper"],
  "auto rickshaw": ["tuk tuk", "tuktuk"],
  coriander: ["cilantro"],
  "garbanzo bean": ["chickpea"],
  chickpea: ["garbanzo bean"],
  motorcycle: ["motorbike"],
  earphones: ["earbuds"],
  headphones: ["headset"],
  eggplant: ["aubergine"],
  zucchini: ["courgette"],
  cookie: ["biscuit"],
  "sugar snap pea": ["pea", "peas"],
};
const kinds = [
  "duck",
  "eagle",
  "hawk",
  "owl",
  "sparrow",
  "penguin",
  "parrot",
  "finch",
  "woodpecker",
  "gull",
  "tern",
  "warbler",
  "heron",
  "falcon",
  "swan",
  "goose",
  "pigeon",
  "dove",
  "robin",
  "wren",
  "loon",
  "snipe",
  "kingfisher",
  "hummingbird",
  "sandpiper",
  "grebe",
  "petrel",
  "albatross",
  "puffin",
  "ibis",
  "flamingo",
  "vulture",
  "oriole",
  "blackbird",
  "swallow",
  "pintail",
  "weaver",
  "thrush",
  "crow",
  "raven",
  "cockatoo",
  "macaw",
  "roadrunner",
  "shrike",
  "flycatcher",
  "cormorant",
  "pelican",
  "lark",
  "bunting",
  "bustard",
  "kite",
  "shearwater",
  "piper",
  "plover",
];
const source = JSON.parse(
  await fs.readFile(`${root}/content/sources.json`, "utf8"),
);
let added = 0;
for (const p of source) {
  let aliases = [
    ...p.aliases,
    ...(byTitle.get(p.article) || []),
    ...(special[p.answer] || []),
  ];
  for (const kind of kinds)
    if (new RegExp(`\\b${kind}\\b`, "i").test(p.answer)) aliases.push(kind);
  if (
    p.category === "Animals" &&
    /breed of.*dog|dog breed|breed of hound|breed of spaniel|breed of terrier/i.test(
      p.description,
    )
  )
    aliases.push("dog");
  if (
    p.category === "Animals" &&
    /breed of.*cat|cat breed/i.test(p.description)
  )
    aliases.push("cat");
  const used = new Set([normalize(p.answer)]);
  p.aliases = aliases
    .map((a) => a.trim())
    .filter((a) => {
      const n = normalize(a);
      if (n.length < 2 || n.length > 60 || used.has(n)) return false;
      used.add(n);
      return true;
    });
  added += p.aliases.length;
}
const catalog = JSON.parse(
  await fs.readFile(`${root}/content/puzzles.json`, "utf8"),
);
const byId = new Map(source.map((p) => [p.id, p]));
for (const p of catalog) {
  const q = byId.get(p.id);
  if (q) p.aliases = q.aliases;
}
await fs.writeFile(
  `${root}/content/sources.json`,
  JSON.stringify(source, null, 2) + "\n",
);
await fs.writeFile(
  `${root}/content/puzzles.json`,
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log("Accepted aliases", added);
