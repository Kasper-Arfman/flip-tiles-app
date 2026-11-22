// Getting more coins, in one popup: a free video (where ads can be shown: ads.ts) and the coin
// packs for real money (in the apps: purchases.ts). Opened from the shop's Top up button. The home
// screen has its own small video button (playAdFor); the numbers are in monetization.ts.
import { Capacitor } from "@capacitor/core";
import { TEST_BUILD } from "../dev";
import { adsAvailable, watchAd } from "../ads";
import { adOffer, type AdOffer } from "../adRewards";
import {
  AD_DAILY_MULTIPLIER, AD_REFILL_MINUTES, AD_STACK, AD_WELCOME_MULTIPLIER, COIN_PACKS, FIRST_PURCHASE_MULTIPLIER, packBonus,
} from "../monetization";
import { buyCoinPack, coinsFor, firstPurchaseBonus, packPrice } from "../purchases";
import { popup } from "./codex";
import { coin, notice } from "./ui";

// A clapperboard: the sign for "watch a video"
export const CLAPPER = `<svg class="clapper" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="3" y="9.5" width="18" height="11.5" rx="2" />
  <path d="M2.4 5.9 19.3 2l1 4.2L3.4 10.1z" />
  <path d="M6.6 5 9 8.4M11 4 13.4 7.4M15.4 3l2.4 3.4" fill="none" stroke-width="1.7" />
</svg>`;

// "in 12 min", "in 1 h 5 min"
const inTime = (at: number) => {
  const minutes = Math.max(1, Math.ceil((at - Date.now()) / 60_000));
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// How many videos are left, or when the next one comes
export const adStatus = (offer: AdOffer) =>
  offer.reason === "daily-limit" ? "No more videos today: come back tomorrow"
    : offer.reason === "wait" ? `Next video ${inTime(offer.nextAt!)}`
    : `${offer.left} of ${AD_STACK} videos ready`;

// "3x" for the very first video, "2x today" for the day's first
const bonusText = (offer: AdOffer) =>
  offer.bonus === "welcome" ? `${AD_WELCOME_MULTIPLIER}× first video` : offer.bonus === "daily" ? `${AD_DAILY_MULTIPLIER}× today` : "";

// Play a video for coins: a notice with the coins, or why there is no video now. True when coins
// came in (so the screen can show them).
export async function playAdFor(): Promise<boolean> {
  const offer = adOffer();
  if (!offer.canWatch) {
    notice(adStatus(offer));
    return false;
  }
  const result = await watchAd();
  if (result.outcome === "rewarded") notice(`+${result.coins} coins!`);
  else if (result.outcome === "unavailable") notice(result.message);
  return result.outcome === "rewarded";
}

// The home screen's video button opens this first: "Watch a video?", with everything about it:
// what it pays (and why more, with a bonus), how many are ready, when the next one comes, how many
// are left today; Watch (off when none is ready) or Not now. `changed`: coins came in.
export function openAdOffer(changed: () => void) {
  const dialog = popup("ad-offer-dialog", `<h2>Watch a video?</h2>`, `<div class="ad-offer-body"></div>`);
  const body = dialog.querySelector<HTMLElement>(".ad-offer-body")!;
  const draw = () => {
    const offer = adOffer();
    const why = offer.bonus === "welcome" ? `${AD_WELCOME_MULTIPLIER}× your very first video!`
      : offer.bonus === "daily" ? `${AD_DAILY_MULTIPLIER}× for today's first video!` : "";
    const limited = offer.reason === "daily-limit";
    // The videos as a bar of AD_STACK segments: a ready one full; the next one filling up as its
    // time passes, with the minutes left in it; the rest empty
    const filling = offer.nextAt ? Math.max(0, Math.min(1, 1 - (offer.nextAt - Date.now()) / (AD_REFILL_MINUTES * 60_000))) : 0;
    const segments = Array.from({ length: AD_STACK }, (_, i) => {
      if (limited) return `<span class="ad-segment"></span>`;
      if (i < offer.left) return `<span class="ad-segment ready"></span>`;
      if (i === offer.left && offer.nextAt) {
        return `<span class="ad-segment" style="--fill: ${(filling * 100).toFixed(1)}%"><small>${inTime(offer.nextAt).replace("in ", "")}</small></span>`;
      }
      return `<span class="ad-segment"></span>`;
    }).join("");
    body.innerHTML = `
      <div class="ad-offer-reward">
        ${CLAPPER}
        <span>Earn <strong>${coin()} ${offer.reward}</strong> coins</span>
      </div>
      ${why ? `<p class="ad-offer-bonus"><span class="bonus-tag">${why}</span></p>` : ""}
      <p class="ad-bar-label">${limited ? "No more videos today" : `${offer.left} of ${AD_STACK} videos ready`}</p>
      <div class="ad-bar" role="img" aria-label="${limited ? "No more videos today"
        : `${offer.left} of ${AD_STACK} videos ready${offer.nextAt ? `, one more ${inTime(offer.nextAt)}` : ""}`}">${segments}</div>
      <div class="ad-offer-buttons">
        <button type="button" class="not-now">Not now</button>
        <button type="button" class="primary watch-ad" ${offer.canWatch ? "" : "disabled"}>
          ${limited ? "Come back tomorrow" : `▶ Watch<small>${offer.todayLeft} left today</small>`}</button>
      </div>`;
  };
  draw();
  const timer = window.setInterval(() => {
    if (!dialog.isConnected) return clearInterval(timer);
    if (!body.querySelector(".watch-ad.busy")) draw(); // (the countdown)
  }, 15_000);
  dialog.addEventListener("close", () => clearInterval(timer));
  body.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (target.closest(".not-now")) {
      dialog.close();
      return;
    }
    const watch = target.closest<HTMLButtonElement>(".watch-ad");
    if (!watch) return;
    watch.disabled = true;
    watch.classList.add("busy");
    void playAdFor().then((got) => {
      dialog.close();
      if (got) changed();
    });
  });
}

