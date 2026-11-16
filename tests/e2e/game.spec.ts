import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import puzzles from "../../content/puzzles.json";
import sources from "../../content/sources.json";
import { createHash } from "node:crypto";
import type { State } from "../../lib/types";
function state() {
  const db = new DatabaseSync(".data/blurt.sqlite", { readOnly: true });
  try {
    return JSON.parse(
      (
        db.prepare("SELECT payload FROM game_state WHERE id=1").get() as {
          payload: string;
        }
      ).payload,
    ) as State;
  } finally {
    db.close();
  }
}
for (const width of [375, 768, 1440])
  test(`title menu and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("link", { name: /Daily Bloom/ })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // The existing Aero design scrolls naturally on shorter screens; verify
    // that all content is reachable instead of forcing it into one viewport.
    const footer = page.locator(".aero-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `test-results/menu-${width}.png` });
    await page.getByRole("button", { name: "How to play" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("link", { name: /Petal Party/ }).click();
    await expect(
      page.getByRole("heading", { name: "Get the room together" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/daily");
    await expect(
      page.getByRole("textbox", { name: "Your guess" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".puzzle-frame img")
          .evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/daily-${width}.png` });
    const current = await page.request.get("/api/image?mode=daily");
    const future = await page.request.get(
      "/api/image?mode=daily&stage=6&file=a01-6.webp",
    );
    expect(await current.body()).toEqual(await future.body());
  });
