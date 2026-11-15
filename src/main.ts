import { Capacitor } from "@capacitor/core";
import "@fontsource/lilita-one/latin-400.css"; // the title's font, inside the app (works offline)
import "./game/flip-tiles.css";
import "./styles.css";
import { findLevel, findTier } from "./levels/levels";
import { currentRoute, go, goUp, onNavigate } from "./nav";
import { log, startLog } from "./log";
import { activeLook, isLevelOpen, loadProgress, starsToUnlock, tutorialStep } from "./progress";
import { initPurchases } from "./purchases";
import { codexScreen } from "./screens/codex";
import { debugScreen } from "./screens/debug";
import { homeScreen } from "./screens/home";
import { howToPlayScreen } from "./screens/howToPlay";
import { levelScreen } from "./screens/level";
import { shopScreen } from "./screens/shop";
import { tierScreen } from "./screens/tier";
import { applySkin } from "./skins";

const app = document.querySelector<HTMLElement>("#app")!;

function render() {
  const route = currentRoute();
  
  // A new player plays the tutorial first (the debug screen is always reachable)
  const step = tutorialStep();
  if (step && route.screen !== "debug" && !(route.screen === "level" && route.difficulty === step.difficulty && route.number === step.number)) {
    go(`#/level/${step.difficulty}/${step.number}`, true);
    return;
  }

  let next: HTMLElement;
  if (route.screen === "how-to-play") next = howToPlayScreen();
  else if (route.screen === "shop") next = shopScreen(render);
  else if (route.screen === "codex") next = codexScreen(render);
  else if (route.screen === "debug") next = debugScreen(render);
  else if (route.screen === "home") next = homeScreen(render);
  else {
    // A tier or level that doesn't exist, or isn't unlocked yet: back home
    const tier = findTier(route.difficulty);
    const level = route.screen === "level" ? findLevel(route.difficulty, route.number) : undefined;
    if (!tier || starsToUnlock(tier) > 0 || (route.screen === "level" && !level)) {
      go("#/", true); // the address changes, and that renders the home screen
      return;
    }
    // A level whose group isn't open yet: to its tier
    if (level && !isLevelOpen(tier, level)) {
      go(`#/tier/${tier.difficulty}`, true);
      return;
    }
    next = level ? levelScreen(level) : tierScreen(tier, render);
  }
  app.replaceChildren(next);
  window.scrollTo(0, 0);
}

// The back arrow in every top bar
app.addEventListener("click", (e) => {
  const up = (e.target as Element).closest<HTMLElement>("[data-up]");
  if (up) goUp(up.dataset.up!);
});

onNavigate(render);

// Offline play on the web: the service worker saves the app's files on the device (see sw.js).
// Not in the native apps (their files are on the device already), nor while developing (npm run
// dev: there would be no list of files to save).
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform() && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {}); // (without it, the game still works online)
}

// The log first (it catches errors from here on), then what the player has
startLog().then(loadProgress).then(() => {
  log("info", `Started: version ${__APP_VERSION__} (${__BUILD__}), ${Capacitor.getPlatform()}`);
  applySkin(activeLook());
  render();
  // Buying coins (native apps only): when coins come in, or the store's price arrives, the shop
  // is drawn again (other screens show the coins when next opened; a level must not restart)
  void initPurchases(() => {
    if (currentRoute().screen === "shop") render();
  });
});
