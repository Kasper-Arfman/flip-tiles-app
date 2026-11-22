// Buying coins (src/purchases.ts), in a test build and in a release build. The real store only
// exists in the apps on a phone: test that there, with the stores' test accounts (README).
import { describe, expect, it, vi } from "vitest";
import { startApp } from "./helpers";

// Start the app as a test build or a release build, in the browser (not a native app)
async function start(testBuild: boolean) {
  vi.doMock("../src/dev", () => ({ DEV_MODE: false, TEST_BUILD: testBuild }));
  const app = await startApp();
  const purchases = await import("../src/purchases");
  const money = await import("../src/monetization");
  return { ...app, ...purchases, ...money };
}

describe("a test build", () => {
  it("shows every pack as free, also in the browser, and gives its coins at once (the first one double)", async () => {
    const app = await start(true);
    expect(app.packsForSale().map((p) => p.pack.id)).toEqual(app.COIN_PACKS.map((p) => p.id));
    expect(app.packsForSale().every((p) => p.price === app.TEST_PRICE)).toBe(true);
    const [small, , large] = app.COIN_PACKS;
    expect(app.firstPurchaseBonus()).toBe(app.FIRST_PURCHASE_MULTIPLIER > 1);
    expect(await app.buyCoinPack(small)).toBe("ok");
    expect(app.coins()).toBe(app.STARTING_COINS + app.FIRST_PURCHASE_MULTIPLIER * small.coins);
    expect(app.firstPurchaseBonus()).toBe(false);
    expect(await app.buyCoinPack(large)).toBe("ok");
    expect(app.coins()).toBe(app.STARTING_COINS + app.FIRST_PURCHASE_MULTIPLIER * small.coins + large.coins);
  });
});

describe("a release build", () => {
  it("in the browser: no coin packs, and buying does nothing", async () => {
    const app = await start(false);
    await app.initPurchases(() => {});
    expect(app.packsForSale()).toEqual([]);
    expect(await app.buyCoinPack(app.COIN_PACKS[0])).toBe("error");
    expect(app.coins()).toBe(app.STARTING_COINS);
    expect(app.storeStatus()).toMatchObject({ native: false, loaded: false });
  });
});

describe("the packs", () => {
  it("are multiples of BASE_COINS, with more coins per dollar the bigger they are", async () => {
    const m = await import("../src/monetization");
    expect(m.COIN_PACKS.map((p) => p.coins / m.BASE_COINS)).toEqual([1, 3, 7, 30]);
    const bonuses = m.COIN_PACKS.map(m.packBonus);
    expect(bonuses[0]).toBeCloseTo(0);
    for (let i = 1; i < bonuses.length; i++) expect(bonuses[i]).toBeGreaterThan(bonuses[i - 1]);
    expect(new Set(m.COIN_PACKS.map((p) => p.id)).size).toBe(m.COIN_PACKS.length);
  });
});
