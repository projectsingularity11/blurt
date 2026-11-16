import { test, expect } from "@playwright/test";
for (const mode of ["free", "flash"])
  test(`${mode} solo mode persists reveals and finishes a real run`, async ({
    page,
  }) => {
    await page.goto(`/play/${mode}`);
    await page.getByRole("button", { name: "Let’s play" }).click();
    await expect(
      page.getByRole("textbox", { name: "Your guess" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".puzzle-frame img")
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page
      .getByRole("textbox", { name: "Your guess" })
      .fill("a very unlikely unicorn");
    await page.getByRole("button", { name: "Guess", exact: true }).click();
    await expect(page.getByLabel("Reveal 2 of 5")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Reveal 2 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Finish run" }).click();
    await expect(
      page.getByRole("button", { name: "Play again" }),
    ).toBeVisible();
  });