test("theme persists and daily survives reload; share is spoiler-free", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: /Daily Bloom/ }).click();
  await page
    .getByRole("textbox", { name: "Your guess" })
    .fill("definitely not this");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await expect(page.getByText("Reveal 2 of 5", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("definitely not this", { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Skip this reveal" }).click();
  await expect(page.getByRole("heading")).toBeVisible();
  const answer = await page.getByRole("heading").innerText();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Share result" }).click();
  await expect(page.getByRole("status")).toContainText("Copied");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.toLowerCase()).not.toContain(
    answer.toLowerCase().replace(".", ""),
  );
  expect(text).toContain("blurt. #");
  await page.reload();
  await expect(page.getByText("Not this time")).toBeVisible();
});
test("two isolated sessions: lobby, authorization, scoring, reconnect, results and rematch", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const c = await browser.newContext();
  const watcher = await c.newPage();
  const shown = new Set<string>();
  const alice = await a.newPage();
  const bob = await b.newPage();
  try {
    await alice.goto("/party/create");
    await alice.getByRole("textbox", { name: "Your name" }).fill("Alice");
    await alice.getByRole("button", { name: "3 rounds" }).click();
    if (process.env.CLOUD_TEST) {
      await alice.locator("summary").click();
      await alice.getByLabel("Round duration").selectOption("40");
    }
    await alice
      .getByRole("button", { name: "Create Party", exact: true })
      .click();
    await expect(alice.getByText("The guessing crew")).toBeVisible();
    const code = new URL(alice.url()).pathname.split("/").pop()!;
    await bob.goto(`/party/${code}`);
    await expect(bob.getByRole("textbox", { name: "Room code" })).toHaveValue(
      code,
    );
    await bob.getByRole("textbox", { name: "Your name" }).fill("Bob");
    await bob.getByRole("button", { name: "Join Party", exact: true }).click();
    await expect(
      alice.locator(".player-name").filter({ hasText: "Bob" }),
    ).toBeVisible();
    await expect(alice.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    const forbidden = await b.request.post("/api/game", {
      data: { action: "start", code },
    });
    expect(forbidden.status()).toBe(400);
    for (const p of [alice, bob])
      await p.getByRole("button", { name: "I’m ready" }).click();
    await expect(
      alice.getByRole("button", { name: "Start game" }),
    ).toBeEnabled();
    await alice.getByRole("button", { name: "Start game" }).click();
    if (process.env.CLOUD_TEST) {
      await watcher.goto(`/party/join?code=${code}`);
      await watcher.getByRole("textbox", { name: "Your name" }).fill("Charlie");
      await watcher
        .getByRole("button", { name: "Join Party", exact: true })
        .click();
      await expect(
        watcher.getByText("Join the next match after watching this one"),
      ).toBeVisible();
      await expect(alice.getByRole("textbox", { name: "Your guess" })).toBeEditable();
      const blocked = await c.request.post("/api/game", {
        data: {
          action: "partyGuess",
          code,
          text: "cat",
          key: crypto.randomUUID(),
        },
      });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).error).toBe("You are spectating");
    }
    for (let n = 1; n <= 3; n++) {
      await expect(
        alice.getByText(`Round ${n} of 3`, { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        alice.getByRole("textbox", { name: "Your guess" }),
      ).toBeEnabled({ timeout: 10000 });
      let answer: string;
      if (process.env.CLOUD_TEST) {
        const snapshot = await (
          await a.request.get(`/api/game?mode=room&code=${code}`)
        ).json();
        const bytes = await (
          await a.request.get(`/api/image?mode=room&code=${code}`)
        ).body();
        const hash = createHash("sha256").update(bytes).digest("hex");
        const source = sources.find((p) =>
          p.assets.some((a) => a.sha256 === hash),
        );
        const picture = source
          ? puzzles.find((p) => p.id === source.id)
          : puzzles
              .filter((p) => p.id.startsWith("a"))
              .find((p) =>
                bytes.equals(
                  readFileSync(
                    `content/prepared/${p.id}-${snapshot.room.stage}.webp`,
                  ),
                ),
              );
        if (!picture) throw Error("Unknown test photograph");
        shown.add(picture.id);
        answer = picture.answer;
      } else {
        const r = state().rooms[code];
        answer = puzzles.find((p) => p.id === r.roundData!.puzzle)!.answer;
      }
      await alice.getByRole("textbox", { name: "Your guess" }).fill(answer);
      await alice.getByRole("button", { name: "Guess", exact: true }).click();
      await expect(alice.getByText(/Got it \+\d+/)).toBeVisible();
      const snapshot = await (
        await b.request.get(`/api/game?mode=room&code=${code}`)
      ).json();
      expect(snapshot.room.answer).toBeUndefined();
      expect(snapshot.room.feed).toHaveLength(0);
      if (n === 1) {
        await alice.reload();
        await expect(alice.getByText(/Got it \+\d+/)).toBeVisible();
      }
      await bob.getByRole("textbox", { name: "Your guess" }).fill(answer);
      await bob.getByRole("button", { name: "Guess", exact: true }).click();
      await expect(
        bob.getByRole("heading", { name: `${answer}`, exact: false }),
      ).toBeVisible({ timeout: 5000 });
    }
    await expect(alice.getByText("That’s a wrap")).toBeVisible({
      timeout: 15000,
    });
    if (process.env.CLOUD_TEST) {
      await expect(alice.locator(".scoreboard li")).toHaveCount(2);
    } else {
      await expect(
        alice.getByRole("heading", { name: "Alice & Bob" }),
      ).toBeVisible();
    }
    if (process.env.CLOUD_TEST) {
      await watcher.goto("/play/free");
      await watcher.getByRole("button", { name: "Let’s play" }).click();
      const bytes = await (
        await c.request.get("/api/image?mode=solo&code=FREE")
      ).body();
      const hash = createHash("sha256").update(bytes).digest("hex");
      const next = sources.find((p) => p.assets.some((a) => a.sha256 === hash));
      expect(next).toBeTruthy();
      expect(shown.has(next!.id)).toBe(false);
    }
    await alice.getByRole("button", { name: "Play again" }).click();
    await expect(bob.getByText("The guessing crew")).toBeVisible();
    await expect(
      alice.getByRole("button", { name: "I’m ready" }),
    ).toBeVisible();
  } finally {
    await Promise.all([a.close(), b.close(), c.close()]);
  }
});

test("an expired guest session has an explicit recovery path", async ({
  page,
  context,
}) => {
  test.skip(!process.env.CLOUD_TEST, "Supabase guest-session integration");
  await context.addCookies([
    {
      name: "sb-buwlkrqbbhsxyepeqjim-auth-token",
      value: "base64-invalid",
      url: process.env.BASE_URL || "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/daily");
  await expect(
    page.getByRole("button", { name: "Continue as new guest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue as new guest" }).click();
  await expect(page.getByRole("textbox", { name: "Your guess" })).toBeVisible();
  const cookies = (await context.cookies()).filter((c) =>
    c.name.startsWith("sb-"),
  );
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every((c) => c.httpOnly)).toBe(true);
});
