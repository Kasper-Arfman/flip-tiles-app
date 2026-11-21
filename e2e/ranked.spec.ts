// Ranked mode in the built game: a game won, leaving and reloading count as losses, and the
// leaderboards (with the server answered by the test, so no real server is needed).
import { expect, test, type Page } from "@playwright/test";
import { MASKS, solveFlips } from "../src/game/flipTiles";
import { readFileSync } from "node:fs";
import { fewestForcesSolution } from "../src/ranked/puzzles";

// The levels, as the game saves their stars: by the board's standard form (as levels.ts works it
// out: the lowest of its turns, mirror images and color swaps)
const SYM = [(r: number, c: number) => [r, c], (r: number, c: number) => [c, 4 - r], (r: number, c: number) => [4 - r, 4 - c],
  (r: number, c: number) => [4 - c, r], (r: number, c: number) => [r, 4 - c], (r: number, c: number) => [4 - r, c],
  (r: number, c: number) => [c, r], (r: number, c: number) => [4 - c, 4 - r]]
  .map((f) => Array.from({ length: 25 }, (_, k) => { const [r, c] = f(Math.floor(k / 5), k % 5); return r * 5 + c; }));
const keyOf = (board: string) => {
  const bits = board.replace(/\s/g, "");
  let best = 2 ** 25 - 1;
  for (const p of SYM) {
    let t = 0;
    for (let k = 0; k < 25; k++) if (bits[k] === "1") t |= 1 << p[k];
    best = Math.min(best, t, (2 ** 25 - 1) ^ t);
  }
  return Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => (best >>> (r * 5 + c)) & 1).join("")).join(" ");
};
type JsonLevel = { board: string; minMoves: number };
const TIERS: { difficulty: number; levels: (JsonLevel & { key: string })[] }[] =
  JSON.parse(readFileSync("src/levels/levels.json", "utf8")).tiers.map((t: { difficulty: number; levels: JsonLevel[] }) =>
    ({ difficulty: t.difficulty, levels: t.levels.map((l) => ({ ...l, key: keyOf(l.board) })) }));

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  // (the leaderboard calls fail in this test server unless a test answers them: not an error here)
  page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && list.push(m.text()));
  await page.goto("./");
  // A player with every stage complete (every star), so every ranked difficulty is open
  const stars = Object.fromEntries(TIERS.flatMap((t) => t.levels).map((l) => [l.key, 7]));
  await page.evaluate((stars) => {
    localStorage.clear();
    localStorage.setItem("CapacitorStorage.tutorial-done-v1", "true");
    localStorage.setItem("CapacitorStorage.progress-v1", JSON.stringify(stars));
  }, stars);
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

