// A level: its three goals, the board, hints, a replay of the best solve, and when it is solved,
// the level's stars.
//
// The board is the flip tiles widget (src/game). After every move it sends a "flip-tiles-change"
// event with the moves on the board; making a move twice cancels it, so these are the moves that
// count. From them this screen shows the count, dims the goals this attempt can no longer reach,
// and when the board is solved, works out the stars:
//   1. solved
//   2. only flips, and exactly minFlips of them (fewer is impossible)
//   3. exactly minMoves moves (fewer is impossible)
//
// Hints: the goals "Only flips" and "In N moves" are buttons. Tapping one shows the hints bought
// for it on the board (a plus = flip that tile, a dot = force it); each hint costs a coin and
// shows one more move of a solution for that goal. The order of moves doesn't matter, so the
// marks stay right whatever moves have been made already.
//
// Replay: every solve is recorded (see progress.ts); Replay opens a popup to step through them
// (replayDialog.ts).
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import { findTier, levelName, nextLevel, type Level } from "../levels/levels";
import { go } from "../nav";
import {
  ALL_STARS, HINT_COST, STAR_FLIPS, STAR_MOVES, STAR_SOLVED, award, buyHint, coins, countStars,
  hasRecordedSolves, hintsBought, isLevelOpen, recordSolve, solutionFor, starsOf, type HintGoal,
} from "../progress";
import { openReplays } from "./replayDialog";
import { bigStarGold, bigStarSocket, coin, plural, screen, star, topbar } from "./ui";

// The result (stars and buttons over the board) comes this long after the solving move: once the
// board's own solved animation (tiles turning, the wave of light, Solved!) has played
const RESULT_DELAY_MS = 2600;

