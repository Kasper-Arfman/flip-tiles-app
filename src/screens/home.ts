// The home screen: the title, the stars and coins, and the tiers, each one a card with its
// progress. A tier that is still locked says what opens it: more stars in all, or coins.
import { BONUS_TIERS, TIERS, bonusOf, findTier, type Tier } from "../levels/levels";
import {
  BONUS_UNLOCK_COST, FINAL_RUN_STARS, UNLOCK_COST, activeLook, hasFinalStar, isFinalGoalOpen, bonusStars, buyTier, canBuyBonus, coins, entriesToClaim, isTierOpen, maxStars, payStageRewards, resetProgress,
  rewardOf, stageStars, starsToUnlock, tierSolved, tierStars, totalStars,
} from "../progress";
import { TEST_BUILD } from "../dev";
import { adsAvailable, privacyOptionsRequired, showPrivacyOptions } from "../ads";
import { adOffer } from "../adRewards";
import { CLAPPER, canTopUp, openAdOffer, openTopUp } from "./topUp";
import { go } from "../nav";
import { applySkin } from "../skins";
import { setSoundOn, sound, soundOn } from "../sound";
import { homeArt } from "./homeArt";
import { fetchTopPlayer, knownTopPlayer } from "../ranked/online";
import { STOPWATCH, TROPHY, showLeaderboard } from "./ranked";
import { LOCK, coin, difficultyMarks, plural, screen, stageTitle, star } from "./ui";
import { offerBonus } from "./tier";

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

// The Codex button: a light bulb
const BULB = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6.5 6.5 0 0 0-3.8 11.8c.8.6 1.3 1.4 1.3 2.2h5c0-.8.5-1.6 1.3-2.2A6.5 6.5 0 0 0 12 3z" />` +
  `<path d="M10 20.5h4" fill="none" /></svg>`;

// The sound button: a speaker, with waves when the sound is on, crossed out when it's off
const speaker = (on: boolean) => `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />` +
  (on
    ? `<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" />`
    : `<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" />`) + `</svg>`;

