import fs from "node:fs/promises";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
const puzzles = JSON.parse(await fs.readFile("content/puzzles.json", "utf8"));
await fs.mkdir("content/originals", { recursive: true });
await fs.mkdir("content/prepared", { recursive: true });
for (const p of puzzles) {
  const path = `content/originals/${p.id}.jpg`;
  try {
    await fs.access(path);
  } catch {
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--max-time",
        "45",
        "--retry",
        "2",
        `https://images.unsplash.com/photo-${p.photo}?auto=format&fit=crop&w=900&h=900&q=90`,
        "--output",
        path,
      ],
      { stdio: "pipe" },
    );
  }
  const base = await sharp(path)
    .resize(720, 720, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
  for (let stage = 1; stage <= 6; stage++) {
    const size = [12, 22, 42, 90, 240, 720][stage - 1];
    const small = await sharp(base).resize(size, size).toBuffer();
    await sharp(small)
      .resize(720, 720, { kernel: "nearest" })
      .webp({ quality: 85 })
      .toFile(`content/prepared/${p.id}-${stage}.webp`);
  }
  console.log(`Prepared ${p.id}: six private images`);
}
