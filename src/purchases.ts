// Buying coins with real money: the coin packs of monetization.ts (COIN_PACKS), sold through the
// App Store (iOS) and Google Play (Android) with the plugin capacitor-plugin-cdv-purchase. Only in
// the native apps: the web version (Netlify) never shows them, and doesn't even load the plugin
// (it is loaded with import() only in the apps, so the web download stays small).
//
// Each pack must exist in App Store Connect and in the Play Console with exactly its id, as a
// *consumable* (it can be bought again and again). Its price is set there, not here: the shop
// shows the price the store gives, in the player's own currency. A pack the store doesn't know
// (not set up yet) is simply not shown.
//
// Never paying for nothing:
//   - the coins are added (and saved) *before* the purchase is finished. A purchase that isn't
//     finished is given to the app again at its next start, so an app that stops in between
//     still adds the coins then;
//   - each purchase's transaction id is saved with the coins (creditPurchase), so a purchase that
//     comes in twice adds its coins once;
//   - nothing is offered until the store has answered with the product and its price.
//
// The very first purchase gives FIRST_PURCHASE_MULTIPLIER times the coins (monetization.ts).
//
// A test build (TEST_BUILD in dev.ts): the packs are free and shown everywhere, also in the
// browser, and give their coins at once without the store (as purchases with a "test-" id). The
// store is still started in the apps, so the debug screen can show whether it answers.
import { Capacitor } from "@capacitor/core";
import { TEST_BUILD } from "./dev";
import { log } from "./log";
import { COIN_PACKS, FIRST_PURCHASE_MULTIPLIER, type CoinPack } from "./monetization";
import { creditPurchase, hasPurchased } from "./progress";

export const TEST_PRICE = "Free (test)";

type Plugin = typeof import("capacitor-plugin-cdv-purchase");
let plugin: Plugin | undefined; // (loaded by initPurchases, in the native apps only)
const storeErrors: string[] = [];

const findPack = (id: string) => COIN_PACKS.find((p) => p.id === id);

// The coins a pack gives now (double on the first purchase)
export const coinsFor = (pack: CoinPack) => pack.coins * (hasPurchased() ? 1 : FIRST_PURCHASE_MULTIPLIER);
export const firstPurchaseBonus = () => !hasPurchased() && FIRST_PURCHASE_MULTIPLIER > 1;

// A pack's price as the store shows it ("€0.99"), or undefined when it can't be bought here
// (the web, no connection, the store not set up yet)
export function packPrice(pack: CoinPack): string | undefined {
  if (TEST_BUILD) return TEST_PRICE;
  const product = plugin?.store.get(pack.id);
  return product?.canPurchase ? product.pricing?.price : undefined;
}

// The packs that can be bought here now, with their store prices
export const packsForSale = () =>
  COIN_PACKS.map((pack) => ({ pack, price: packPrice(pack) })).filter((p): p is { pack: CoinPack; price: string } => !!p.price);

// What the store said, for the debug screen
export function storeStatus() {
  return {
    native: Capacitor.isNativePlatform(),
    loaded: plugin !== undefined,
    products: COIN_PACKS.map((pack) => {
      const product = plugin?.store.get(pack.id);
      return `${pack.id}: ${product ? `${product.pricing?.price ?? "no price"}${product.canPurchase ? "" : " (can't buy)"}` : "not found"}`;
    }).join("; "),
    errors: [...storeErrors],
  };
}

// Start the store; `changed` is called when coins came in or the prices arrived (to show them)
export async function initPurchases(changed: () => void) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    plugin = await import("capacitor-plugin-cdv-purchase");
  } catch (error) {
    log("error", `Store: the plugin didn't load: ${String(error)}`);
    return;
  }
  const { store, Platform, ProductType } = plugin;
  const platform = Capacitor.getPlatform() === "ios" ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
  store.register(COIN_PACKS.map((pack) => ({ id: pack.id, type: ProductType.CONSUMABLE, platform })));
  store.error((error) => {
    storeErrors.push(`${error.code}: ${error.message}`);
    log("warn", `Store: ${error.code}: ${error.message}`);
  });
  store.when()
    .productUpdated(() => changed()) // (a price came in: show the pack)
    .approved((transaction) => {
      const pack = transaction.products.map((p) => findPack(p.id)).find((p) => p !== undefined);
      if (!pack) return;
      // Coins first, then finish (see above). creditPurchase is false for a purchase already
      // credited: then it is only finished.
      const amount = coinsFor(pack) * (transaction.quantity ?? 1);
      if (creditPurchase(transaction.transactionId, amount)) {
        log("info", `Purchase ${transaction.transactionId}: ${pack.id}, ${amount} coins added`);
        changed();
      } else {
        log("info", `Purchase ${transaction.transactionId}: already added, finished again`);
      }
      void transaction.finish();
    });
  const errors = await store.initialize([platform]);
  for (const error of errors) {
    storeErrors.push(`${error.code}: ${error.message}`);
    log("warn", `Store: ${error.message}`);
  }
  log("info", `Store started (${Capacitor.getPlatform()}): ${packsForSale().length} of ${COIN_PACKS.length} packs for sale`);
}

// Buy a pack: "ok" once the store has taken the order (the coins come with `approved`),
// "cancelled" when the player closed the store's dialog, "error" otherwise
export async function buyCoinPack(pack: CoinPack): Promise<"ok" | "cancelled" | "error"> {
  if (TEST_BUILD) {
    const amount = coinsFor(pack);
    creditPurchase(`test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, amount);
    log("info", `Test purchase: ${pack.id}, ${amount} coins added (free)`);
    return "ok";
  }
  const offer = plugin?.store.get(pack.id)?.getOffer();
  if (!plugin || !offer) return "error";
  const error = await offer.order();
  if (!error) return "ok";
  if (error.code === plugin.ErrorCode.PAYMENT_CANCELLED) return "cancelled";
  log("warn", `Purchase failed: ${error.code}: ${error.message}`);
  return "error";
}
