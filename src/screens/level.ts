// A level: its three goals, the board, hints, a replay of the best solve, and when it is solved,
// the level's stars.
//
// The board is the flip tiles widget (src/game). After every move it sends a "flip-tiles-change"
// event with the moves on the board; making a move twice cancels it, so these are the moves that
// count. From them this screen shows the progress on each goal, the forces left, dims the goals this attempt can no longer reach,
// and when the board is solved, works out the stars:
//   1. solved
//   2. only flips, and exactly minFlips of them (fewer is impossible)
//   3. exactly minMoves moves (fewer is impossible)
//
// Hints: the goals "N moves" and "N flips" are buttons. Tapping one shows the hints bought
// for it on the board (a hollow diamond, gold = flip that tile, red = force it); each hint costs a coin and
// shows one more move of a solution for that goal. The order of moves doesn't matter, so the
// marks stay right whatever moves have been made already.
//
// Replay: every solve is recorded (see progress.ts); Replay opens a popup to step through them
// (replayDialog.ts).
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import { findTier, levelName, nextLevel, type Level } from "../levels/levels";
import { go } from "../nav";
import { sound } from "../sound";
import {
  ALL_STARS, HINT_COST, STAR_FLIPS, STAR_MOVES, STAR_SOLVED, award, buyHint, coins, countStars,
  finishTutorial, hasRecordedSolves, hintsBought, isLevelOpen, isTierComplete, recordSolve, solutionFor, starsOf, tutorialStep,
  type HintGoal,
} from "../progress";
import { openCodex } from "./codex";
import { showBonusTabOf } from "./tier";
import { confirmFlips, warnsAboutFlips } from "./flipsWarning";
import { openReplays } from "./replayDialog";
import { bigStarGold, bigStarSocket, coin, notice, plural, screen, star, topbar } from "./ui";
import { adsAvailable, watchAd } from "../ads";
import { adOffer } from "../adRewards";

// The result's animation (stars and buttons over the solved board): its timing, in seconds, all
// here to tweak. It starts together with the board's Solved! (the widget says when that is: a
// little before its wave of light is through, STAMP_SHARE in src/game/FlipTilesElement.ts), and
// the times count from then. The CSS (styles/components/result.css) takes them from here.
const RESULT_TIMING = {
  firstStar: 0, // the first star starts to drop
  betweenStars: 0.45, // each next star drops this much later
  starDrop: 0.55, // one star's drop: from big above the board to settled in its socket
  finalePause: 0, // three stars: the finale (glow, jump, "Three stars!") this long after the last star settled
  menuAfter: 1.35, // the solve that completes a stage: to the menu this long after the last star settled
};
// (a star touches its socket 55% into its drop, as in the star-land keyframes: the ring, the
// sparks and the ding come then)
const TOUCHDOWN = 0.55;

// The tutorial's hand, the way casual games draw it: a white cartoon hand with a dark outline,
// tilted a little, so it shows on any tile color (the dark skins included). Its outline is the
// "hand-pointer" icon of Font Awesome Free 6.7.2 (fontawesome.com, icons licensed CC BY 4.0)
// without the lines on its palm, plus short lines between the fingers and a soft shade on the
// palm's side. Its fingertip is at (168, 0) of its 448 x 512, and it is turned around that point.
const HAND = `<svg class="touch-finger" viewBox="0 0 448 512" aria-hidden="true">
  <g transform="rotate(-18 168 0)" stroke="#1b1d22" stroke-linecap="round" stroke-linejoin="round">
    <path fill="#ffffff" stroke-width="40" paint-order="stroke"
      d="M128 40c0-22.1 17.9-40 40-40s40 17.9 40 40l0 148.2c8.5-7.6 19.7-12.2 32-12.2c20.6 0 38.2 13 45 31.2c8.8-9.3 21.2-15.2 35-15.2c25.3 0 46 19.5 47.9 44.3c8.5-7.7 19.8-12.3 32.1-12.3c26.5 0 48 21.5 48 48l0 48 0 16 0 48c0 70.7-57.3 128-128 128l-16 0-64 0-.1 0-5.2 0c-5 0-9.9-.3-14.7-1c-55.3-5.6-106.2-34-140-79L8 336c-13.3-17.7-9.7-42.7 8-56s42.7-9.7 56 8l56 74.7L128 40z" />
    <path fill="#dfe3ea" stroke="none"
      d="M392 256c13 4 24 16 24 32l0 112c0 50-30 90-74 106c26-28 40-62 40-106l0-112c0-14 4-26 10-32z" />
    <path fill="none" stroke-width="16" d="M208 200l0 64M285 214l0 52M368 236l0 34" />
  </g>
</svg>`;

