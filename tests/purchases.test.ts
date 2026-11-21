// Buying coins (src/purchases.ts), in a test build and in a release build. The real store only
// exists in the apps on a phone: test that there, with the stores' test accounts (README).
import { describe, expect, it, vi } from "vitest";
import { startApp } from "./helpers";

// Start the app as a test build or a release build, in the browser (not a native app)
async function start(testBuild: boolean) {
  vi.doMock("../src/dev", () => ({ DEV_MODE: false, TEST_BUILD: testBuild }));
  const app = await startApp();
  const purchases = await import("../src/purchases");
  return { ...app, ...purchases };
}

describe("a test build", () => {
  it("shows the coin pack as free, also in the browser, and gives 100 coins at once", async () => {
    const app = await start(true);
    expect(app.coinPackPrice()).toBe(app.TEST_PRICE);
    expect(await app.buyCoinPack()).toBe("ok");
    expect(await app.buyCoinPack()).toBe("ok");
    expect(app.coins()).toBe(app.STARTING_COINS + 2 * app.COIN_PACK);
  });
});

describe("a release build", () => {
  it("in the browser: no coin pack, and buying does nothing", async () => {
    const app = await start(false);
    await app.initPurchases(() => {});
    expect(app.coinPackPrice()).toBeUndefined();
    expect(await app.buyCoinPack()).toBe("error");
    expect(app.coins()).toBe(app.STARTING_COINS);
    expect(app.storeStatus()).toMatchObject({ native: false, loaded: false });
  });
});
