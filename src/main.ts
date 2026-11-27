import { Capacitor } from "@capacitor/core";
import "@fontsource/lilita-one/latin-400.css"; // the title's font, inside the app (works offline)
import "./game/flip-tiles.css";
import "./styles/index.css"; // (what is where: the top of that file)
import { findLevel, findTier } from "./levels/levels";
import { currentRoute, go, goUp, onNavigate } from "./nav";
import { log, startLog } from "./log";
import { activeLook, isFinalGoalOpen, isLevelOpen, isTierOpen, loadProgress, tutorialStep } from "./progress";
import { initPurchases } from "./purchases";
import { initAds } from "./ads";
import { loadAdRewards } from "./adRewards";
import { TEST_BUILD } from "./dev";
import { startSending } from "./ranked/online";
import { activeGame, loadRanked, loseGame } from "./ranked/ranked";
import { codexScreen } from "./screens/codex";
import { debugScreen } from "./screens/debug";
import { finalPlay, finalScreen } from "./screens/final";
import { homeScreen } from "./screens/home";
import { howToPlayScreen } from "./screens/howToPlay";
import { levelScreen } from "./screens/level";
import { rankedLeaderboard, rankedLobby, rankedPlay } from "./screens/ranked";
import { shopScreen } from "./screens/shop";
import { tierScreen } from "./screens/tier";
import { applySkin } from "./skins";
import { loadSound, sound, tapSounds } from "./sound";
import type { Move } from "./game/flipTiles";

const app = document.querySelector<HTMLElement>("#app")!;

function render() {
  const route = currentRoute();

  // A ranked game on, and the player went elsewhere (the back arrow, Android's back button, a
  // link): that ends the game as a loss, so ask first; staying goes back to the game, whose
  // clock has kept running
  if (activeGame() && route.screen !== "ranked-play") {
    if (!confirm("Leave this ranked game? It counts as a loss (5:00).")) {
      go("#/ranked/play", true);
      return;
    }
    loseGame("left the game");
  }

  // A new player plays the tutorial first (the debug screen is always reachable)
  const step = tutorialStep();
  if (step && route.screen !== "debug" && !(route.screen === "level" && route.tier === step.tier && route.number === step.number)) {
    go(`#/level/${step.tier}/${step.number}`, true);
    return;
  }

  let next: HTMLElement;
  if (route.screen === "how-to-play") next = howToPlayScreen();
  else if (route.screen === "shop") next = shopScreen(render);
  else if (route.screen === "codex") next = codexScreen(render);
  else if (route.screen === "debug") next = debugScreen(render);
  else if (route.screen === "ranked") next = rankedLobby(render);
  else if (route.screen === "ranked-play") next = rankedPlay(render);
  else if (route.screen === "ranked-leaderboard") next = rankedLeaderboard(render);
  else if (route.screen === "home") next = homeScreen(render);
  else if (route.screen === "final") next = finalScreen();
  else if (route.screen === "final-play") {
    // (a goal not open yet: to the challenge's screen, which says what opens it)
    if (!isFinalGoalOpen(route.goal)) {
      go("#/final", true);
      return;
    }
    next = finalPlay(route.goal, render);
  }
  else {
    // A tier or level that doesn't exist, or isn't unlocked yet: back home
    const tier = findTier(route.tier);
    const level = route.screen === "level" ? findLevel(route.tier, route.number) : undefined;
    if (!tier || !isTierOpen(tier) || (route.screen === "level" && !level)) {
      go("#/", true); // the address changes, and that renders the home screen
      return;
    }
    // A level whose group isn't open yet: to its tier
    if (level && !isLevelOpen(tier, level)) {
      go(`#/tier/${tier.id}`, true);
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

// Sounds (sound.ts): a soft tap for every button, a tock for every tile pressed
tapSounds();
document.addEventListener("flip-tiles-press", (e) => {
  if ((e as CustomEvent<Move>).detail.kind === "force") sound.force();
  else sound.flip();
});

// Offline play on the web: the service worker saves the app's files on the device (see sw.js).
// Not in the native apps (their files are on the device already), nor while developing (npm run
// dev: there would be no list of files to save).
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform() && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {}); // (without it, the game still works online)
}

// The log first (it catches errors from here on), then what the player has
startLog().then(loadProgress).then(loadRanked).then(loadSound).then(loadAdRewards).then(() => {
  log("info", `Started: version ${__APP_VERSION__} (${__BUILD__}), ${Capacitor.getPlatform()}`);
  applySkin(activeLook());
  render();
  // Buying coins (native apps only): when coins come in, or the store's price arrives, the shop
  // is drawn again (other screens show the coins when next opened; a level must not restart)
  void initPurchases(() => {
    if (currentRoute().screen === "shop") render();
  });
  // Ads (native apps only): ready for when the player chooses to watch one; then the screen is
  // drawn again where an ad can be offered (not a level or a game: they must not restart)
  void initAds().then(() => {
    if (["shop", "home"].includes(currentRoute().screen)) render();
  });
  startSending(); // (ranked games waiting for the online leaderboard)
  // Console commands for testing (devConsole.ts: type ft.help() in the console). Only while
  // developing and in test builds: in a release build this is false, and the file left out.
  if (import.meta.env.DEV || TEST_BUILD) void import("./devConsole").then((m) => m.installDevConsole(render));
});
