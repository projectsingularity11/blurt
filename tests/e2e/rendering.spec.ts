import { test, expect } from "@playwright/test";

test("caches ambient light while preserving the Aero scene", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".aero-world")).toHaveClass(/has-light-cache/);
  await expect(page.locator(".aero-light-cache")).toBeVisible();
  await expect(page.locator(".aero-light-cache")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator(".glass-planet")).toHaveCount(2);
  await expect(page.locator(".bubble-shell")).toHaveCount(12);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page
          .locator(".aero-light-cache")
          .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
      )
      .toBe(Math.round(width * (await page.evaluate(() => devicePixelRatio))));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.getByRole("link", { name: /Free Bloom/ }).click();
  await expect(
    page.getByRole("heading", { name: "Free Bloom", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".aero-world")).toHaveClass(/has-light-cache/);
});

test("preserves the CSS scene if workers are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = new Proxy(window.Worker, {
      construct() {
        throw new Error("Worker unavailable");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-identity")).toBeVisible();
  await expect(page.locator(".aero-light-cache")).toHaveCount(0);
  await expect(page.locator(".aero-sun")).toBeVisible();
  await expect(page.locator(".aero-clouds")).toBeVisible();
  await expect(page.locator(".aero-lightwash")).toBeVisible();
});

test("starts and stops the cache with the motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".aero-light-cache")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".aero-world")).toHaveClass(/has-light-cache/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".aero-light-cache")).toHaveCount(0);
  await expect(page.locator(".aero-lightwash")).toHaveCSS(
    "animation-name",
    "none",
  );
});
