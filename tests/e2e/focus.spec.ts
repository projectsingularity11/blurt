import { test, expect } from "@playwright/test";
test("keeps keyboard focus through successive guesses and the next picture", async ({
  page,
}) => {
  await page.goto("/play/free");
  await page.getByRole("button", { name: "Let’s play" }).click();
  const input = page.getByRole("textbox", { name: "Your guess" });
  await expect(input).toBeFocused();
  await input.fill("purple dinosaur spaceship");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toBeEditable();
  await page.keyboard.type("a different incorrect answer");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Reveal 3 of 5")).toBeVisible();
  await expect(input).toBeFocused();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Skip reveal", exact: true })
      .click();
  await page.getByRole("button", { name: "Next picture" }).click();
  await expect(input).toBeFocused();
});
