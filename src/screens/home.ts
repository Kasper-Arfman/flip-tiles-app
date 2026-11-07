// The home screen: the title, the stars and coins, and the tiers, each one a card with its
// progress. A tier that is still locked says what opens it: stars in the tier before, or coins.
import { TIERS, totalLevels } from "../levels/levels";
import {
  UNLOCK_COST, buyTier, coins, maxStars, resetProgress, starsToUnlock, tierSolved, tierStars, totalStars,
} from "../progress";
import { homeArt } from "./homeArt";
import { LOCK, coin, difficultyMarks, plural, screen, stageTitle, star } from "./ui";

// The game's title: every letter on a tile of the puzzle, green and gold in turn (`first` is
// the place of the first letter in the whole title, so the colors run on to the second row).
// The tiles flip in one after the other when the screen opens.
const titleTiles = (word: string, first: number) =>
  [...word].map((letter, i) => {
    const k = first + i;
    return `<span class="title-tile flip-in${k % 2 ? " gold" : ""}" style="--i: ${k}" aria-hidden="true">${letter}</span>`;
  }).join("");

// The shop's button: a shopping bag
const BAG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z" />` +
  `<path d="M9 10V6.5a3 3 0 0 1 6 0V10" fill="none" /></svg>`;

export function homeScreen(rerender: () => void) {
  const total = totalStars();
  const cards = TIERS.map((tier, i) => {
    const max = maxStars(tier);
    const stars = tierStars(tier);
    const missing = starsToUnlock(tier);
    const head = `
      <span class="tier-title">${stageTitle(tier)}</span>
      ${difficultyMarks(tier.difficulty)}`;
    if (missing) {
      return `<li><div class="tier-card locked">
        ${head}
        <span class="tier-meta">${LOCK} Earn ${plural(missing, "more star")} in ${TIERS[i - 1].name} to open</span>
        <button type="button" class="unlock-button" data-difficulty="${tier.difficulty}"
          ${coins() < UNLOCK_COST ? "disabled" : ""}>Unlock for ${coin()} ${UNLOCK_COST}</button>
      </div></li>`;
    }
    return `<li><a class="tier-card" href="#/tier/${tier.difficulty}">
      ${head}
      <span class="tier-meta">${plural(tier.levels.length, "level")} · ${tierSolved(tier)} solved</span>
      <span class="tier-stars">${star(stars > 0)} ${stars} / ${max}</span>
      <span class="progress" style="--done: ${stars / max}"></span>
    </a></li>`;
  }).join("");

  const element = screen("home-screen", `
    <div class="home-art">${homeArt()}</div>
    <a class="round-button shop-button" href="#/shop" aria-label="Shop">${BAG}</a>
    <a class="round-button help-button${total === 0 ? " first-time" : ""}" href="#/how-to-play" aria-label="How to play">?</a>
    <header class="home-header">
      <h1 class="game-title" aria-label="Flip Tiles">
        <span class="title-row">${titleTiles("FLIP", 0)}</span>
        <span class="title-row">${titleTiles("TILES", 4)}</span>
      </h1>
      <p class="wealth">
        <span class="pill" aria-label="${total} stars">${star(true)} ${total} / ${3 * totalLevels}</span>
        <a class="pill" href="#/shop" aria-label="${coins()} coins: to the shop">${coin()} ${coins()}</a>
      </p>
    </header>
    <ul class="tiers">${cards}</ul>
    <footer class="home-footer">
      <button type="button" class="reset-progress">Reset progress</button>
    </footer>`);

  // Tap a letter of the title: its tile flips over to the other color (just for fun)
  for (const tile of element.querySelectorAll<HTMLElement>(".title-tile")) {
    tile.addEventListener("click", () => {
      tile.classList.remove("flip-in", "flipping");
      void tile.offsetWidth; // restart the animation
      tile.classList.add("flipping");
      // the color changes halfway, when the tile is edge-on
      setTimeout(() => tile.classList.toggle("gold"), 200);
    });
  }

  // Open a locked tier with coins
  for (const button of element.querySelectorAll<HTMLButtonElement>(".unlock-button")) {
    button.addEventListener("click", () => {
      const tier = TIERS.find((t) => t.difficulty === Number(button.dataset.difficulty))!;
      if (!confirm(`Unlock ${tier.name} for ${UNLOCK_COST} coins?`)) return;
      if (buyTier(tier)) rerender();
    });
  }

  element.querySelector(".reset-progress")!.addEventListener("click", async () => {
    if (!confirm("Remove all your stars, coins, hints and solutions, and start over?")) return;
    await resetProgress();
    rerender();
  });
  return element;
}