export function levelScreen(level: Level) {
  showBonusTabOf(level); // (back on its stage's screen: the bonus tab of this level)
  const next = nextLevel(level);
  const tierHash = `#/tier/${level.tier}`;
  const nextIsOpen = () => next !== undefined && isLevelOpen(findTier(level.tier)!, next);
  const earnedBefore = (bit: number) => (starsOf(level) & bit) !== 0;
  // The flips goal by what it asks (its count follows in its "(0/2)"). Before: "2 flips":
  //   flips: plural(level.minFlips, "flip"),
  const goalNames: Record<HintGoal, string> = {
    flips: "Flips-only", moves: plural(level.minMoves, "move"),
  };
  // A step of the tutorial (a new player's first two levels): a finger shows what to do, and the
  // only way on is Next level (no back arrow, hints or Retry)
  const guided = tutorialStep() === level;
  const endsTutorial = guided && level.number === 2; // solving it finishes the tutorial
  // A bonus level: its stars are blue (blue-stars, in icons.css), the big ones of the result too
  const bonusLevel = findTier(level.tier)?.main !== undefined;

  const element = screen(`level-screen${guided ? " guided" : ""}${bonusLevel ? " blue-stars" : ""}`, `
    ${topbar(levelName(level), guided ? undefined : tierHash, `${coin()} <span class="coin-count">${coins()}</span>`)}
    <div class="hint-bar"${guided ? " hidden" : ""}>
      <button type="button" class="replay" hidden>▶ Replay</button>
      <button type="button" class="open-codex">Codex</button>
      <button type="button" class="buy-hint">Hint · ${coin()} ${HINT_COST}</button>
      <button type="button" class="ad-hint primary" hidden>▶ Free hint <small class="ad-left"></small></button>
    </div>
    <ol class="goals">
      <li class="goal" data-star="${STAR_SOLVED}">${star(earnedBefore(STAR_SOLVED))}<span>Solve it</span></li>
      <li><button type="button" class="goal" data-star="${STAR_MOVES}" data-goal="moves" aria-pressed="false">
        ${star(earnedBefore(STAR_MOVES))}<span>${goalNames.moves}</span><small class="goal-progress">(0/${level.minMoves})</small></button></li>
      <li><button type="button" class="goal${level.expertFlips ? " expert" : ""}" data-star="${STAR_FLIPS}"
        data-goal="flips" aria-pressed="false"${level.expertFlips ? ` aria-description="Expert: far harder than the rest of this stage"` : ""}>
        ${level.expertFlips ? `<span class="expert-badge">Expert</span>` : ""}
        ${star(earnedBefore(STAR_FLIPS))}<span>${goalNames.flips}</span><small class="goal-progress">(0/${level.minFlips})</small></button></li>
    </ol>
    <p class="available-forces" role="img">Available forces:
      ${level.maxForces > 0
        ? `<span class="force-slots">${Array.from({ length: level.maxForces }, () => `<i class="force-slot filled"></i>`).join("")}</span>`
        : "none"}</p>
    <div class="board-slot"></div>
    <div class="result" hidden aria-live="polite">
      <div class="result-stars" role="img"></div>
      <p class="result-title"></p>
      <div class="result-bottom">
        <div class="result-buttons">
          <button type="button" class="again"${guided ? " hidden" : ""}>Retry</button>
          <button type="button" class="next-level">Next level</button>
        </div>
      </div>
    </div>`);

  const widget = createFlipTiles({
    solver: false,
    newGame: false,
    start: level.board,
    maxMoves: 50, // every tile flipped and forced once: no real limit
    allowForce: level.maxForces > 0,
    maxForces: level.maxForces,
  }) as HTMLElement & FlipTilesControls;
  element.querySelector(".board-slot")!.append(widget);

  // The forces left work like the hearts of a game: all full at the start, one empties per force
  // used, and they shake when the player tries to force with none left
  const forceRow = element.querySelector<HTMLElement>(".available-forces")!;
  const forceSlots = [...forceRow.querySelectorAll<HTMLElement>(".force-slot")];
  widget.addEventListener("flip-tiles-no-forces-left", () => {
    forceRow.classList.remove("denied");
    void forceRow.offsetWidth; // (restart the shake, also when it is still running)
    forceRow.classList.add("denied");
  });

  // The result: a layer of decorations over the solved board, so it goes inside the board
  const result = element.querySelector<HTMLElement>(".result")!;
  widget.querySelector(".board")!.append(result);

  // The tutorial's finger, over the tile to press: tapping (1.1), or tapping and holding (1.2),
  // with what it does written under it. Only that move on that tile works, so the step is always
  // solved (see canPress below).
  let finger: HTMLElement | undefined;
  let tutorialMove: { tile: number; force: boolean } | undefined;
  if (guided) {
    const holding = level.number === 2;
    const bits = level.board.replace(/\s/g, "");
    const target = holding ? [...bits].findIndex((b) => bits.split(b).length === 2) : 12; // the odd one / the middle
    finger = document.createElement("div");
    finger.className = `touch-guide ${holding ? "hold" : "tap"}`;
    finger.setAttribute("aria-hidden", "true");
    finger.style.setProperty("--x", `${((target % 5) + 0.5) * 20}%`);
    finger.style.setProperty("--y", `${(Math.floor(target / 5) + 0.5) * 20}%`);
    // (a tap: a ripple; a hold: a hollow ring that a growing disc fills, like a loading circle)
    const press = holding
      ? `<span class="hold-track"><span class="hold-fill"></span></span>`
      : `<span class="touch-ring"></span>`;
    finger.innerHTML = `${press}${HAND}<span class="touch-text">${holding ? "Tap and hold to force" : "Tap to flip"}</span>`;
    widget.querySelector(".board")!.append(finger);
    // 1.1: only a flip (a tap or a click) on the middle; 1.2: only a force (a hold, or a right
    // click) on the odd tile
    tutorialMove = { tile: target, force: holding };
  }
  // The player's presses on the tiles: none once the board is solved (the result is on it; Retry,
  // or < to take the last move back, opens it again), and in the tutorial only its one move
  widget.canPress = (tile, force) =>
    !element.classList.contains("level-complete") &&
    (!tutorialMove || (tile === tutorialMove.tile && force === tutorialMove.force));
  let resultTimer: number | undefined;
  const hideResult = () => {
    clearTimeout(resultTimer);
    result.hidden = true;
  };
  const goals = [...element.querySelectorAll<HTMLElement>(".goal")];
  const progressMoves = element.querySelector<HTMLElement>('[data-goal="moves"] .goal-progress')!;
  const progressFlips = element.querySelector<HTMLElement>('[data-goal="flips"] .goal-progress')!;
  const goalButtons = [...element.querySelectorAll<HTMLButtonElement>("button.goal")];
  const buyButton = element.querySelector<HTMLButtonElement>(".buy-hint")!;
  const adButton = element.querySelector<HTMLButtonElement>(".ad-hint")!;
  const adLeft = adButton.querySelector<HTMLElement>(".ad-left")!;
  const replayButton = element.querySelector<HTMLButtonElement>(".replay")!;
  const coinCount = element.querySelector<HTMLElement>(".coin-count")!;

  // --- hints ---------------------------------------------------------------------------------
  let hintGoal: HintGoal | null = null; // the goal whose hints are shown

  // A goal whose star is earned sells no more hints (its hints bought before still show)
  const starEarned = (goal: HintGoal) => (starsOf(level) & (goal === "flips" ? STAR_FLIPS : STAR_MOVES)) !== 0;
  const hintsLeft = (goal: HintGoal) => (starEarned(goal) ? 0 : solutionFor(level, goal).length - hintsBought(level, goal));

  const showHints = () => {
    goalButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.goal === hintGoal)));
    coinCount.textContent = String(coins());
    const left = hintGoal ? hintsLeft(hintGoal) : hintsLeft("flips") + hintsLeft("moves");
    // Not enough coins for a hint (and hints left to give): a short video pays for one (ads.ts), at
    // once (no waiting for the next video), as long as today's limit isn't reached
    // (today's videos all watched: it stays, greyed out, "Come back tomorrow")
    const offer = adOffer(true);
    adButton.hidden = guided || left === 0 || coins() >= HINT_COST || !adsAvailable();
    if (!adButton.classList.contains("busy")) adButton.disabled = !offer.canWatch;
    adLeft.textContent = offer.canWatch ? `${offer.todayLeft} left today` : "Come back tomorrow";
    // (the free hint takes the paid Hint button's place: not enough coins for that one anyway)
    buyButton.hidden = !adButton.hidden;
    if (!hintGoal) {
      widget.setMarks([]);
      // Always ready to sell a hint (it asks which one), unless there are none left to sell
      buyButton.disabled = coins() < HINT_COST || left === 0;
      return;
    }
    const solution = solutionFor(level, hintGoal);
    const shown = hintsBought(level, hintGoal);
    widget.setMarks(solution.slice(0, shown));
    buyButton.disabled = left === 0 || coins() < HINT_COST;
  };

  // Buy one more hint for a goal, and show that goal's hints
  const getHint = (goal: HintGoal) => {
    hintGoal = goal;
    buyHint(level, goal);
    showHints();
  };

  for (const button of goalButtons) {
    button.addEventListener("click", () => {
      const goal = button.dataset.goal as HintGoal;
      hintGoal = hintGoal === goal ? null : goal; // tap again to hide
      showHints();
    });
  }
  buyButton.addEventListener("click", () => {
    if (hintGoal) getHint(hintGoal);
    else chooseHint(); // no goal picked yet: ask which hint
  });
  // A free hint: a short video pays its coins (at least HINT_COST), then the hint is bought as usual
  adButton.addEventListener("click", () => {
    adButton.disabled = true;
    adButton.classList.add("busy");
    void watchAd(true).then((result) => {
      adButton.classList.remove("busy");
      adButton.disabled = false;
      if (result.outcome === "unavailable") alert(result.message);
      if (result.outcome === "rewarded") {
        notice(`+${result.coins} coins!`);
        if (coins() >= HINT_COST) {
          if (hintGoal) getHint(hintGoal);
          else chooseHint();
        }
      }
      showHints();
    });
  });

  // A popup to pick which hint to buy, when no goal is picked yet
  const chooseHint = () => {
    const option = (goal: HintGoal) => {
      const total = solutionFor(level, goal).length;
      const shown = hintsBought(level, goal);
      // (a star already earned: nothing left to help with)
      const note = starEarned(goal) ? "★ Star earned" : shown >= total ? "all hints shown" : `${shown} of ${total} hints shown`;
      return `<button type="button" class="hint-option" data-goal="${goal}" ${hintsLeft(goal) === 0 ? "disabled" : ""}>
        <strong>${goalNames[goal]}</strong>
        <span>${note}</span></button>`;
    };
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog hint-dialog";
    dialog.innerHTML = `<div class="dialog-box">
      <header class="dialog-head">
        <h2>Which hint?</h2>
        <button type="button" class="close" aria-label="Close">×</button>
      </header>
      <p class="hint-dialog-text">A hint shows one move of a solution, for ${coin()} ${HINT_COST}.</p>
      <div class="hint-options">${option("moves")}${option("flips")}</div>
    </div>`;
    document.body.append(dialog);
    const close = () => dialog.close();
    dialog.querySelector(".close")!.addEventListener("click", close);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close(); // a tap next to the box
    });
    for (const button of dialog.querySelectorAll<HTMLButtonElement>(".hint-option")) {
      button.addEventListener("click", () => {
        close();
        getHint(button.dataset.goal as HintGoal);
      });
    }
    window.addEventListener("hashchange", close, { once: true });
    dialog.addEventListener("close", () => {
      window.removeEventListener("hashchange", close);
      dialog.remove();
    });
    dialog.showModal();
  };

  // --- replay: a popup with the recorded solves ------------------------------------------------
  const showReplayButton = () => {
    replayButton.hidden = !hasRecordedSolves(level);
  };
  replayButton.addEventListener("click", () => openReplays(level));
  element.querySelector(".open-codex")!.addEventListener("click", openCodex);

  // --- the moves on the board ----------------------------------------------------------------
  let lastMoves = ""; // the widget also reports when nothing changed (e.g. new hint marks)
  const update = ({ moves, solved, celebrateIn }: FlipTilesChange) => {
    const key = moves.map((m) => `${m.kind}${m.tile}`).join(",");
    if (key === lastMoves && lastMoves !== "") return;
    lastMoves = key;

    const forces = moves.filter((m) => m.kind === "force").length;
    const flips = moves.length - forces;
    forceSlots.forEach((slot, i) => slot.classList.toggle("filled", i < level.maxForces - forces));
    forceRow.setAttribute("aria-label", `Available forces: ${level.maxForces - forces} of ${level.maxForces}`);
    progressMoves.textContent = `(${moves.length}/${level.minMoves})`;
    progressFlips.textContent = `(${flips}/${level.minFlips})`;
    if (finger) finger.hidden = moves.length > 0; // (the finger has done its job once a move is made)

    // Goals this attempt can't reach any more (a goal already earned stays lit)
    const missed = (forces > 0 || flips > level.minFlips ? STAR_FLIPS : 0) |
      (moves.length > level.minMoves ? STAR_MOVES : 0);
    for (const goal of goals) goal.classList.toggle("missed", (missed & Number(goal.dataset.star)) !== 0);

    if (!solved) {
      hideResult();
      element.classList.remove("level-complete");
      return;
    }
    const earned = STAR_SOLVED |
      (forces === 0 && flips === level.minFlips ? STAR_FLIPS : 0) |
      (moves.length === level.minMoves ? STAR_MOVES : 0);
    const tier = findTier(level.tier)!;
    const wasComplete = isTierComplete(tier);
    const fresh = award(level, earned);
    // This solve earned the stage's last star: once its stars have landed, the game goes to the
    // menu by itself (no buttons), where the stage's reward flies into the coin pouch
    const stageDone = !wasComplete && isTierComplete(tier);
    result.classList.toggle("stage-done", stageDone);
    if (guided && level.number === 2) finishTutorial(); // the second step solved: the tutorial is done
    recordSolve(level, moves, earned);
    showReplayButton();
    const best = starsOf(level);
    for (const goal of goals) {
      goal.querySelector(".star")!.classList.toggle("earned", (best & Number(goal.dataset.star)) !== 0);
    }

    // This solve gave the level its last star: the three-star finale
    const perfect = fresh !== 0 && best === ALL_STARS;
    result.classList.toggle("perfect", perfect);
    // (under the board's own Solved!)
    result.querySelector(".result-title")!.textContent = stageDone
      ? "Stage complete!"
      : perfect ? "Three stars!" : `in ${plural(moves.length, "move")}`;
    // The level's stars (its best, also the ones from earlier solves), in an arc: solved on the
    // left, flips only (the hardest) as the big one in the middle, fewest moves on the right. Each
    // drops into its socket, from easy to hard: left, right, then the middle.
    const landing = [STAR_SOLVED, STAR_MOVES, STAR_FLIPS].filter((s) => best & s);
    // The timing (RESULT_TIMING, counted from the moment the result appears): when each star
    // starts to drop, and when the last one has settled
    const T = RESULT_TIMING;
    const dropAt = (i: number) => T.firstStar + T.betweenStars * i;
    const settled = landing.length ? dropAt(landing.length - 1) + T.starDrop : 0;
    result.style.setProperty("--land", `${T.starDrop}s`);
    result.style.setProperty("--touchdown", `${(TOUCHDOWN * T.starDrop).toFixed(3)}s`);
    result.style.setProperty("--finale", `${(settled + T.finalePause).toFixed(3)}s`);
    result.querySelector(".result-stars")!.innerHTML = [STAR_SOLVED, STAR_FLIPS, STAR_MOVES].map((s) => {
      const kind = best & s ? "earned" : "empty";
      const delay = kind === "earned" ? ` style="--delay: ${dropAt(landing.indexOf(s)).toFixed(3)}s"` : "";
      const sparks = kind === "earned"
        ? Array.from({ length: 8 }, (_, i) => `<span class="spark" style="--angle: ${i * 45 + 22.5}deg"></span>`).join("")
        : "";
      return `<span class="result-star ${kind}"${delay}>${bigStarSocket()}` +
        `${kind === "empty" ? "" : bigStarGold(bonusLevel)}${sparks}</span>`;
    }).join("");
    result.querySelector(".result-stars")!.setAttribute("aria-label", `${countStars(best)} of 3 stars`);
    // (after this solve's stars: they may just have opened the next group)
    // (the tutorial's last step leads home: the player sees where the game goes from here)
    // (the stage's last level leads to the menu, where the stages are)
    result.querySelector(".next-level")!.textContent =
      endsTutorial ? "Continue" : next === undefined ? "Menu" : nextIsOpen() ? "Next level" : "All levels";
    // (not called "solved": the widget's CSS already uses .solved for its Solved! banner)
    element.classList.add("level-complete");
    // The decorations come together with the board's Solved!
    hideResult();
    sound.solved(0.35); // (the jingle, as the board lights up)
    resultTimer = window.setTimeout(() => {
      result.hidden = false; // (its animations start now)
      // A ding as each star touches its socket (as its ring goes out), and a fanfare for the finale
      landing.forEach((_, i) => sound.star(i, dropAt(i) + TOUCHDOWN * T.starDrop));
      if (perfect || stageDone) sound.fanfare(settled + T.finalePause);
      // (a move taken back before then clears this timer too: see hideResult)
      // (only while the level is still on screen: the player may have gone back already)
      if (stageDone) {
        resultTimer = window.setTimeout(() => element.isConnected && go("#/", true), (settled + T.menuAfter) * 1000);
      }
    }, celebrateIn);
  };
  widget.addEventListener("flip-tiles-change", (e) => update((e as CustomEvent<FlipTilesChange>).detail));

  result.querySelector(".again")!.addEventListener("click", () => {
    const retry = () => {
      hideResult();
      widget.resetGame();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    // (a level whose flips-only solution is very hard: asks first, see flipsWarning.ts)
    if (warnsAboutFlips(level)) confirmFlips(retry);
    else retry();
  });
  element.querySelector(".next-level")!.addEventListener("click", () => {
    // The tutorial's last step and a stage's last level: home, the menu. Otherwise, instead of
    // this level in the history (back from the next level goes to the tier): the next level;
    // when its group isn't open yet, the tier, where it says what opens it.
    if (endsTutorial || next === undefined) return go("#/", true);
    go(nextIsOpen() ? `#/level/${next!.tier}/${next!.number}` : tierHash, true);
  });

  showHints();
  showReplayButton();
  return element;
}