// A completed stage's crown
const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>`;

const escapeText =(text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function homeScreen(rerender: () => void) {
  const total = totalStars();
  // The stars at the top: the stages' (of all they have), and once a stage's bonus levels are
  // open, the bonus stars apart, in blue (the color of the bonus bars)
  const stageLevels = TIERS.reduce((n, t) => n + t.levels.length, 0);
  const bonusOpen = BONUS_TIERS.some(isTierOpen);
  const toClaim = entriesToClaim();
  // Stages (or bonus levels) just completed: their reward is paid now, and the pouch shows the
  // coins from before until the coins have flown in (see flyCoins)
  const rewarded = payStageRewards();
  const shownCoins = coins() - rewarded.reduce((n, t) => n + rewardOf(t), 0);
  // A stage's card
  const card = (tier: Tier) => {
    const max = maxStars(tier);
    const stars = tierStars(tier);
    const missing = starsToUnlock(tier);
    const head = `
      <span class="tier-title">${stageTitle(tier)}</span>
      ${difficultyMarks(TIERS.indexOf(tier) + 1)}`; // (1 for the first stage, one more per stage)
    if (missing) {
      return `<li><div class="tier-card locked">
        ${head}
        <span class="tier-meta">${LOCK} Earn ${plural(missing, "more star")} in the stages above to open</span>
        <button type="button" class="unlock-button" data-tier="${tier.id}"
          ${coins() < UNLOCK_COST ? "disabled" : ""}>Unlock for ${coin()} ${UNLOCK_COST}</button>
      </div></li>`;
    }
    // Every star of the stage earned: a gold card, with a crown and Complete
    const complete = stars === max;
    // Complete, with its bonus levels bought: a second bar right under the first, for the bonus
    // stars; their count (blue) in place of the stage's (all earned); and the card opens on the
    // bonus levels. (Not bought yet: they are offered on the stage's screen, tier.ts.)
    const bonus = complete && bonusOf(tier) && isTierOpen(bonusOf(tier)!) ? bonusOf(tier) : undefined;
    // And every bonus star too (a big achievement): the card turns to ice and diamond, Mastered,
    // with no count (see .mastered in home.css)
    const mastered = bonus !== undefined && tierStars(bonus) === maxStars(bonus);
    const meta = mastered
      ? `<span class="tier-meta complete-badge mastered-badge">${CROWN} Mastered</span>`
      : complete
        ? `<span class="tier-meta complete-badge">${CROWN} Complete</span>`
        : `<span class="tier-meta">${plural(tier.levels.length, "level")} · ${tierSolved(tier)} solved</span>`;
    const count = mastered
      ? ""
      : bonus
        ? `<span class="tier-stars blue-stars">${star(true)} ${tierStars(bonus)} / ${maxStars(bonus)}</span>`
        : `<span class="tier-stars">${star(stars > 0)} ${stars} / ${max}</span>`;
    const bonusBar = bonus
      ? `<span class="progress bonus-progress" style="--done: ${tierStars(bonus) / maxStars(bonus)}"></span>`
      : "";
    // Complete, its bonus levels not bought yet: offered right under the card, on a blue strip
    // joined to it, with the price (tapped: the offer, tier.ts)
    const forSale = complete && bonusOf(tier) && canBuyBonus(bonusOf(tier)!) ? bonusOf(tier) : undefined;
    const offer = forSale
      ? `<button type="button" class="bonus-strip" data-bonus="${forSale.id}">
          <span class="bonus-strip-text"><strong>Bonus levels</strong> ${forSale.levels.length} new puzzles</span>
          <span class="bonus-strip-price">Unlock for ${coin()} ${BONUS_UNLOCK_COST}</span>
        </button>`
      : "";
    return `<li><a class="tier-card${complete ? " complete" : ""}${mastered ? " mastered" : ""}${forSale ? " has-offer" : ""}"
      href="#/tier/${(bonus ?? tier).id}" data-tier="${tier.id}">
      ${head}
      ${meta}
      ${count}
      <span class="progress" style="--done: ${stars / max}"></span>
      ${bonusBar}
    </a>${offer}</li>`;
  };
  const cards = TIERS.map(card).join("");

  const element = screen("home-screen", `
    <div class="home-art">${homeArt()}</div>
    <a class="round-button shop-button" href="#/shop" aria-label="Shop">${BAG}</a>
    <a class="round-button codex-button" href="#/codex"
      aria-label="Codex${toClaim ? `: ${toClaim} to claim` : ""}">${BULB}${toClaim ? `<span class="notification-bubble" aria-hidden="true">${toClaim}</span>` : ""}</a>
    ${adsAvailable() ? (() => {
      // (its badge: how many videos are ready, 1 to 3; none when none is)
      const ready = adOffer().left;
      return `<button type="button" class="round-button ad-button"
        aria-label="Free coins: ${ready} video${ready === 1 ? "" : "s"} ready">${CLAPPER}${ready
        ? `<span class="notification-bubble" aria-hidden="true">${ready}</span>` : ""}</button>`;
    })() : ""}
    <button type="button" class="round-button sound-button" aria-pressed="${soundOn()}"
      aria-label="Sound">${speaker(soundOn())}</button>
    <a class="round-button help-button${total === 0 ? " first-time" : ""}" href="#/how-to-play" aria-label="How to play">?</a>
    <header class="home-header">
      <h1 class="game-title" aria-label="Flip Tiles">
        <span class="title-row">${titleTiles("FLIP", 0)}</span>
        <span class="title-row">${titleTiles("TILES", 4)}</span>
      </h1>
      <p class="wealth">
        <span class="pill" aria-label="${stageStars()} stars">${star(true)} ${stageStars()} / ${3 * stageLevels + FINAL_RUN_STARS}</span>
        ${bonusOpen ? `<span class="pill bonus-pill blue-stars" aria-label="${bonusStars()} bonus stars">${star(true)} ${bonusStars()}</span>` : ""}
        ${canTopUp()
          ? `<button type="button" class="pill coin-pill" aria-label="${coins()} coins: top up">${coin()}
              <span class="coin-total">${shownCoins}</span></button>`
          : `<a class="pill coin-pill" href="#/shop" aria-label="${coins()} coins: to the shop">${coin()}
              <span class="coin-total">${shownCoins}</span></a>`}
      </p>
    </header>
    <ul class="tiers">
      <li class="ranked-row">
        <a class="tier-card ranked-entry" href="#/ranked">
          <span class="tier-title">${STOPWATCH} Ranked</span>
          <span class="top-player"${knownTopPlayer() ? "" : " hidden"}>#1
            <span class="top-name">${escapeText(knownTopPlayer() ?? "")}</span></span>
        </a>
        <a class="leaderboard-button" href="#/ranked/leaderboard" aria-label="Leaderboards">${TROPHY}</a>
      </li>
      ${cards}
    </ul>
    <a class="final-card" href="#/final">
      <span class="final-card-eyebrow">The final challenge</span>
      <span class="final-card-title">Are you ready?</span>
      ${(() => {
        // (its stars: Solve it's, gold; and once every bonus star is earned, the two blue ones)
        const goals = isFinalGoalOpen("flips") ? (["solve", "flips", "moves"] as const) : (["solve"] as const);
        return `<span class="final-card-stars" aria-label="${goals.filter(hasFinalStar).length} of ${goals.length} stars">${
          star(hasFinalStar("solve"))}${goals.length > 1
          ? `<span class="blue-stars">${star(hasFinalStar("flips"))}${star(hasFinalStar("moves"))}</span>` : ""}</span>`;
      })()}
    </a>
    <footer class="home-footer">
      <button type="button" class="reset-progress">Reset progress</button>
      ${privacyOptionsRequired() ? `<button type="button" class="reset-progress privacy-settings">Privacy settings</button>` : ""}
      <button type="button" class="app-version">Version ${__APP_VERSION__}${TEST_BUILD ? " (test)" : ""}</button>
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

  // The sound, on or off (saved: sound.ts)
  const soundButton = element.querySelector<HTMLButtonElement>(".sound-button")!;
  soundButton.addEventListener("click", () => {
    setSoundOn(!soundOn());
    soundButton.setAttribute("aria-pressed", String(soundOn()));
    soundButton.innerHTML = speaker(soundOn());
  });

  // Open a locked tier with coins
  for (const button of element.querySelectorAll<HTMLButtonElement>(".unlock-button")) {
    button.addEventListener("click", () => {
      const tier = TIERS.find((t) => t.id === Number(button.dataset.tier))!;
      if (!confirm(`Unlock ${tier.name} for ${UNLOCK_COST} coins?`)) return;
      if (buyTier(tier)) rerender();
    });
  }
  // A complete stage's bonus levels for sale (the strip under its card): the offer
  for (const strip of element.querySelectorAll<HTMLElement>(".bonus-strip")) {
    strip.addEventListener("click", () => offerBonus(findTier(Number(strip.dataset.bonus))!, rerender));
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
        // (bonus levels: from their stage's card)
        const card = element.querySelector<HTMLElement>(`.tier-card[data-tier="${(tier.main ?? tier).id}"]`)!;
        window.setTimeout(() => flyCoins(card, pouch, rewardOf(tier), (amount) => {
          count += amount;
          total.textContent = String(count);
        }), i * 900);
      });
    }, 900);
  }

  // Free coins: first a popup with what a video gives (topUp.ts); the coins show when it is done
  element.querySelector(".ad-button")?.addEventListener("click", () => openAdOffer(rerender));

  // The coins: Top up (a video, coin packs; topUp.ts), where there is anything to top up with;
  // else (the web version) the coins are a link to the shop
  element.querySelector("button.coin-pill")?.addEventListener("click", () => openTopUp(rerender));
  // Where the law asks for it (Europe): the player can change their ad privacy choice (ads.ts)
  element.querySelector(".privacy-settings")?.addEventListener("click", () => void showPrivacyOptions());

  // The version: tapped 5 times in a row (within 2 seconds of each other), the debug screen
  let taps = 0;
  let lastTap = 0;
  element.querySelector(".app-version")!.addEventListener("click", () => {
    const now = Date.now();
    taps = now - lastTap < 2000 ? taps + 1 : 1;
    lastTap = now;
    if (taps >= 5) go("#/debug");
  });

  element.querySelector(".reset-progress")!.addEventListener("click", async () => {
    if (!confirm("Remove all your stars, coins, hints, solutions and Codex entries, and start over? " +
      "(Coins you bought are given back.)")) return;
    await resetProgress();
    applySkin(activeLook()); // back to the start's look (Classic, the square)
    rerender();
  });

  // The gold button opens Top Ranked Players
  element.querySelector(".leaderboard-button")!.addEventListener("click", () => showLeaderboard("overall"));

  // The world's #1, on the Ranked card (the last one known shows at once; offline it stays)
  const topPlayer = element.querySelector<HTMLElement>(".top-player")!;
  fetchTopPlayer().then((name) => {
    if (!element.isConnected) return;
    topPlayer.hidden = !name;
    topPlayer.querySelector(".top-name")!.textContent = name ?? "";
  }, () => {});
  return element;
}

// A reward on its way: "+50" (or what it is) rises from the card, and its coins burst out of the card's
// middle in all directions, hang a moment, then fly into the pouch one after the other. Each
// coin that lands adds its share to the count (`add`), and the pouch bumps. Without motion (the
// player asked for less), the coins are just added.
const FLYING_COINS = 10;

function flyCoins(card: HTMLElement, pouch: HTMLElement, reward: number, add: (amount: number) => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    add(reward);
    return;
  }
  const from = card.getBoundingClientRect();
  const icon = (pouch.querySelector(".coin") ?? pouch).getBoundingClientRect();
  // (a card below the screen's edge: the coins come up from the bottom of the screen)
  const start = { x: from.left + from.width / 2, y: Math.min(from.top + from.height / 2, window.innerHeight - 60) };
  const end = { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 };

  const plus = document.createElement("div");
  plus.className = "reward-plus";
  plus.innerHTML = `+${reward} ${coin()}`;
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
      const share = landed === FLYING_COINS ? reward - paid : Math.round(reward / FLYING_COINS);
      paid += share;
      add(share);
      sound.coin();
      pouch.classList.remove("bump");
      void pouch.offsetWidth;
      pouch.classList.add("bump");
    };
  }
}
