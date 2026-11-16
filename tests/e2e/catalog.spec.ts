import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import sources from "../../content/sources.json";
test("shares a durable no-repeat history across solo modes and restarts", async ({
  page,
}) => {
  const seen = new Set<string>();
  for (const mode of ["free", "flash", "free"]) {
    await page.goto(`/play/${mode}`);
    await page
      .getByRole("button", { name: "Let’s play", exact: true })
      .or(page.getByRole("button", { name: "Play again", exact: true }))
      .click();
    await expect(
      page.getByRole("textbox", { name: "Your guess" }),
    ).toBeVisible();
    const bytes = await (
      await page.request.get(`/api/image?mode=solo&code=${mode.toUpperCase()}`)
    ).body();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const picture = sources.find((p) =>
      p.assets.some((a) => a.sha256 === hash),
    );
    expect(picture).toBeTruthy();
    expect(seen.has(picture!.id)).toBe(false);
    seen.add(picture!.id);
    await page
      .getByRole("textbox", { name: "Your guess" })
      .fill(picture!.answer);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: picture!.answer, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("+500 points", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Finish run" }).click();
  }
  expect(seen.size).toBe(3);
});
