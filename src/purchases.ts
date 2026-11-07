// Buying coins with real money: one product, a pack of COIN_PACK coins, sold through the App Store
// (iOS) and Google Play (Android) with the plugin capacitor-plugin-cdv-purchase. Only in the
// native apps: the web version (Netlify) never shows it, and doesn't even load the plugin (it is
// loaded with import() only in the apps, so the web download stays small).
//
// The product must exist in App Store Connect and in the Play Console with exactly this id, as a
// *consumable* (it can be bought again and again). Its price is set there, not here: the shop
// shows the price the store gives, in the player's own currency.
//
// Never paying for nothing:
//   - the coins are added (and saved) *before* the purchase is finished. A purchase that isn't
//     finished is given to the app again at its next start, so an app that stops in between
//     still adds the coins then;
//   - each purchase's transaction id is saved with the coins (creditPurchase), so a purchase that
//     comes in twice adds its coins once;
//   - nothing is offered until the store has answered with the product and its price.
import { Capacitor } from "@capacitor/core";
import { creditPurchase } from "./progress";

export const COIN_PACK_ID = "coins_100";
export const COIN_PACK = 100;

type Plugin = typeof import("capacitor-plugin-cdv-purchase");
let plugin: Plugin | undefined; // (loaded by initPurchases, in the native apps only)

// The pack's price as the store shows it ("€0.29"), or undefined when it can't be bought here
// (the web, no connection, the store not set up yet)
export function coinPackPrice(): string | undefined {
  const product = plugin?.store.get(COIN_PACK_ID);
  return product?.canPurchase ? product.pricing?.price : undefined;
}

// Start the store; `changed` is called when coins came in or the price arrived (to show them)
export async function initPurchases(changed: () => void) {
  if (!Capacitor.isNativePlatform()) return;
  plugin = await import("capacitor-plugin-cdv-purchase");
  const { store, Platform, ProductType } = plugin;
  const platform = Capacitor.getPlatform() === "ios" ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
  store.register([{ id: COIN_PACK_ID, type: ProductType.CONSUMABLE, platform }]);
  store.when()
    .productUpdated(() => changed()) // (the price came in: show the pack)
    .approved((transaction) => {
      if (!transaction.products.some((p) => p.id === COIN_PACK_ID)) return;
      // Coins first, then finish (see above). creditPurchase is false for a purchase already
      // credited: then it is only finished.
      if (creditPurchase(transaction.transactionId, COIN_PACK * (transaction.quantity ?? 1))) changed();
      void transaction.finish();
    });
  const errors = await store.initialize([platform]);
  for (const error of errors) console.warn("Store:", error.message);
}

// Buy the pack: "ok" once the store has taken the order (the coins come with `approved`),
// "cancelled" when the player closed the store's dialog, "error" otherwise
export async function buyCoinPack(): Promise<"ok" | "cancelled" | "error"> {
  const offer = plugin?.store.get(COIN_PACK_ID)?.getOffer();
  if (!plugin || !offer) return "error";
  const error = await offer.order();
  if (!error) return "ok";
  return error.code === plugin.ErrorCode.PAYMENT_CANCELLED ? "cancelled" : "error";
}