test("a difficulty is locked until its levels have the mode's star; the popup says which", async ({ page }) => {
  // Every star except: one 4-move level of Epsilon (5) without its fewest-moves star, and one
  // level of Zeta (6) without its flips-only star
  const stars = Object.fromEntries(TIERS.flatMap((t) => t.levels).map((l) => [l.key, 7]));
  const epsilon = TIERS.find((t) => t.difficulty === 5)!.levels.find((l) => l.minMoves === 4)!;
  stars[epsilon.key] = 3;
  stars[TIERS.find((t) => t.difficulty === 6)!.levels[0].key] = 5;
  await page.evaluate((stars) => localStorage.setItem("CapacitorStorage.progress-v1", JSON.stringify(stars)), stars);
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  // Flips only comes first, and is the default
  await expect(page.locator(".shop-tab").first()).toHaveText("Flips only");
  await expect(page.locator('[data-mode="flips"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".difficulty-picker .locked")).toHaveCount(1);
  await expect(page.locator('[data-locked="6"]')).toBeVisible();
  await page.locator('[data-mode="moves"]').click();
  // Fewest moves 4: locked by the 4-move group of Epsilon; 5 open
  await expect(page.locator('[data-difficulty="5"]')).toBeEnabled();
  await expect(page.locator(".difficulty-picker .locked")).toHaveCount(1);
  await page.locator('[data-locked="4"]').click();
  const popup = page.locator(".unlock-dialog");
  await expect(popup).toBeVisible();
  await expect(popup.locator("li:not(.complete)")).toHaveCount(1);
  await expect(popup.locator("li:not(.complete)")).toContainText("Epsilon · 4 moves");
  // The link: to that group on Epsilon's screen
  await popup.locator("li:not(.complete) a").click();
  await expect(page).toHaveURL(/#\/tier\/5$/);
  await expect(page.locator(".unlock-dialog")).toHaveCount(0);
  // ... scrolled to and flashing: the 4-move levels, not the others
  await expect(page.locator('li[data-moves="4"] .level-tile.flash').first()).toBeVisible();
  await expect(page.locator('li[data-moves="3"] .level-tile.flash')).toHaveCount(0);
  await expect(page.locator('.grade-label[data-moves="4"]')).toBeInViewport();
  // A new player: everything locked, Play too
  await page.evaluate(() => localStorage.removeItem("CapacitorStorage.progress-v1"));
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  await expect(page.locator(".play-ranked")).toBeDisabled();
  await expect(page.locator(".ranked-screen")).toContainText("Tap a locked difficulty to see which stars open it.");
});

test("a game won in the right number of moves", async ({ page }) => {
  await play(page, "moves", 4);
  const { active } = await saved(page);
  expect(active).toMatchObject({ mode: "moves", difficulty: 4 });
  const { flips, forces } = fewestForcesSolution(active.board, 4)!;
  for (const k of forces) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click({ button: "right" });
  for (const k of flips) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
  await expect(page.locator(".ranked-result")).toBeVisible();
  await expect(page.locator(".ranked-result .result-title")).toBeHidden(); // (a win: only the buttons)
  await expect(page.locator(".ranked-play .flip-tiles")).toHaveClass(/is-solved/);
  // The score's change: from 5:00 (before the first game) down, so better, in green
  await expect(page.locator(".score-change")).toHaveClass(/settled/);
  await expect(page.locator(".score-change")).toHaveClass(/better/);
  await expect(page.locator(".score-delta")).toContainText("▼");
  const after = await saved(page);
  expect(after.active).toBeNull();
  expect(after.games).toHaveLength(1);
  expect(after.games[0]).toMatchObject({ won: true, difficulty: 4 });
  await page.locator(".ranked-done").click();
  await expect(page.locator(".ranked-stats")).toContainText("1"); // (one game in the record)
});

test("a solve with too many flips doesn't count", async ({ page }) => {
  await play(page, "flips", 4);
  const { active } = await saved(page);
  const best = solveFlips(active.board)!;
  // Two extra flips on the same tile cancel out, so: flip another tile, solve, and the board is
  // not solved; instead check the count: 3 flips shown as over the limit
  const other = [...Array(25).keys()].find((k) => !best.includes(k))!;
  await page.locator(`.ranked-play .tile[data-tile="${other}"]`).click();
  for (const k of best) await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
  await expect(page.locator(".ranked-progress .count")).toHaveText("(5/4)");
  await expect(page.locator(".ranked-progress .count")).toHaveClass(/over/);
  // Take the extra flip back: solved in 4, a win
  await page.locator(`.ranked-play .tile[data-tile="${other}"]`).click();
  await expect(page.locator(".ranked-result")).toBeVisible();
});

test("a longer solve never counts; hints from 3:00, one more every 30s; at 5:00 the time is up", async ({ page }) => {
  await page.clock.install(); // (the page's clock, to fast-forward)
  await page.goto("about:blank");
  await page.goto("./#/");
  await play(page, "flips", 4);
  const { active } = await saved(page);
  // A longer flips-only solution: the best one, toggled by a set of flips that changes nothing
  const longer = [...new Set([...solveFlips(active.board)!, ...QUIET])]
    .filter((k) => solveFlips(active.board)!.includes(k) !== QUIET.includes(k));
  expect(longer.length).toBeGreaterThan(2);
  for (const k of longer) {
    await page.locator(`.ranked-play .tile[data-tile="${k}"]`).click();
    await page.clock.runFor(500); // (the board's own animations run on timers too)
  }
  // Solved, with too many flips: not a win, and no Solved! (the board just shows it)
  await expect(page.locator(".ranked-play")).toHaveClass(/too-many/);
  await expect(page.locator(".ranked-play .flip-tiles")).not.toHaveClass(/is-solved/);
  await expect(page.locator(".ranked-result")).toBeHidden();
  const marks = page.locator(".ranked-play .tile.flip");
  await expect(marks).toHaveCount(0);
  // At 3:00 the first hint; the longer solve still doesn't count
  await page.clock.runFor(3 * 60_000);
  await expect(marks).toHaveCount(1);
  await expect(page.locator(".ranked-phase")).toContainText("1 hint");
  await expect(page.locator(".ranked-result")).toBeHidden();
  // 30 seconds later: two
  await page.clock.runFor(30_000);
  await expect(marks).toHaveCount(2);
  // At 5:00 the time is up
  await page.clock.runFor(90_000);
  await expect(page.locator(".ranked-result .result-title")).toHaveText("Time's up");
  const after = await saved(page);
  expect(after.games.map((g: { won: boolean; time: number }) => [g.won, g.time])).toEqual([[false, 300_000]]);
});

test("leaving a game asks first, and then counts as a loss", async ({ page }) => {
  await play(page, "flips", 5);
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
  await play(page, "moves", 5);
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
  await play(page, "moves", 4);
  page.once("dialog", (d) => d.accept());
  await page.locator(".give-up").click();
  await page.locator(".ranked-done").click();
  await page.locator(".leaderboards-link").click();
  expect(sent).toEqual([]); // (nothing sent before joining)
  await page.locator(".join-form input").fill("Kasper");
  await page.locator(".join-form button").click();
  // (joining sends the games, then fetches the leaderboard: slower when all tests run at once)
  await expect(page.locator(".leaderboard-list li.me")).toContainText("Kasper (you)", { timeout: 10_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ name: "Kasper", games: [{ won: false }], scores: { "moves-4": 300_000 } });
});

test("a leaderboard in pages of 10, your position under it, and Around me", async ({ page }) => {
  // A joined player at place 40 of 60 (the server answered by the test, by offset and limit)
  await page.evaluate(() => localStorage.setItem("CapacitorStorage.ranked-v1", JSON.stringify({
    deviceId: "test-device-0001", name: "Kasper", joined: true, games: [], uploaded: [], refused: [], active: null,
    choice: { mode: "flips", difficulty: 4 }, cutOff: 0,
  })));
  const all = Array.from({ length: 60 }, (_, i) => ({ rank: i + 1, name: i === 39 ? "Kasper" : `P${i + 1}`, value: 10_000 + i * 1000, games: 5, me: i === 39 }));
  await page.route("**/api/ranked/leaderboard*", (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    return route.fulfill({ json: { board: url.searchParams.get("board"), players: 60, me: all[39], entries: all.slice(offset, offset + limit) } });
  });
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  // The name: on the Ranked screen
  await expect(page.locator(".welcome")).toContainText("Welcome Kasper");
  await page.locator(".leaderboards-link").click();
  const rows = page.locator(".leaderboard-list:not(.mine) li");
  await expect(rows).toHaveCount(10);
  await expect(page.locator(".page-range")).toHaveText("1–10 of 60");
  await expect(page.locator(".page-prev")).toBeDisabled();
  await expect(page.locator(".leaderboard-list.mine li")).toContainText("Kasper (you)");
  await expect(page.locator(".leaderboard-list.mine .rank")).toHaveText("40");
  await page.locator(".page-next").click();
  await expect(page.locator(".page-range")).toHaveText("11–20 of 60");
  // Around me: place 40 in the middle (35–44), and no extra row of yours under it
  await page.locator(".page-me").click();
  await expect(page.locator(".page-range")).toHaveText("35–44 of 60");
  await expect(rows.nth(5)).toHaveClass(/me/);
  await expect(page.locator(".leaderboard-list.mine")).toHaveCount(0);
  await page.locator(".page-next").click();
  await page.locator(".page-next").click();
  await expect(page.locator(".page-range")).toHaveText("55–60 of 60");
  await expect(page.locator(".page-next")).toBeDisabled();
  await page.locator(".page-top").click();
  await expect(page.locator(".page-range")).toHaveText("1–10 of 60");
  // The #1: a crown right before the name, which stays in line with the others
  await expect(rows.first()).toHaveClass(/first/);
  await expect(rows.first().locator(".first-crown")).toHaveCount(1);
  const x = async (i: number) => (await rows.nth(i).locator(".name").boundingBox())!.x;
  expect(await x(0)).toBe(await x(1));
});

test("the leaderboards offline: a message, and the game still plays", async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready); // (the game's files saved for offline)
  await page.reload(); // (and the service worker in charge of the page)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.goto("./#/ranked/leaderboard");
  await expect(page.locator(".leaderboard")).toContainText("need a connection");
  await page.goto("./#/");
  await play(page, "flips", 4);
  await context.setOffline(false);
});

test("your record shows your position on the leaderboard, or offline", async ({ page, context }) => {
  // A joined player with 5 games of Fewest moves 4 (losses)
  const games = Array.from({ length: 5 }, (_, i) => ({
    id: `seeded-game-${i}`, mode: "moves", difficulty: 4, board: 1, moves: [], time: 300_000, won: false, playedAt: Date.now(),
  }));
  await page.evaluate((games) => localStorage.setItem("CapacitorStorage.ranked-v1", JSON.stringify({
    deviceId: "test-device-1", name: "Kasper", joined: true, games, uploaded: games.map((g) => g.id), active: null,
    choice: { mode: "moves", difficulty: 4 }, cutOff: 0,
  })), games);
  await page.route("**/api/ranked/leaderboard*", (route) => route.fulfill({
    json: { board: "moves-4", players: 7, entries: [], me: { rank: 2, name: "Kasper", value: 300_000, games: 5, me: true } },
  }));
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  await expect(page.locator(".ranked-position")).toHaveText("#2 of 7");
  await page.evaluate(() => navigator.serviceWorker.ready); // (the game's files saved for offline)
  await page.reload(); // (and the service worker in charge of the page)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.unroute("**/api/ranked/leaderboard*");
  await context.setOffline(true);
  await page.goto("about:blank");
  await page.goto("./#/ranked");
  await expect(page.locator(".ranked-position")).toHaveText("offline");
  await context.setOffline(false);
});

test("the leaderboards' back arrow goes back where you came from", async ({ page }) => {
  await page.route("**/api/ranked/**", (route) => route.fulfill({ json: { board: "overall", entries: [], me: null, players: 0 } }));
  await page.locator(".leaderboard-button").click(); // (the gold button on the home screen)
  await expect(page).toHaveURL(/#\/ranked\/leaderboard$/);
  await page.locator(".leaderboard-screen .up").click();
  await expect(page.locator(".home-screen")).toBeVisible();
  await page.locator(".ranked-entry").click();
  await page.locator(".leaderboards-link").click();
  await page.locator(".leaderboard-screen .up").click();
  await expect(page).toHaveURL(/#\/ranked$/);
});

test("the lobby's Leaderboards link opens the leaderboard of the mode and difficulty chosen", async ({ page }) => {
  await page.route("**/api/ranked/**", (route) => route.fulfill({ json: { board: "flips-6", entries: [], me: null, players: 0 } }));
  await page.locator(".ranked-entry").click();
  await page.locator('[data-mode="flips"]').click();
  await page.locator('[data-difficulty="6"]').click();
  await page.locator(".leaderboards-link").click();
  await expect(page.locator(".board-choice select")).toHaveValue("flips-6");
});

test("a very hard flips-only level asks first, once its fewest-moves star is earned", async ({ page }) => {
  // Alpha's hardest flips-only level (more flips than the stage's number): only its
  // fewest-moves star (1 + 4)
  const alpha = TIERS.find((t) => t.difficulty === 1)!;
  const json = JSON.parse(readFileSync("src/levels/levels.json", "utf8")).tiers[0].levels as { minFlips: number }[];
  const i = json.findIndex((l) => l.minFlips > 1);
  const stars = Object.fromEntries(TIERS.flatMap((t) => t.levels).map((l) => [l.key, 7]));
  stars[alpha.levels[i].key] = 5;
  await page.evaluate((stars) => localStorage.setItem("CapacitorStorage.progress-v1", JSON.stringify(stars)), stars);
  await page.goto("about:blank");
  await page.goto("./#/tier/1");
  const tile = page.locator(".level-tile").nth(i);
  // Practice first: back home
  await tile.click();
  await expect(page.locator(".flips-warning")).toContainText(/the flips-only solution is very hard/i);
  await page.locator(".flips-warning .practice").click();
  await expect(page).toHaveURL(/#\/$/);
  // Yes: the level
  await page.goto("./#/tier/1");
  await page.locator(".level-tile").nth(i).click();
  await page.locator(".flips-warning .play-anyway").click();
  await expect(page).toHaveURL(new RegExp(`#/level/1/${i + 1}$`));
  // A level without the warning opens at once
  await page.goto("./#/tier/1");
  await page.locator(".level-tile").nth(i === 0 ? 1 : 0).click();
  await expect(page).toHaveURL(/#\/level\/1\/\d$/);
  await expect(page.locator(".flips-warning")).toHaveCount(0);
});

test("a tier's groups of levels show their number of moves along their side", async ({ page }) => {
  await expect(page.locator(".home-screen")).toBeVisible();
  await page.locator('.tier-card[data-difficulty="1"]').click();
  await expect(page.locator(".grade-label").first()).toHaveText(/\d+ moves?/);
});
