// Rewarded video ads (Google AdMob, with the plugin @capacitor-community/admob): the player
// chooses to watch one and gets coins for it (adRewards.ts; the numbers: monetization.ts).
//
// Where:
//   - in the native apps: real AdMob ads. Google's test ads in test builds and while developing,
//     and until the real ad units are filled in (monetization.ts: ADMOB)
//   - in a test build (TEST_BUILD) in the browser: a pretend ad (a 5-second countdown), so the
//     whole flow can be tried without a phone
//   - the web version for players (Netlify): no ads at all
//
// Privacy (required by law and by Google):
//   - Europe (and other places with such laws): before the first ad, Google's consent form (UMP)
//     asks whether ads may be personalised. Without an answer, no ad is shown. The player can
//     change it later: privacyOptionsRequired() / showPrivacyOptions() (the home screen's
//     "Privacy settings")
//   - iPhone: after that, Apple's question whether the app may track (App Tracking
//     Transparency). Either answer still gets ads (non-personalised when "no")
// Both questions come only when the player first chooses to watch an ad, never at the start.
import { Capacitor } from "@capacitor/core";
import { DEV_MODE, TEST_BUILD } from "./dev";
import { log } from "./log";
import { ADMOB, ADMOB_TEST } from "./monetization";
import { adOffer, recordAdWatched } from "./adRewards";

type Plugin = typeof import("@capacitor-community/admob");
let plugin: Plugin | undefined; // (loaded by initAds, in the native apps only)
let ready = false;
let canRequestAds = false;
let privacyRequired = false;

const PLACEHOLDER = /X{6}/;
// This platform's real ad unit (each platform has its own; Android can have its ids before iOS)
const realUnit = () => (Capacitor.getPlatform() === "ios" ? ADMOB.iosRewarded : ADMOB.androidRewarded);
// Google's test ads: in test builds, while developing, and until this platform's real ad unit is filled in
export const usesTestAds = () => TEST_BUILD || DEV_MODE || import.meta.env.DEV || PLACEHOLDER.test(realUnit());

const adUnit = () => {
  if (!usesTestAds()) return realUnit();
  return Capacitor.getPlatform() === "ios" ? ADMOB_TEST.iosRewarded : ADMOB_TEST.androidRewarded;
};

// Whether ads can be offered here (the button shows only then)
export const adsAvailable = () => (Capacitor.isNativePlatform() ? ready : TEST_BUILD);

// Start AdMob (native apps only; at the app's start): asks Google whether consent is needed, but
// doesn't ask the player anything yet
export async function initAds() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    plugin = await import("@capacitor-community/admob");
    await plugin.AdMob.initialize({ initializeForTesting: usesTestAds() });
    const info = await plugin.AdMob.requestConsentInfo();
    canRequestAds = info.canRequestAds;
    privacyRequired = info.privacyOptionsRequirementStatus === "REQUIRED";
    ready = true;
    log("info", `Ads started (${usesTestAds() ? "test ads" : "real ads"}), consent ${info.status}`);
  } catch (error) {
    log("warn", `Ads didn't start: ${String(error)}`);
  }
}

// The player must be able to change their ad consent (Google's rule, where consent applies)
export const privacyOptionsRequired = () => privacyRequired;
export async function showPrivacyOptions() {
  if (!plugin) return;
  try {
    await plugin.AdMob.showPrivacyOptionsForm();
    const info = await plugin.AdMob.requestConsentInfo();
    canRequestAds = info.canRequestAds;
  } catch (error) {
    log("warn", `Privacy options: ${String(error)}`);
  }
}

export type AdResult =
  | { outcome: "rewarded"; coins: number } // watched to the end: coins added
  | { outcome: "closed" } // closed before the end: nothing
  | { outcome: "unavailable"; message: string }; // no ad now (none to show, no consent, the limit)

// Show one ad; its coins are added when it was watched to the end. `forHint`: for a hint the player
// can't pay for, on a level: no waiting for the stack, only the daily limit (adRewards.ts)
export async function watchAd(forHint = false): Promise<AdResult> {
  const offer = adOffer(forHint);
  if (!offer.canWatch) return { outcome: "unavailable", message: "No more ads for now." };
  if (!Capacitor.isNativePlatform()) {
    if (!TEST_BUILD) return { outcome: "unavailable", message: "Ads are only in the app." };
    return (await pretendAd()) ? { outcome: "rewarded", coins: recordAdWatched(forHint) } : { outcome: "closed" };
  }
  if (!plugin || !ready) return { outcome: "unavailable", message: "Ads aren't available right now." };
  const { AdMob, AdmobConsentStatus, RewardAdPluginEvents } = plugin;
  try {
    // Consent first (where needed), then, on an iPhone, Apple's tracking question
    if (!canRequestAds) {
      const info = await AdMob.requestConsentInfo();
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        canRequestAds = (await AdMob.showConsentForm()).canRequestAds;
      } else {
        canRequestAds = info.canRequestAds;
      }
    }
    if (!canRequestAds) return { outcome: "unavailable", message: "Ads need your privacy choice first." };
    if (Capacitor.getPlatform() === "ios") {
      const { status } = await AdMob.trackingAuthorizationStatus();
      if (status === "notDetermined") await AdMob.requestTrackingAuthorization();
    }

    // The ad: loaded, shown, and paid only when the network says it was watched to the end
    let rewarded = false;
    const handles = [await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; })];
    const closed = new Promise<void>((resolve) => {
      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) => handles.push(h));
    });
    await AdMob.prepareRewardVideoAd({ adId: adUnit(), isTesting: usesTestAds() });
    // (on Android the plugin only answers this call when a reward is earned, never when the ad is
    // closed early: so it is not waited for; the ad being closed is what ends it)
    void AdMob.showRewardVideoAd().then((item) => { if (item) rewarded = true; }, () => {});
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 300)); // (a reward reported just as it closed)
    for (const h of handles) void h.remove();
    if (!rewarded) return { outcome: "closed" };
    const coins = recordAdWatched(forHint);
    log("info", `Ad watched: ${coins} coins`);
    return { outcome: "rewarded", coins };
  } catch (error) {
    log("warn", `Ad failed: ${String(error)}`);
    return { outcome: "unavailable", message: "No ad to show right now. Please try again later." };
  }
}

// A test build in the browser: a pretend ad, 5 seconds; true when watched to the end
function pretendAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog pretend-ad";
    dialog.innerHTML = `<div class="dialog-box">
      <p class="pretend-ad-label">Test ad</p>
      <p class="pretend-ad-count">5</p>
      <button type="button" class="pretend-ad-close">Close (no reward)</button>
    </div>`;
    document.body.append(dialog);
    let left = 5;
    let done = false;
    const count = dialog.querySelector<HTMLElement>(".pretend-ad-count")!;
    const close = dialog.querySelector<HTMLButtonElement>(".pretend-ad-close")!;
    const timer = window.setInterval(() => {
      left--;
      count.textContent = String(left);
      if (left <= 0) {
        clearInterval(timer);
        done = true;
        close.textContent = "Collect reward";
      }
    }, 1000);
    // Closing before the end forfeits the reward: asked first (as real rewarded ads do)
    const tryClose = () => {
      if (done || confirm("Forfeit your reward? The video isn't finished yet.")) dialog.close();
    };
    close.addEventListener("click", tryClose);
    dialog.addEventListener("cancel", (e) => { // (Escape, or a phone's back gesture)
      e.preventDefault();
      tryClose();
    });
    dialog.addEventListener("close", () => {
      clearInterval(timer);
      dialog.remove();
      resolve(done);
    });
    dialog.showModal();
  });
}
