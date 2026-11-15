// What the player has, and that it is kept: stars, unlocking, coins, purchases, the Codex, hints,
// replays, and saves from older versions of the game. Each test starts the app on a save (see
// helpers.ts), as a phone does.
import { describe, expect, it } from "vitest";
import { readSaved, restartApp, saved, startApp } from "./helpers";

const ALL = 7; // all three stars (STAR_SOLVED | STAR_FLIPS | STAR_MOVES)

describe("a new player", () => {
  it("starts with 100 coins, no stars, the tutorial, and only Alpha open", async () => {
    const app = await startApp();
    expect(app.coins()).toBe(app.STARTING_COINS);
    expect(app.totalStars()).toBe(0);
    expect(app.tutorialStep()).toBe(app.TIERS[0].levels[0]);
    expect(app.starsToUnlock(app.TIERS[0])).toBe(0);
    expect(app.starsToUnlock(app.TIERS[1])).toBe(app.BETA_STARS);
    expect(app.activeLook()).toEqual({ skin: "classic", shape: "square" });
  });

  it("an unreadable save starts afresh instead of crashing", async () => {
    const app = await startApp({ "progress-v1": "{broken", "wallet-v1": "not json" });
    expect(app.totalStars()).toBe(0);
    expect(app.coins()).toBe(app.STARTING_COINS);
  });
});

describe("stars", () => {
  it("are added to the best, saved, and kept when the app restarts", async () => {
    let app = await startApp();
    const level = app.TIERS[0].levels[0];
    expect(app.award(level, app.STAR_SOLVED)).toBe(app.STAR_SOLVED);
    expect(app.award(level, app.STAR_SOLVED | app.STAR_MOVES)).toBe(app.STAR_MOVES); // only the new one
    expect(app.award(level, app.STAR_SOLVED)).toBe(0);
    expect(readSaved("progress-v1")[level.key]).toBe(app.STAR_SOLVED | app.STAR_MOVES);
    app = await restartApp();
    expect(app.starsOf(app.TIERS[0].levels[0])).toBe(app.STAR_SOLVED | app.STAR_MOVES);
  });

  it("the tutorial ends once its two levels are solved", async () => {
    const app = await startApp();
    const [tap, hold] = app.TIERS[0].levels;
    app.award(tap, app.STAR_SOLVED);
    expect(app.tutorialStep()).toBe(hold);
    app.award(hold, app.STAR_SOLVED);
    expect(app.tutorialStep()).toBeNull();
  });
});

describe("unlocking", () => {
  // Give `count` stars, level by level, in the tiers before `tier`
  const giveStars = (app: Awaited<ReturnType<typeof startApp>>, before: number, count: number) => {
    for (const level of app.TIERS.slice(0, before).flatMap((t) => t.levels)) {
      const n = Math.min(3, count);
      if (n <= 0) break;
      app.award(level, [0, 1, 3, 7][n]);
      count -= n;
    }
  };

  it("Beta opens at 5 stars", async () => {
    const app = await startApp();
    giveStars(app, 1, 4);
    expect(app.starsToUnlock(app.TIERS[1])).toBe(1);
    giveStars(app, 1, 5);
    expect(app.starsToUnlock(app.TIERS[1])).toBe(0);
  });

  it("later stages open at UNLOCK_SHARE of the stars before them", async () => {
    for (const i of [2, 3]) {
      saved.clear();
      const app = await startApp();
      const total = app.TIERS.slice(0, i).reduce((n, t) => n + app.maxStars(t), 0);
      const needed = Math.ceil(app.UNLOCK_SHARE * total - 1e-9);
      expect(app.unlockStars(i)).toBe(needed);
      giveStars(app, i, needed - 1);
      expect(app.starsToUnlock(app.TIERS[i])).toBe(1);
      giveStars(app, i, needed);
      expect(app.starsToUnlock(app.TIERS[i])).toBe(0);
    }
  });

  it("a stage can be bought with coins, only with enough of them", async () => {
    const app = await startApp();
    const beta = app.TIERS[1];
    expect(app.buyTier(beta)).toBe(true);
    expect(app.coins()).toBe(app.STARTING_COINS - app.UNLOCK_COST);
    expect(app.starsToUnlock(beta)).toBe(0);
    expect(app.buyTier(app.TIERS[2])).toBe(false); // (0 coins left)
    expect((await restartApp()).starsToUnlock((await restartApp()).TIERS[1])).toBe(0);
  });
});