export function levelScreen(level: Level) {
  const next = nextLevel(level);
  const tierHash = `#/tier/${level.difficulty}`;
  const nextIsOpen = () => next !== undefined && isLevelOpen(findTier(level.difficulty)!, next);
  const earnedBefore = (bit: number) => (starsOf(level) & bit) !== 0;
  const goalNames: Record<HintGoal, string> = { flips: "Only flips", moves: `In ${level.minMoves} moves` };

  const element = screen("level-screen", `
    ${topbar(levelName(level), tierHash, `${coin()} <span class="coin-count">${coins()}</span>`)}
    <ol class="goals">
      <li class="goal" data-star="${STAR_SOLVED}">${star(earnedBefore(STAR_SOLVED))}<span>Solve it</span></li>
      <li><button type="button" class="goal" data-star="${STAR_FLIPS}" data-goal="flips" aria-pressed="false">
        ${star(earnedBefore(STAR_FLIPS))}<span>Only flips, in ${level.minFlips}</span><small>hints</small></button></li>
      <li><button type="button" class="goal" data-star="${STAR_MOVES}" data-goal="moves" aria-pressed="false">
        ${star(earnedBefore(STAR_MOVES))}<span>In ${level.minMoves} moves</span><small>hints</small></button></li>
    </ol>
    <p class="counter" aria-live="polite"></p>
    <div class="board-slot"></div>
    <div class="hint-bar">
      <p class="hint-info" aria-live="polite"></p>
      <div class="hint-actions">
        <button type="button" class="buy-hint">Hint · ${coin()} ${HINT_COST}</button>
        <button type="button" class="replay" hidden>▶ Replay</button>
      </div>
    </div>
    <div class="result" hidden aria-live="polite">
      <div class="result-stars" role="img"></div>
      <p class="result-title"></p>
      <div class="result-bottom">
        <div class="result-buttons">
          <button type="button" class="again">Retry</button>
          <button type="button" class="next-level">Next level</button>
        </div>
      </div>
    </div>`);

  const widget = createFlipTiles({
    solver: false,
    newGame: false,
    start: level.board,
    maxMoves: 50, // every tile flipped and forced once: no real limit
  }) as HTMLElement & FlipTilesControls;
  element.querySelector(".board-slot")!.append(widget);

  const counter = element.querySelector<HTMLElement>(".counter")!;
  // The result: a layer of decorations over the solved board, so it goes inside the board
  const result = element.querySelector<HTMLElement>(".result")!;
  widget.querySelector(".board")!.append(result);
  let resultTimer: number | undefined;
  const hideResult = () => {
    clearTimeout(resultTimer);
    result.hidden = true;
  };
  const goals = [...element.querySelectorAll<HTMLElement>(".goal")];
  const goalButtons = [...element.querySelectorAll<HTMLButtonElement>("button.goal")];
  const hintInfo = element.querySelector<HTMLElement>(".hint-info")!;
  const buyButton = element.querySelector<HTMLButtonElement>(".buy-hint")!;
  const replayButton = element.querySelector<HTMLButtonElement>(".replay")!;
  const coinCount = element.querySelector<HTMLElement>(".coin-count")!;

  // --- hints ---------------------------------------------------------------------------------
  let hintGoal: HintGoal | null = null; // the goal whose hints are shown

  const hintsLeft = (goal: HintGoal) => solutionFor(level, goal).length - hintsBought(level, goal);

  const showHints = () => {
    goalButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.goal === hintGoal)));
    coinCount.textContent = String(coins());
    if (!hintGoal) {
      widget.setMarks([]);
      hintInfo.textContent = "Stuck? Get a hint, or tap a goal above to see its hints.";
      // Always ready to sell a hint (it asks which one), unless there are none left to sell
      buyButton.disabled = coins() < HINT_COST || (hintsLeft("flips") === 0 && hintsLeft("moves") === 0);
      return;
    }
    const solution = solutionFor(level, hintGoal);
    const shown = hintsBought(level, hintGoal);
    widget.setMarks(solution.slice(0, shown));
    hintInfo.innerHTML = `${goalNames[hintGoal]}: ${shown} of ${plural(solution.length, "hint")} shown` +
      (shown ? ` <span class="legend"><span class="legend-plus"></span>flip <span class="legend-dot"></span>force</span>` : "");
    buyButton.disabled = shown >= solution.length || coins() < HINT_COST;
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

  // A popup to pick which hint to buy, when no goal is picked yet
  const chooseHint = () => {
    const option = (goal: HintGoal) => {
      const total = solutionFor(level, goal).length;
      const shown = hintsBought(level, goal);
      return `<button type="button" class="hint-option" data-goal="${goal}" ${shown >= total ? "disabled" : ""}>
        <strong>${goal === "flips" ? `Only flips, in ${level.minFlips}` : `In ${level.minMoves} moves`}</strong>
        <span>${shown >= total ? "all hints shown" : `${shown} of ${total} hints shown`}</span></button>`;
    };
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog hint-dialog";
    dialog.innerHTML = `<div class="dialog-box">
      <header class="dialog-head">
        <h2>Which hint?</h2>
        <button type="button" class="close" aria-label="Close">×</button>
      </header>
      <p class="hint-dialog-text">A hint shows one move of a solution, for ${coin()} ${HINT_COST}.</p>
      <div class="hint-options">${option("flips")}${option("moves")}</div>
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

  // --- the moves on the board ----------------------------------------------------------------
  let lastMoves = ""; // the widget also reports when nothing changed (e.g. new hint marks)
  const update = ({ moves, solved }: FlipTilesChange) => {
    const key = moves.map((m) => `${m.kind}${m.tile}`).join(",");
    if (key === lastMoves && lastMoves !== "") return;
    lastMoves = key;

    const forces = moves.filter((m) => m.kind === "force").length;
    const flips = moves.length - forces;
    counter.textContent = `${plural(moves.length, "move")}: ${plural(flips, "flip")}, ${plural(forces, "force")}`;

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
    const fresh = award(level, earned);
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
    result.querySelector(".result-title")!.textContent = perfect
      ? "Three stars!"
      : `in ${plural(moves.length, "move")}`;
    // The level's stars (its best, also the ones from earlier solves), in an arc: each drops
    // into its socket, one after the other
    let order = 0;
    result.querySelector(".result-stars")!.innerHTML = [STAR_SOLVED, STAR_FLIPS, STAR_MOVES].map((s) => {
      const kind = best & s ? "earned" : "empty";
      // (counted from the moment the result appears)
      const delay = kind === "earned" ? ` style="--delay: ${(0.4 + 0.45 * order++).toFixed(2)}s"` : "";
      const sparks = kind === "earned"
        ? Array.from({ length: 8 }, (_, i) => `<span class="spark" style="--angle: ${i * 45 + 22.5}deg"></span>`).join("")
        : "";
      return `<span class="result-star ${kind}"${delay}>${bigStarSocket()}` +
        `${kind === "empty" ? "" : bigStarGold()}${sparks}</span>`;
    }).join("");
    result.querySelector(".result-stars")!.setAttribute("aria-label", `${countStars(best)} of 3 stars`);
    // (after this solve's stars: they may just have opened the next group)
    result.querySelector(".next-level")!.textContent = nextIsOpen() ? "Next level" : "All levels";
    // (not called "solved": the widget's CSS already uses .solved for its Solved! banner)
    element.classList.add("level-complete");
    // The decorations come once the board's own solved animation has played
    hideResult();
    resultTimer = window.setTimeout(() => {
      result.hidden = false; // (its animations start now)
    }, RESULT_DELAY_MS);
  };
  widget.addEventListener("flip-tiles-change", (e) => update((e as CustomEvent<FlipTilesChange>).detail));

  result.querySelector(".again")!.addEventListener("click", () => {
    hideResult();
    widget.resetGame();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  element.querySelector(".next-level")!.addEventListener("click", () => {
    // Instead of this level in the history: back from the next level goes to the tier. When the
    // next level's group isn't open yet, to the tier, where it says what opens it.
    go(nextIsOpen() ? `#/level/${next!.difficulty}/${next!.number}` : tierHash, true);
  });

  showHints();
  showReplayButton();
  return element;
}
