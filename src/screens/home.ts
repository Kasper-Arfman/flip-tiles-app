// The home screen: the title, the stars and coins, and the tiers, each one a card with its
// progress. A tier that is still locked says what opens it: more stars in all, or coins.
import { TIERS, totalLevels } from "../levels/levels";
import {
  STAGE_REWARD, UNLOCK_COST, buyTier, coins, maxStars, payStageRewards, resetProgress, starsToUnlock, tierSolved,
  tierStars, totalStars,
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

// A completed stage's crown
const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>`;

export function homeScreen(rerender: () => void) {
  const total = totalStars();
  // Stages just completed: their reward is paid now, and the pouch shows the coins from before
  // until the coins have flown in (see flyCoins)
  const rewarded = payStageRewards();
  const shownCoins = coins() - STAGE_REWARD * rewarded.length;
  const cards = TIERS.map((tier, i) => {
    const max = maxStars(tier);
    const stars = tierStars(tier);
    const missing = starsToUnlock(tier);
    const head = `
      <span class="tier-title">${stageTitle(tier)}</span>
      ${difficultyMarks(i + 1)}`; // (difficulty marks: 1 for the first stage, one more per stage)
    if (missing) {
      return `<li><div class="tier-card locked">
        ${head}
        <span class="tier-meta">${LOCK} Earn ${plural(missing, "more star")} to open</span>
        <button type="button" class="unlock-button" data-difficulty="${tier.difficulty}"
          ${coins() < UNLOCK_COST ? "disabled" : ""}>Unlock for ${coin()} ${UNLOCK_COST}</button>
      </div></li>`;
    }
    // Every star of the stage earned: a gold card, with a crown and Complete
    const complete = stars === max;
    const meta = complete
      ? `<span class="tier-meta complete-badge">${CROWN} Complete</span>`
      : `<span class="tier-meta">${plural(tier.levels.length, "level")} · ${tierSolved(tier)} solved</span>`;
    return `<li><a class="tier-card${complete ? " complete" : ""}" href="#/tier/${tier.difficulty}"
      data-difficulty="${tier.difficulty}">
      ${head}
      ${meta}
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
        <a class="pill coin-pill" href="#/shop" aria-label="${coins()} coins: to the shop">${coin()}
          <span class="coin-total">${shownCoins}</span></a>
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

  // The reward of each stage just completed: once the screen is up (after the title's tiles
  // have flipped in), its coins burst out of the stage's card and fly into the pouch, one stage
  // after the other
  if (rewarded.length) {
    window.setTimeout(() => {
      if (!element.isConnected) return; // (the player already left)
      const pouch = element.querySelector<HTMLElement>(".coin-pill")!;
      const total = element.querySelector<HTMLElement>(".coin-total")!;
      let count = shownCoins;
      rewarded.forEach((tier, i) => {
        const card = element.querySelector<HTMLElement>(`.tier-card[data-difficulty="${tier.difficulty}"]`)!;
        window.setTimeout(() => flyCoins(card, pouch, (amount) => {
          count += amount;
          total.textContent = String(count);
        }), i * 900);
      });
    }, 900);
  }

  element.querySelector(".reset-progress")!.addEventListener("click", async () => {
    if (!confirm("Remove all your stars, coins, hints and solutions, and start over?")) return;
    await resetProgress();
    rerender();
  });
  return element;
}

// A stage's reward on its way: "+50" rises from the card, and its coins burst out of the card's
// middle in all directions, hang a moment, then fly into the pouch one after the other. Each
// coin that lands adds its share to the count (`add`), and the pouch bumps. Without motion (the
// player asked for less), the coins are just added.
const FLYING_COINS = 10;

function flyCoins(card: HTMLElement, pouch: HTMLElement, add: (amount: number) => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    add(STAGE_REWARD);
    return;
  }
  const from = card.getBoundingClientRect();
  const icon = (pouch.querySelector(".coin") ?? pouch).getBoundingClientRect();
  // (a card below the screen's edge: the coins come up from the bottom of the screen)
  const start = { x: from.left + from.width / 2, y: Math.min(from.top + from.height / 2, window.innerHeight - 60) };
  const end = { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 };

  const plus = document.createElement("div");
  plus.className = "reward-plus";
  plus.innerHTML = `+${STAGE_REWARD} ${coin()}`;
  plus.style.left = `${start.x}px`;
  plus.style.top = `${Math.min(from.top, window.innerHeight - 100)}px`;
  document.body.append(plus);
  plus.addEventListener("animationend", () => plus.remove());
  card.classList.remove("paying");
  void card.offsetWidth;
  card.classList.add("paying");

  let landed = 0;
  let paid = 0;
  for (let i = 0; i < FLYING_COINS; i++) {
    const flyer = document.createElement("div");
    flyer.className = "flying-coin";
    flyer.innerHTML = coin();
    flyer.style.left = `${start.x}px`;
    flyer.style.top = `${start.y}px`;
    document.body.append(flyer);
    // Out in a random direction, 50 to 90 px, then to the pouch
    const angle = (i / FLYING_COINS) * 2 * Math.PI + Math.random() * 0.5;
    const reach = 50 + Math.random() * 40;
    const out = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * 0.8 };
    const to = { x: end.x - start.x, y: end.y - start.y };
    const spin = Math.random() < 0.5 ? -1 : 1;
    const flight = flyer.animate([
      { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0, easing: "cubic-bezier(0.15, 0.8, 0.3, 1)" },
      { transform: `translate(calc(${out.x}px - 50%), calc(${out.y}px - 50%)) scale(1.15) rotate(${spin * 90}deg)`,
        opacity: 1, offset: 0.35 },
      { transform: `translate(calc(${out.x}px - 50%), calc(${out.y + 6}px - 50%)) scale(1.1) rotate(${spin * 110}deg)`,
        opacity: 1, offset: 0.5, easing: "cubic-bezier(0.55, 0, 0.85, 0.4)" },
      { transform: `translate(calc(${to.x}px - 50%), calc(${to.y}px - 50%)) scale(0.6) rotate(${spin * 360}deg)`,
        opacity: 1 },
    ], { duration: 1300, delay: i * 55, fill: "both" });
    flight.onfinish = () => {
      flyer.remove();
      landed++;
      // Its share of the reward (the last one rounds it off)
      const share = landed === FLYING_COINS ? STAGE_REWARD - paid : Math.round(STAGE_REWARD / FLYING_COINS);
      paid += share;
      add(share);
      pouch.classList.remove("bump");
      void pouch.offsetWidth;
      pouch.classList.add("bump");
    };
  }
}
