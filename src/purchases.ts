// Buying coins with real money: one product, a pack of COIN_PACK coins, sold through the App Store
// (iOS) and Google Play (Android) with the plugin capacitor-plugin-cdv-purchase. Only in the
// native apps: the web version (Netlify) never shows it, and doesn't even load the plugin (it is
// loaded with import() only in the apps, so the web download stays small).
//
// The product must exist in App Store Connect and in the Play Console with exactly this id, as a
// *consumable* (it can be bought again and again). Its price (0.99) is set there, not here: the
// shop shows the price the store gives, in the player's own currency.
//
// Never paying for nothing:
//   - the coins are added (and saved) *before* the purchase is finished. A purchase that isn't
//     finished is given to the app again at its next start, so an app that stops in between
//     still adds the coins then;
//   - each purchase's transaction id is saved with the coins (creditPurchase), so a purchase that
//     comes in twice adds its coins once;
//   - nothing is offered until the store has answered with the product and its price.
//
// A test build (TEST_BUILD in dev.ts): the pack is free and shown everywhere, also in the
// browser, and gives its coins at once without the store (as a purchase with a "test-" id). The
// store is still started in the apps, so the debug screen can show whether it answers.
import { Capacitor } from "@capacitor/core";
import { TEST_BUILD } from "./dev";
import { log } from "./log";
import { creditPurchase } from "./progress";

export const COIN_PACK_ID = "coins_100";
export const COIN_PACK = 100;
export const TEST_PRICE = "Free (test)";

type Plugin = typeof import("capacitor-plugin-cdv-purchase");
let plugin: Plugin | undefined; // (loaded by initPurchases, in the native apps only)
const storeErrors: string[] = [];

// The pack's price as the store shows it ("€0.99"), or undefined when it can't be bought here
// (the web, no connection, the store not set up yet)
export function coinPackPrice(): string | undefined {
  if (TEST_BUILD) return TEST_PRICE;
  return storePrice();
}

function storePrice(): string | undefined {
  const product = plugin?.store.get(COIN_PACK_ID);
  return product?.canPurchase ? product.pricing?.price : undefined;
}

// What the store said, for the debug screen
export function storeStatus() {
  const product = plugin?.store.get(COIN_PACK_ID);
  return {
    native: Capacitor.isNativePlatform(),
    loaded: plugin !== undefined,
    product: product ? `${product.id}: ${product.title || "(no title)"}` : "not found",
    price: product?.pricing?.price ?? "none",
    canPurchase: product?.canPurchase ?? false,
    errors: [...storeErrors],
  };
}

// Start the store; `changed` is called when coins came in or the price arrived (to show them)
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
  store.register([{ id: COIN_PACK_ID, type: ProductType.CONSUMABLE, platform }]);
  store.error((error) => {
    storeErrors.push(`${error.code}: ${error.message}`);
    log("warn", `Store: ${error.code}: ${error.message}`);
  });
  store.when()
    .productUpdated(() => changed()) // (the price came in: show the pack)
    .approved((transaction) => {
      if (!transaction.products.some((p) => p.id === COIN_PACK_ID)) return;
      // Coins first, then finish (see above). creditPurchase is false for a purchase already
      // credited: then it is only finished.
      const amount = COIN_PACK * (transaction.quantity ?? 1);
      if (creditPurchase(transaction.transactionId, amount)) {
        log("info", `Purchase ${transaction.transactionId}: ${amount} coins added`);
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
  log("info", `Store started (${Capacitor.getPlatform()}): price ${storePrice() ?? "not yet"}`);
}

// Buy the pack: "ok" once the store has taken the order (the coins come with `approved`),
// "cancelled" when the player closed the store's dialog, "error" otherwise
export async function buyCoinPack(): Promise<"ok" | "cancelled" | "error"> {
  if (TEST_BUILD) {
    creditPurchase(`test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, COIN_PACK);
    log("info", `Test purchase: ${COIN_PACK} coins added (free)`);
    return "ok";
  }
  const offer = plugin?.store.get(COIN_PACK_ID)?.getOffer();
  if (!plugin || !offer) return "error";
  const error = await offer.order();
  if (!error) return "ok";
  if (error.code === plugin.ErrorCode.PAYMENT_CANCELLED) return "cancelled";
  log("warn", `Purchase failed: ${error.code}: ${error.message}`);
  return "error";
}
