// Smoke tests: the main ways through the game, in the built app, in a real browser. They don't
// check every detail (the unit tests in tests/ do that); they check that nothing is broken:
// every screen opens without an error, a level can be played and solved, what is earned is kept,
// the coin pack works (test builds), and the game plays offline.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const levels = JSON.parse(readFileSync("src/levels/levels.json", "utf8"));
const testBuild = /export const TEST_BUILD = true/.test(readFileSync("src/dev.ts", "utf8"));

// Every error on the page fails the test (checked at the end of each test)
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (m) => m.type() === "error" && list.push(m.text()));
  // The leaderboards' server (the home screen asks it for the world's #1): an empty leaderboard,
  // also offline (these tests are about the game, not the server: see ranked.spec.ts)
  await page.route("**/api/ranked/**", (route) =>
    route.fulfill({ json: { board: "overall", entries: [], me: null, players: 0, accepted: [], rejected: [] } }));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

// A player past the tutorial, with some coins and maybe stages bought (saved as the game saves,
// then the game opened again on the home screen; a new player's first visit is sent to the
// tutorial, so the address is set back)
async function returningPlayer(page: Page, coins = 500, unlocked: number[] = []) {
  await page.goto("./");
  await page.evaluate(([coins, unlocked]) => {
    localStorage.clear();
    localStorage.setItem("CapacitorStorage.tutorial-done-v1", "true");
    localStorage.setItem("CapacitorStorage.wallet-v1", JSON.stringify({ version: 3, coins, unlocked }));
  }, [coins, unlocked] as const);
  await page.goto("about:blank"); // (closed, then opened afresh: the game reads the save)
  await page.goto("./#/");
  await expect(page.locator(".home-screen")).toBeVisible();
}

const tile = (page: Page, k: number) => page.locator(`.level-screen .tile[data-tile="${k}"]`);
const coinTotal = async (page: Page) => Number(await page.locator(".coin-total").textContent());

// Play a level's fewest-moves solution: the forces (right-click), then the flips
async function solve(page: Page, level: { solutionMoves: { flips: number[]; forces: number[] } }) {
  for (const k of level.solutionMoves.forces) await tile(page, k).click({ button: "right" });
  for (const k of level.solutionMoves.flips) await tile(page, k).click();
  await expect(page.locator(".result")).toBeVisible();
}

test("a new player plays the tutorial, and the stars are kept", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page).toHaveURL(/#\/level\/1\/1$/);
  const [tap, hold] = levels.tiers[0].levels;
  await solve(page, tap);
  await page.locator(".next-level").click();
  await expect(page).toHaveURL(/#\/level\/1\/2$/);
  await solve(page, hold);
  await page.locator(".next-level").click();
  await expect(page.locator(".home-screen")).toBeVisible();
  const stars = await page.locator(".wealth .pill").first().textContent();
  expect(Number(stars!.trim().split(" ")[0])).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(page.locator(".home-screen")).toBeVisible(); // (no tutorial again)
  expect(await page.locator(".wealth .pill").first().textContent()).toBe(stars);
});

test("every screen opens", async ({ page }) => {
  await returningPlayer(page);
  for (const [hash, selector] of [
    ["#/", ".home-screen"], ["#/how-to-play", ".how-to-play-screen"], ["#/shop", ".shop-screen"],
    ["#/codex", ".codex-screen"], ["#/tier/1", ".tier-screen"], ["#/level/1/3", ".level-screen .tile"],
    ["#/debug", ".debug-screen"],
  ]) {
    await page.goto(`./${hash}`);
    await expect(page.locator(selector).first(), hash).toBeVisible();
  }
});

test("a level with no forces refuses a force, one with forces takes them until they run out", async ({ page }) => {
  // The first level of the first stage after Alpha that starts flips-only (bought, so it's open)
  const tier = levels.tiers.find((t: typeof levels.tiers[0], i: number) => i > 0 && !t.levels[0].solutionMoves.forces.length);
  await returningPlayer(page, 500, [tier.difficulty]);
  await page.goto(`./#/level/${tier.difficulty}/1`);
  await expect(page.locator(".available-forces")).toContainText("none");
  const board = () => page.locator(".level-screen .tile.one").evaluateAll((tiles) => tiles.map((t) => t.dataset.tile).join());
  const before = await board();
  await tile(page, 0).click({ button: "right" });
  expect(await board()).toBe(before);
  // Alpha 2 (the tutorial's force): one force, then no more
  await page.goto("./#/level/1/2");
  await expect(page.locator(".available-forces .force-slot.filled")).toHaveCount(1);
  await tile(page, 0).click({ button: "right" });
  await expect(page.locator(".available-forces .force-slot.filled")).toHaveCount(0);
  const after = await board();
  await tile(page, 1).click({ button: "right" });
  expect(await board()).toBe(after);
});

test("the coin pack gives 100 coins (test build)", async ({ page }) => {
  test.skip(!testBuild, "a release build: the coin pack is only in the apps, with the store");
  await returningPlayer(page, 10);
  await page.goto("./#/shop");
  await page.locator(".buy-coins").click();
  await page.goto("./#/");
  await expect.poll(() => coinTotal(page)).toBe(110);
  await page.reload();
  await expect.poll(() => coinTotal(page)).toBe(110);
});

test("the debug screen opens from the version, and its checks pass", async ({ page }) => {
  await returningPlayer(page);
  const version = page.locator(".app-version");
  for (let i = 0; i < 5; i++) await version.click();
  await expect(page).toHaveURL(/#\/debug$/);
  await page.locator(".run-checks").click();
  await expect(page.locator(".check-result")).toContainText("All good", { timeout: 20_000 });
});

test("the game plays offline once it has been opened (the web version)", async ({ page, context }) => {
  await returningPlayer(page);
  await page.evaluate(() => navigator.serviceWorker.ready); // (the files are saved on the device)
  await page.reload(); // (the service worker now serves the page)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.goto("./#/level/1/3");
  await expect(page.locator(".level-screen .tile").first()).toBeVisible();
  await context.setOffline(false);
});
