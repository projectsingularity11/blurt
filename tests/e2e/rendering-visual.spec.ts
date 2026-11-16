import { test, expect } from "@playwright/test";
import sharp from "sharp";

// Compare the optimized surface to the original live CSS gradients, at the same
// animation time. This guards the design without committing screenshot fixtures.
const scenes = [1440, 768, 375].flatMap((width) =>
  (["light", "dark"] as const).map((theme) => ({ width, theme, phase: 5000 })),
);
scenes.push({ width: 1440, theme: "light", phase: 4933 });
for (const { width, theme, phase } of scenes) {
  test(`preserves ${theme} lighting at ${width}px${phase === 4933 ? " between cache updates" : ""}`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const captures: Buffer[] = [];
    for (const optimized of [false, true]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      try {
        const response = await context.request.get(
          `${baseURL}/effects/aero-lighting.worker.js`,
        );
        expect(response.ok()).toBe(true);
        const source = await response.text();
        await context.addInitScript(
          ({ source, optimized, theme, phase }) => {
            localStorage.setItem("blurt-theme", theme);
            const Native = window.Worker;
            window.Worker = new Proxy(Native, {
              construct(_target, args) {
                if (!optimized) throw Error("Use CSS reference");
                const frozen =
                  `const raf=self.requestAnimationFrame.bind(self);self.requestAnimationFrame=fn=>raf(()=>fn(${phase}));Object.defineProperty(performance,'timeOrigin',{value:0});\n` +
                  source;
                const worker = new Native(
                  URL.createObjectURL(
                    new Blob([frozen], { type: "text/javascript" }),
                  ),
                  args[1],
                );
                const post = worker.postMessage.bind(worker);
                worker.postMessage = (
                  message,
                  transferOrOptions?:
                    | Transferable[]
                    | StructuredSerializeOptions,
                ) => {
                  if (message.type === "init") message.started = [0, 0, 0];
                  if (Array.isArray(transferOrOptions))
                    post(message, transferOrOptions);
                  else post(message, transferOrOptions);
                };
                return worker;
              },
            });
          },
          { source, optimized, theme, phase },
        );
        const page = await context.newPage();
        await page.goto(baseURL!);
        await page.evaluate(() => document.fonts.ready);
        if (optimized)
          await expect(page.locator(".aero-world")).toHaveClass(
            /has-light-cache/,
          );
        await page.evaluate(async () => {
          const animations = document.getAnimations();
          for (const animation of animations) animation.pause();
          await Promise.all(animations.map((animation) => animation.ready));
          for (const animation of animations) animation.currentTime = 5000;
        });
        // Allow the worker's already-drawn surface to be presented.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        captures.push(await page.screenshot());
      } finally {
        await context.close();
      }
    }
    const [reference, cached] = await Promise.all(
      captures.map((buffer) => sharp(buffer).removeAlpha().raw().toBuffer()),
    );
    let total = 0,
      outsideRounding = 0;
    for (let i = 0; i < reference.length; i++) {
      const difference = Math.abs(reference[i] - cached[i]);
      total += difference;
      if (difference > 5) outsideRounding++;
    }
    await testInfo.attach("color-difference", {
      body: JSON.stringify({
        width,
        theme,
        mean: total / reference.length,
        outsideRounding: outsideRounding / reference.length,
      }),
      contentType: "application/json",
    });
    if (outsideRounding / reference.length >= 0.001) {
      await testInfo.attach("reference", {
        body: captures[0],
        contentType: "image/png",
      });
      await testInfo.attach("cached", {
        body: captures[1],
        contentType: "image/png",
      });
    }
    expect(
      total / reference.length,
      "mean color-channel difference out of 255",
    ).toBeLessThan(0.75);
    expect(
      outsideRounding / reference.length,
      "channels outside rounding tolerance",
    ).toBeLessThan(0.001);
  });
}