describe("coins", () => {
  it("a completed stage pays its reward once, also after a restart", async () => {
    let app = await startApp();
    for (const level of app.TIERS[0].levels) app.award(level, ALL);
    expect(app.payStageRewards().map((t) => t.name)).toEqual(["Alpha"]);
    expect(app.coins()).toBe(app.STARTING_COINS + app.STAGE_REWARD);
    expect(app.payStageRewards()).toEqual([]);
    app = await restartApp();
    expect(app.payStageRewards()).toEqual([]);
    expect(app.coins()).toBe(app.STARTING_COINS + app.STAGE_REWARD);
  });

  it("a hint costs 5 coins, and there are no more hints than moves in the solution", async () => {
    const app = await startApp();
    const level = app.TIERS[0].levels[0];
    const moves = app.solutionFor(level, "moves").length;
    for (let i = 0; i < moves; i++) expect(app.buyHint(level, "moves")).toBe(true);
    expect(app.buyHint(level, "moves")).toBe(false);
    expect(app.coins()).toBe(app.STARTING_COINS - moves * app.HINT_COST);
  });
});

describe("purchases (coins bought with real money)", () => {
  it("a purchase adds its coins once, even when the store hands it over again", async () => {
    let app = await startApp();
    expect(app.creditPurchase("GPA.1234", 100)).toBe(true);
    expect(app.creditPurchase("GPA.1234", 100)).toBe(false);
    expect(app.coins()).toBe(app.STARTING_COINS + 100);
    app = await restartApp(); // (the store hands it over again at the next start)
    expect(app.creditPurchase("GPA.1234", 100)).toBe(false);
    expect(app.coins()).toBe(app.STARTING_COINS + 100);
  });

  it("Reset progress gives bought coins back, and still knows the purchases", async () => {
    const app = await startApp();
    app.creditPurchase("t1", 100);
    app.creditPurchase("t2", 100);
    app.buyTier(app.TIERS[1]);
    app.award(app.TIERS[0].levels[0], ALL);
    await app.resetProgress();
    expect(app.totalStars()).toBe(0);
    expect(app.coins()).toBe(app.STARTING_COINS + 200);
    expect(app.creditPurchase("t1", 100)).toBe(false);
    const again = await restartApp();
    expect(again.coins()).toBe(again.STARTING_COINS + 200);
    expect(again.starsToUnlock(again.TIERS[1])).toBeGreaterThan(0); // (the bought stage is closed again)
  });
});

