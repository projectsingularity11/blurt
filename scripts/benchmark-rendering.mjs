// Compare two production builds in one browser under an identical workload.
// BASELINE_URL=http://localhost:3030 BASE_URL=http://localhost:3031 node scripts/benchmark-rendering.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const urls = { before: process.env.BASELINE_URL, after: process.env.BASE_URL };
if (!urls.before || !urls.after) throw Error("Set BASELINE_URL and BASE_URL");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  for (let run = 0; run < 3; run++)
    for (const [version, url] of Object.entries(urls)) {
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      if (version === "after") await page.locator(".has-light-cache").waitFor();
      await page.waitForTimeout(2500);
      for (const workload of ["idle", "pointer"]) {
        const recording = page.evaluate(
          () =>
            new Promise((resolve) => {
              const samples = [];
              let previous;
              const end = performance.now() + 4000;
              function tick(time) {
                if (previous !== undefined) samples.push(time - previous);
                previous = time;
                if (time < end) requestAnimationFrame(tick);
                else {
                  samples.sort((a, b) => a - b);
                  resolve({
                    frames: samples.length,
                    averageMs:
                      samples.reduce((a, b) => a + b, 0) / samples.length,
                    p95Ms: samples[Math.floor(samples.length * 0.95)],
                    slowFrames: samples.filter((v) => v > 25).length,
                  });
                }
              }
              requestAnimationFrame(tick);
            }),
        );
        if (workload === "pointer")
          for (let i = 0; i < 110; i++) {
            await page.mouse.move(
              720 + Math.cos(i * 0.12) * 650,
              500 + Math.sin(i * 0.15) * 390,
            );
            await page.waitForTimeout(13);
          }
        const result = { run, version, workload, ...(await recording) };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }
} finally {
  await browser.close();
}
if (process.env.PERF_OUTPUT)
  await writeFile(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2));
const median = (values) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const workload of ["idle", "pointer"]) {
  const values = {};
  for (const version of ["before", "after"]) {
    const rows = results.filter(
      (r) => r.workload === workload && r.version === version,
    );
    values[version] = {
      averageMs: median(rows.map((r) => r.averageMs)),
      p95Ms: median(rows.map((r) => r.p95Ms)),
      slowFrames: median(rows.map((r) => r.slowFrames)),
    };
  }
  console.log(JSON.stringify({ workload, median: values }));
  if (
    process.env.PERF_ASSERT === "1" &&
    values.after.averageMs >= values.before.averageMs * 0.8
  )
    throw Error(
      `Rendering gain is below the 20% regression budget for ${workload}`,
    );
}
