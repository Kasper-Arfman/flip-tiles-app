// Everything about money in one place: what hints cost, the coin packs for sale, and how
// watching ads pays. Change the numbers here; the rest of the game reads them from here.
//
// (The prices themselves are not here: a store sets the price of each pack, in App Store Connect
// and the Play Console, and the shop shows what the store says. See README: "Monetization".)

// --- coins for hints ----------------------------------------------------------------------------

export const HINT_COST = 10; // coins for one hint (one move of a solution)

// --- coin packs (bought with real money) --------------------------------------------------------
// Each pack is a *consumable* product in both stores, with exactly this id. The ids never change
// (a store never lets an id be used again): to change what a pack gives, change `coins` here (and
// the product's description in the stores); to change its price, change it in the stores, and
// `price` here, which is only used for the "+98% coins" labels and in test builds.

export const BASE_COINS = 100; // the smallest pack; the others are multiples of it

export interface CoinPack {
  id: string; // the product id in both stores
  coins: number;
  price: number; // the price in the stores, in US dollars (for the labels; the store's own price is shown)
  badge?: string; // a ribbon on the pack in the shop
}

export const COIN_PACKS: CoinPack[] = [
  { id: "coins_pack_1", coins: BASE_COINS, price: 0.99 },
  { id: "coins_pack_2", coins: 3 * BASE_COINS, price: 1.99 },
  { id: "coins_pack_3", coins: 7 * BASE_COINS, price: 3.99, badge: "Most popular" },
  { id: "coins_pack_4", coins: 30 * BASE_COINS, price: 14.99, badge: "Best value" },
];

// The very first pack a player buys gives this many times its coins (1: no bonus). A first
// purchase is the hardest one to make; after it, buying again is much easier.
export const FIRST_PURCHASE_MULTIPLIER = 2;

// How many more coins per dollar a pack gives than the smallest one (0.49: "+49% coins")
export function packBonus(pack: CoinPack): number {
  const base = COIN_PACKS[0];
  return pack.coins / pack.price / (base.coins / base.price) - 1;
}

// --- watching ads for coins ---------------------------------------------------------------------
// Rewarded video ads: the player chooses to watch one, and gets coins for it. Never forced: no ad
// ever interrupts the game. An ad pays exactly one hint (AD_REWARD = HINT_COST), with bonuses
// that make players come back:

export const AD_REWARD = HINT_COST; // coins for one ad: exactly one hint
export const AD_WELCOME_MULTIPLIER = 3; // the very first ad a player ever watches pays 3x
export const AD_DAILY_MULTIPLIER = 2; // the first ad of each day pays 2x
// Scarcity: ads come in a small stack that refills slowly, so watching one is a little treat
// (and players come back for the next), not something to grind
export const AD_STACK = 3; // at most this many ads in a row ...
export const AD_REFILL_MINUTES = 20; // ... and one more becomes available every 20 minutes
export const AD_DAILY_LIMIT = 10; // and no more than this many ads a day

// --- the ad network: Google AdMob ---------------------------------------------------------------
// Ids from your AdMob account (apps.admob.com): one "app id" per platform, and one "ad unit"
// (type: Rewarded) per platform. Until they are filled in, and always in test builds and while
// developing, Google's official *test* ids are used: they show "Test Ad" and pay nothing. Never
// tap your own real ads (Google closes accounts for it): test with test ids or test devices.
// The app ids are also in the native projects: android/app/src/main/AndroidManifest.xml and
// ios/App/App/Info.plist (see README: "Monetization").

export const ADMOB = {
  androidRewarded: "ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN", // your Android rewarded ad unit
  iosRewarded: "ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN", // your iOS rewarded ad unit
};

// Google's test ad units (https://developers.google.com/admob/android/test-ads, .../ios/test-ads)
export const ADMOB_TEST = {
  androidRewarded: "ca-app-pub-3940256099942544/5224354917",
  iosRewarded: "ca-app-pub-3940256099942544/1712485313",
};
