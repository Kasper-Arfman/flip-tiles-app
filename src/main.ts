// The app: loads what the player has (and puts on their skin), then shows the screen the address (after the #) asks for, and
// a new one each time it changes. See nav.ts for the addresses.
import "@fontsource/lilita-one/latin-400.css"; // the title's font, inside the app (works offline)
import "./game/flip-tiles.css";
import "./styles.css";
import { findLevel, findTier } from "./levels/levels";
import { currentRoute, go, goUp, onNavigate } from "./nav";
import { activeSkin, hasSeenRules, isLevelOpen, loadProgress, starsToUnlock } from "./progress";
import { homeScreen } from "./screens/home";
import { howToPlayScreen } from "./screens/howToPlay";
import { levelScreen } from "./screens/level";
import { shopScreen } from "./screens/shop";
import { tierScreen } from "./screens/tier";
import { applySkin } from "./skins";

const app = document.querySelector<HTMLElement>("#app")!;

function render() {
  const route = currentRoute();
  let next: HTMLElement;
  if (route.screen === "how-to-play") next = howToPlayScreen();
  else if (route.screen === "shop") next = shopScreen(render);
  else if (route.screen === "home") next = homeScreen(render);
  else if (!hasSeenRules()) {
    // A new player goes through How to play first (instead of this screen in the history)
    go("#/how-to-play", true);
    return;
  } else {
    // A tier or level that doesn't exist, or isn't open yet: back home
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
loadProgress().then(() => {
  applySkin(activeSkin());
  render();
});
