import { test, expect } from "@playwright/test";
test("private Realtime subscribes through the authenticated stream", async ({
  page,
}) => {
  await page.goto("/party/create");
  await page.getByRole("textbox", { name: "Your name" }).fill("Realtime test");
  await page.getByRole("button", { name: "Create Party", exact: true }).click();
  await expect(page.getByText("The guessing crew")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({
    timeout: 25000,
  });
});
