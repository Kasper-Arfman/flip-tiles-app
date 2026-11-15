// Ranked mode in the built game: a game won, leaving and reloading count as losses, and the
// leaderboards (with the server answered by the test, so no real server is needed).
import { expect, test, type Page } from "@playwright/test";
import { MASKS, solveFlips } from "../src/game/flipTiles";
import { fewestForcesSolution } from "../src/ranked/puzzles";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  // (the leaderboard calls fail in this test server unless a test answers them: not an error here)
  page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && list.push(m.text()));
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("CapacitorStorage.tutorial-done-v1", "true");
  });
  await page.goto("about:blank");
  await page.goto("./#/");
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

// A set of flips that together change nothing on the board (the 5x5 board has a few): the flips
// of the first row decide the rest, so try each first row
const QUIET: number[] = (() => {
  for (let first = 1; first < 32; first++) {
    let state = 0;
    const flips: number[] = [];
    for (let k = 0; k < 25; k++) {
      if (k < 5 ? (first >>> k) & 1 : (state >>> (k - 5)) & 1) {
        state ^= MASKS[k];
        flips.push(k);
      }
    }
    if (state === 0) return flips;
  }
  throw new Error("no quiet set");
})();

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("CapacitorStorage.ranked-v1") ?? "null"));

// Choose a mode and difficulty in the lobby and press Play
async function play(page: Page, mode: "moves" | "flips", difficulty: number) {
  await page.locator(".ranked-entry").click();
  await expect(page).toHaveURL(/#\/ranked$/);
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator(`[data-difficulty="${difficulty}"]`).click();
  await page.locator(".play-ranked").click();
  await expect(page).toHaveURL(/#\/ranked\/play$/);
  await expect(page.locator(".ranked-play .tile").first()).toBeVisible();
}

test("a game won in the right number of moves", async ({ page }) => {
  await play(page, "moves", 4);
  const { active } = await saved(page);
  expect(active).toMatchObject({ mode: "moves", difficulty: 4 });
  const { flips, forces } = fewestForcesSolution(active.board, 4)!;
  for (const k of forces) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click({ button: "right" });
  for (const k of flips) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
  await expect(page.locator(".ranked-result")).toBeVisible();
  await expect(page.locator(".ranked-result .result-detail")).toContainText("Solved in 4 moves");
  const after = await saved(page);
  expect(after.active).toBeNull();
  expect(after.games).toHaveLength(1);
  expect(after.games[0]).toMatchObject({ won: true, difficulty: 4 });
  await page.locator(".ranked-done").click();
  await expect(page.locator(".ranked-stats")).toContainText("1"); // (one game in the record)
});

test("a solve with too many flips doesn't count before 4:00", async ({ page }) => {
  await play(page, "flips", 2);
  const { active } = await saved(page);
  const best = solveFlips(active.board)!;
  // Two extra flips on the same tile cancel out, so: flip another tile, solve, and the board is
  // not solved; instead check the count: 3 flips shown as over the limit
  const other = [...Array(25).keys()].find((k) => !best.includes(k))!;
  await page.locator(`.ranked-play .tile[data-tile="${other}"]`).click();
  for (const k of best) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
  await expect(page.locator(".ranked-progress .count")).toHaveText("(3/2)");
  await expect(page.locator(".ranked-progress .count")).toHaveClass(/over/);
  // Take the extra flip back: solved in 2, a win
  await page.locator(`.ranked-play .tile[data-tile="${other}"]`).click();
  await expect(page.locator(".ranked-result")).toBeVisible();
});

test("after 4:00 a solve with more flips counts; at 5:00 the time is up", async ({ page }) => {
  await page.clock.install(); // (the page's clock, to fast-forward)
  await page.goto("about:blank");
  await page.goto("./#/");
  await play(page, "flips", 2);
  const { active } = await saved(page);
  // A longer flips-only solution: the best one, toggled by a set of flips that changes nothing
  const longer = [...new Set([...solveFlips(active.board)!, ...QUIET])]
    .filter((k) => solveFlips(active.board)!.includes(k) !== QUIET.includes(k));
  expect(longer.length).toBeGreaterThan(2);
  for (const k of longer) {
    await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
    await page.clock.runFor(500); // (the board's own animations run on timers too)
  }
  // Solved, with too many flips before 4:00: not a win, it says so
  await expect(page.locator(".ranked-play")).toHaveClass(/too-many/);
  await expect(page.locator(".ranked-result")).toBeHidden();
  // At 4:00 the same solve on the board counts
  await page.clock.runFor(4 * 60_000);
  await page.clock.runFor(2000); // (the result shows after the board's Solved! animation)
  await expect(page.locator(".ranked-result")).toBeVisible();
  expect((await saved(page)).games[0]).toMatchObject({ won: true, moves: longer });

  // A second game: wait out the clock
  await page.locator(".ranked-again").click();
  await page.clock.runFor(4 * 60_000 + 1000);
  await expect(page.locator(".ranked-phase")).toContainText("More flips allowed");
  await page.clock.runFor(60_000);
  await expect(page.locator(".ranked-result .result-title")).toHaveText("Time's up");
  const after = await saved(page);
  expect(after.games.map((g: { won: boolean; time: number }) => [g.won, g.time])).toEqual([[true, after.games[0].time], [false, 300_000]]);
});

test("leaving a game asks first, and then counts as a loss", async ({ page }) => {
  await play(page, "flips", 3);
  // Stay: the game goes on
  page.once("dialog", (d) => d.dismiss());
  await page.locator(".ranked-play .up").click();
  await expect(page).toHaveURL(/#\/ranked\/play$/);
  expect((await saved(page)).active).not.toBeNull();
  // Leave: a loss
  page.once("dialog", (d) => d.accept());
  await page.locator(".ranked-play .up").click();
  await expect(page).toHaveURL(/#\/ranked$/);
  const after = await saved(page);
  expect(after.active).toBeNull();
  expect(after.games[0]).toMatchObject({ won: false, time: 300_000 });
});

test("reloading (closing the app) during a game counts as a loss, and says so", async ({ page }) => {
  await play(page, "moves", 3);
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  await expect(page.locator(".ranked-notice")).toContainText("counted as a loss");
  expect((await saved(page)).games[0]).toMatchObject({ won: false });
});

test("the leaderboards: join, and see yourself", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/ranked/games", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    await route.fulfill({ json: { accepted: body.games.map((g: { id: string }) => g.id), rejected: [] } });
  });
  await page.route("**/api/ranked/leaderboard*", (route) => route.fulfill({
    json: {
      board: "overall", players: 2, me: null,
      entries: [{ rank: 1, name: "Ann", value: 900, games: 12, me: false }, { rank: 2, name: "Kasper", value: 450, games: 6, me: true }],
    },
  }));
  // A game first (a loss), so there is something to send
  await play(page, "moves", 2);
  page.once("dialog", (d) => d.accept());
  await page.locator(".give-up").click();
  await page.locator(".ranked-done").click();
  await page.locator(".leaderboards-link").click();
  expect(sent).toEqual([]); // (nothing sent before joining)
  await page.locator(".join-form input").fill("Kasper");
  await page.locator(".join-form button").click();
  await expect(page.locator(".leaderboard-list li.me")).toContainText("Kasper (you)");
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ name: "Kasper", games: [{ won: false }] });
});

test("the leaderboards offline: a message, and the game still plays", async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready); // (the game's files saved for offline)
  await context.setOffline(true);
  await page.goto("./#/ranked/leaderboard");
  await expect(page.locator(".leaderboard")).toContainText("need a connection");
  await page.goto("./#/");
  await play(page, "flips", 2);
  await context.setOffline(false);
});
