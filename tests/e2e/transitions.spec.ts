import { test, expect } from "@playwright/test";
test("uses page transitions without loading the removed 3D renderer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document);
    if (start) {
      Object.defineProperty(window, "blurtTransitionCount", {
        value: 0,
        writable: true,
      });
      document.startViewTransition = (options) => {
        (window as unknown as { blurtTransitionCount: number })
          .blurtTransitionCount++;
        return start(options);
      };
    }
  });
  await page.goto("/");
  await expect(page.locator(".bubble-shell")).toHaveCount(12);
  expect(await page.locator("canvas").count()).toBe(0);
  await page.getByRole("link", { name: /Free Bloom/ }).click();
  await expect(
    page.getByRole("heading", { name: "Free Bloom", exact: true }),
  ).toBeVisible();
  const count = await page.evaluate(
    () =>
      (window as unknown as { blurtTransitionCount?: number })
        .blurtTransitionCount,
  );
  if (count !== undefined) expect(count).toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((r) => /garden|\.glb|draco/.test(r.name)),
    ),
  ).toBe(false);
});