// The popup's free video: one row, a clapperboard, what it pays and Watch
const freeRow = () => {
  if (!adsAvailable()) return "";
  const offer = adOffer();
  const bonus = bonusText(offer);
  return `<section class="top-up-free">
      ${CLAPPER}
      <div class="top-up-free-text">
        <strong>Watch a video ${bonus ? `<span class="bonus-tag">${bonus}</span>` : ""}</strong>
        <small class="ad-status">${adStatus(offer)}</small>
      </div>
      <button type="button" class="primary watch-ad" ${offer.canWatch ? "" : "disabled"}>+${coin()} ${offer.reward}</button>
    </section>`;
};

// The popup's coin packs: in the apps (and a test build); a pack can be bought once the store has
// given its price. Until then (not set up in the store yet, or no connection) its button is off.
const packs = () => {
  if (!TEST_BUILD && !Capacitor.isNativePlatform()) return "";
  const list = COIN_PACKS.map((pack) => ({ pack, price: packPrice(pack) }));
  const first = firstPurchaseBonus();
  return `<section class="coin-packs">
      ${first ? `<p class="first-purchase">First purchase: <strong>${FIRST_PURCHASE_MULTIPLIER}× the coins!</strong></p>` : ""}
      <ul class="pack-grid">${list.map(({ pack, price }) => {
        const bonus = Math.round(packBonus(pack) * 100);
        return `<li class="pack${pack.badge ? " has-badge" : ""}">
          ${pack.badge ? `<span class="pack-badge">${pack.badge}</span>` : ""}
          <span class="pack-coins">${coin()} ${first ? `<s>${pack.coins}</s> ` : ""}${coinsFor(pack)}</span>
          <span class="pack-bonus">${bonus > 0 ? `+${bonus}%` : "&nbsp;"}</span>
          <button type="button" class="primary buy-pack" data-pack="${pack.id}" ${price ? "" : "disabled"}>${price ?? "…"}</button>
        </li>`;
      }).join("")}</ul>
      ${TEST_BUILD ? `<p class="pack-note">Test version: no payment, the coins are added at once.</p>`
        : list.some((p) => !p.price) ? `<p class="pack-note">Not for sale right now: the store hasn't answered (no connection, or the packs aren't set up in the store yet).</p>` : ""}
    </section>`;
};

// Whether there is anything to top up with here (else the shop has no Top up button)
export const canTopUp = () => adsAvailable() || TEST_BUILD || Capacitor.isNativePlatform();

// The Top up popup; `changed` is called when coins came in (to show them)
export function openTopUp(changed: () => void) {
  const dialog = popup("top-up-dialog", `<h2>Top up coins</h2>`, `<div class="top-up-body"></div>`);
  const body = dialog.querySelector<HTMLElement>(".top-up-body")!;
  const draw = () => {
    body.innerHTML = freeRow() + packs();
  };
  draw();
  // (the countdown, kept up to date while it is open)
  const timer = window.setInterval(() => {
    if (!dialog.isConnected) return clearInterval(timer);
    const status = body.querySelector(".ad-status");
    const watch = body.querySelector<HTMLButtonElement>(".watch-ad");
    const offer = adOffer();
    if (status) status.textContent = adStatus(offer);
    if (watch && !watch.classList.contains("busy")) watch.disabled = !offer.canWatch;
  }, 15_000);
  dialog.addEventListener("close", () => clearInterval(timer));

  body.addEventListener("click", (e) => {
    const target = e.target as Element;
    const watch = target.closest<HTMLButtonElement>(".watch-ad");
    if (watch) {
      watch.disabled = true;
      watch.classList.add("busy");
      void playAdFor().then((got) => {
        draw();
        if (got) changed();
      });
      return;
    }
    const buy = target.closest<HTMLButtonElement>(".buy-pack");
    if (buy) {
      const pack = COIN_PACKS.find((p) => p.id === buy.dataset.pack)!;
      for (const b of body.querySelectorAll<HTMLButtonElement>(".buy-pack")) b.disabled = true; // (one order at a time)
      void buyCoinPack(pack).then((result) => {
        if (result === "error") alert("The purchase didn't go through. Nothing was charged; please try again later.");
        draw();
        changed(); // (the coins arrive by themselves when the store approves)
      });
    }
  });
}