describe("saves from older versions", () => {
  it("version 1: bought groups of levels by place become groups by minMoves", async () => {
    const app = await startApp({ "wallet-v1": { coins: 30, grades: ["5:1"] } });
    expect(readSaved("wallet-v1").grades).toEqual(["5/4"]);
    expect(readSaved("wallet-v1").version).toBe(3);
    expect(app.coins()).toBe(30);
  });

  it("version 2: the lists of opened stages and groups start over", async () => {
    await startApp({ "wallet-v1": { version: 2, coins: 40, unlocked: [2, 3], grades: ["3/4"] } });
    expect(readSaved("wallet-v1")).toMatchObject({ version: 3, coins: 40, unlocked: [], grades: [] });
  });

  it("a skin taken out of the game is swapped for Classic", async () => {
    const app = await startApp({ "wallet-v1": { version: 3, skins: ["classic", "gone"], skin: "gone" } });
    expect(app.activeLook().skin).toBe("classic");
  });

  it("a moves star earned with more forces than the level now allows is taken back", async () => {
    const { TIERS } = await startApp();
    const levels = TIERS.flatMap((t) => t.levels);
    const over = levels.find((l) => l.maxForces >= 1)!;
    const exact = levels.find((l) => l.maxForces >= 1 && l !== over)!;
    const none = levels.find((l) => l.maxForces === 0 && l.minMoves > 1)!;
    const forces = (n: number) => Array.from({ length: n }, (_, i) => 32 + i); // (a force is tile + 32)
    saved.clear();
    const app = await startApp({
      "progress-v1": { [over.key]: ALL, [exact.key]: ALL, [none.key]: ALL },
      "replays-v1": {
        [over.board]: { moves: forces(over.maxForces + 1), flips: [1, 2] },
        [exact.board]: { moves: forces(exact.maxForces) },
        [none.board]: { moves: [...forces(1), 3] },
      },
    });
    const find = (id: string) => app.TIERS.flatMap((t) => t.levels).find((l) => l.id === id)!;
    expect(app.starsOf(find(over.id))).toBe(ALL & ~app.STAR_MOVES);
    expect(readSaved("replays-v1")[over.board]).toEqual({ flips: [1, 2] }); // (the flips replay stays)
    expect(app.starsOf(find(exact.id))).toBe(ALL);
    expect(app.starsOf(find(none.id))).toBe(ALL & ~app.STAR_MOVES);
    // Once is enough: a second start changes nothing
    const before = saved.get("progress-v1");
    await restartApp();
    expect(saved.get("progress-v1")).toBe(before);
  });
});

describe("the Codex", () => {
  it("a completed stage earns one entry, of 1 up to its number of forces, that flips can solve", async () => {
    const app = await startApp();
    const alpha = app.TIERS[0];
    expect(app.discover(alpha, 1)).toBe(false); // (not completed yet)
    for (const level of alpha.levels) app.award(level, ALL);
    expect(app.entriesToClaim()).toBe(1);
    expect(app.discover(alpha, 0)).toBe(false); // (no forces)
    expect(app.discover(alpha, 0b11)).toBe(false); // (Alpha: at most 1)
    const tile = [...Array(25).keys()].find((k) => app.discover(alpha, 1 << k));
    expect(tile).toBeDefined();
    expect(app.entryOf(alpha)).toBe(1 << tile!);
    expect(app.entriesToClaim()).toBe(0);
    expect((await restartApp()).entryOf((await restartApp()).TIERS[0])).toBe(1 << tile!);
  });
});

describe("replays", () => {
  it("only solves that earned the flips or the moves star are kept", async () => {
    const app = await startApp();
    const level = app.TIERS[0].levels[0];
    app.recordSolve(level, [{ kind: "flip", tile: 3 }], app.STAR_SOLVED);
    expect(app.hasRecordedSolves(level)).toBe(false);
    app.recordSolve(level, [{ kind: "force", tile: 3 }], app.STAR_MOVES);
    expect(app.recordedSolves(level)).toEqual({ moves: [{ kind: "force", tile: 3 }] });
    expect(readSaved("replays-v1")[level.board]).toEqual({ moves: [35] });
  });
});

describe("the debug screen's save tools", () => {
  it("a copied save loads back the same, on a fresh phone", async () => {
    let app = await startApp();
    app.award(app.TIERS[0].levels[0], ALL);
    app.creditPurchase("t1", 100);
    const text = await app.exportSave();
    saved.clear();
    app = await startApp();
    expect(app.totalStars()).toBe(0);
    await app.importSave(text);
    expect(app.totalStars()).toBe(3);
    expect(app.coins()).toBe(app.STARTING_COINS + 100);
    await expect(app.importSave('{"something": "else"}')).rejects.toThrow();
  });
});
