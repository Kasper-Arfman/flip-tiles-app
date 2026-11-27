// The final challenge: one 6x6 board, the game's last three stars. Its three goals are three
// levels: Solve it (within 15 moves, at most 3 forces: a gold star, the stages' 700th), flips only
// and fewest moves (blue, the bonus stars' 4999th and 5000th). Each try is against a clock
// counting down from 3:00, like ranked mode.
//
// The board and its solutions are in levels/final.json (found by scripts/final-puzzle.mjs):
// flips only takes 18 flips (half the tiles: the most combinations there are), fewest moves 11
// (flips and forces), each with only one solution; Solve it has 442 ways within its limits (its
// hints show one of them, 14 moves).
//
// It plays like a level, and looks like one: the same tiles turning over with a ripple, the forces
// given (as many as the fewest-moves solution uses), the board lighting up when solved, and the
// star dropping in. (The level widget, src/game, is made for 5x5: this board is drawn here, with
// the widget's own CSS classes, so it looks and moves the same.) Hints cost FINAL_HINT_COST each:
// one move of the solution, marked on its tile. Not saved yet: the stars are shown, not kept.
import data from "../levels/final.json";
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange } from "../game/FlipTilesElement";
import { TIERS } from "../levels/levels";
import { go } from "../nav";
import {
  FINAL_HINT_COST, FINAL_RUN_STARS, awardFinalStar, buyFinalHint, coins, finalHintSeed, finalHintsBought, hasFinalStar,
  isFinalGoalOpen, stageStars, type FinalGoal,
} from "../progress";
import { SHAPES, SKINS, skinVariables } from "../skins";
import { sound } from "../sound";
import { popup } from "./codex";
import { canTopUp, openTopUp } from "./topUp";
import { bigStarGold, coin, screen, stageTitle, star, topbar } from "./ui";

export type { FinalGoal };

// The final challenge's stage: Digamma, the lost letter of the Greek alphabet (ϝ, U+03DD)
export const DIGAMMA = { symbol: "ϝ", name: "Digamma" };
type Move = { tile: number; kind: "flip" | "force" };

const SIZE = data.size;
const TILES = SIZE * SIZE;
const BOARD = data.board.join("");
const TIME = 3 * 60_000; // a try: 3 minutes
const HOLD_MS = 450; // a press this long is a force (as on the levels)
const RIPPLE_MS = 60; // each step further from the pressed tile turns over this much later
const WAVE_STEP = 70; // the light wave over a solved board: one column every WAVE_STEP ms
const ROW_STEP = (2 / 3) * 4 * WAVE_STEP;
const STAMP_SHARE = 0.65; // Solved! when the wave is this far through
const waveDelay = (k: number) => Math.round((k % SIZE) * WAVE_STEP + Math.floor(k / SIZE) * ROW_STEP);

// The goals: how many moves the star takes (at most), the forces given, whether its star is blue
// (a bonus star) or gold (Solve it: a stage star), and the solution its hints show
const moves = (s: { flips: number[]; forces: number[] }): Move[] => [
  ...s.flips.map((tile) => ({ tile, kind: "flip" as const })),
  ...s.forces.map((tile) => ({ tile, kind: "force" as const })),
];
const SOLUTION: Record<FinalGoal, Move[]> = {
  solve: moves(data.solutions.solve),
  flips: moves(data.solutions.flips),
  moves: moves(data.solutions.moves),
};
const GOALS: Record<FinalGoal, { name: string; target: number; forces: number; blue: boolean }> = {
  solve: { name: "Solve it", target: data.solutions.solve.flips.length + data.solutions.solve.forces.length, forces: data.solveForces, blue: false },
  flips: { name: "Flips-only", target: data.minFlips, forces: 0, blue: true },
  moves: { name: "Fewest moves", target: data.minMoves, forces: data.solutions.moves.forces.length, blue: true },
};

const QUESTION = `<span class="final-question" aria-hidden="true">?</span>`;

// Solve it's run: first WARMUPS of Gamma's levels (3 flips: quick), then the board
const WARMUPS = 10;
const WARMUP_TIER = TIERS.find((t) => t.difficulty === 3)!;
// A 5x5 board ("01000 11100 ..."), turned, mirrored and its colors swapped at random: the same
// puzzle, not to be recognized
const scramble = (board: string) => {
  const bits = board.replace(/\s/g, "");
  const turns = Math.floor(Math.random() * 4), mirror = Math.random() < 0.5, swap = Math.random() < 0.5;
  const out = [...Array(25)].map((_, k) => {
    let [r, c] = [Math.floor(k / 5), k % 5];
    for (let i = 0; i < turns; i++) [r, c] = [c, 4 - r];
    if (mirror) c = 4 - c;
    const bit = bits[r * 5 + c];
    return swap ? (bit === "1" ? "0" : "1") : bit;
  });
  return out.join("");
};



// The final challenge's screen: what it is, and its levels, a square each, with its name and star
// above it: Solve it, and once every bonus star is earned also flips only and fewest moves (before
// that they aren't shown). Until its star is earned the square is a question mark (the board is
// kept a secret); then the square becomes the board as played with every hint shown (a picture:
// public/final/solution-<goal>.png, a screenshot of the play board with all its hints bought).
export function finalScreen() {
  const level = (goal: FinalGoal) => {
    if (!isFinalGoalOpen(goal)) return "";
    const won = hasFinalStar(goal);
    const name = `<span class="final-level-name">${GOALS[goal].name} <span class="${GOALS[goal].blue ? "blue-stars" : ""}">${star(won)}</span></span>`;
    // (its name and star above it, on one line)
    return `<li class="final-level-item">
      ${name}
      <a class="final-level${won ? " won" : ""}" href="#/final/${goal}"
        aria-label="${GOALS[goal].name}${won ? ", star earned" : ""}"
        ${won ? `style="background-image: url('final/solution-${goal}.png')"` : ""}>${won ? "" : QUESTION}</a>
    </li>`;
  };
  // (nothing says how big the board is: that is for the first try to show)
  // (the stage of Digamma, ϝ: the lost Greek letter, after the last one of the stages)
  return screen("final-screen", `
    ${topbar(stageTitle(DIGAMMA), "#/")}
    <section class="final-intro">
      <h2>Are you ready?</h2>
      <p>One last board. ${isFinalGoalOpen("flips") ? "Three last stars" : "One last star"}. Limited time.</p>
    </section>
    <ol class="final-levels">${level("solve")}${level("flips")}${level("moves")}</ol>`);
}

// A try: the clock counts down from 3:00 over the board. Solved in time: the star, if in the goal's
// number of moves. At 0:00 the try has failed: the board goes dark, and only Try again (a fresh
// 5:00) or back.
export function finalPlay(goal: FinalGoal, rerender: () => void) {
  const { name, target, forces: maxForces } = GOALS[goal];
  // The solution's moves in this player's own order (finalHintSeed): the hints come in it
  const hintOrder = SOLUTION[goal].slice();
  let seed = finalHintSeed(goal) || 1;
  for (let i = hintOrder.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [hintOrder[i], hintOrder[j]] = [hintOrder[j], hintOrder[i]];
  }
  const tilesHtml = [...BOARD].map((bit, k) => `<button type="button" class="tile${bit === "1" ? " one" : ""}"
      style="--wave-delay: ${waveDelay(k)}ms" data-tile="${k}" aria-label="Tile ${Math.floor(k / SIZE) + 1}, ${(k % SIZE) + 1}">
      <span class="force-mark"></span><span class="flip-mark"></span>
      <span class="made-flip"></span><span class="made-force"></span></button>`).join("");
  // Solve it is a run: WARMUPS quick Gamma puzzles first (see warm-ups below), then the board. A
  // timeline (a circle per warm-up, the boss at the end) and the gold star counter show the way.
  const run = goal === "solve";
  const wonBefore = hasFinalStar("solve");
  const base = stageStars() - (wonBefore ? FINAL_RUN_STARS : 0); // (the stages' stars without the run's)
  const runBar = run ? `<div class="run-bar">
      <ol class="run-line" aria-label="The run: ${WARMUPS} warm-ups, then the board">
        ${Array.from({ length: WARMUPS }, (_, i) => `<li class="run-dot${i === 0 ? " current" : ""}"></li>`).join("")}
        <li class="run-boss" aria-label="The board">${DIGAMMA.symbol}</li>
      </ol>
      <span class="run-stars">${star(true)} <span class="run-count">${base + (wonBefore ? FINAL_RUN_STARS : 0)}</span></span>
    </div>` : "";
  // (level-screen: the levels' own styles for the forces row, the hint bar and the result)
  const element = screen(`final-screen final-play level-screen${run ? " warming" : ""}`, `
    ${topbar(stageTitle(DIGAMMA), "#/final", `<button type="button" class="buy-hint final-hint">Hint · ${coin()} ${FINAL_HINT_COST}</button>`)}
    ${runBar}
    <div class="final-top">
      <div class="final-clock" role="timer">3:00</div>
      <div class="final-goal-star${GOALS[goal].blue ? " blue-stars" : ""}">${star(false)}
        <span class="final-goal-name">${name} <small class="final-progress">(0/${target})</small></span></div>
    </div>
    ${run ? `<div class="run-warmup"><p class="run-label">Warm-up, go fast!</p><div class="run-slot"></div></div>` : ""}
    ${maxForces > 0 ? `<p class="available-forces" role="img">Available forces:
      <span class="force-slots">${Array.from({ length: maxForces }, () => `<i class="force-slot filled"></i>`).join("")}</span></p>`
      : ""}
    <div class="flip-tiles final-tiles" style="--wave-length: ${waveDelay(TILES - 1)}ms">
      <div class="board final-grid" role="grid" aria-label="The board">
        ${tilesHtml}
        <div class="solved" aria-live="polite"><strong></strong></div>
        <div class="result" hidden aria-live="polite">
          <div class="result-stars" role="img"></div>
          <p class="result-title"></p>
        </div>
      </div>
    </div>
    <div class="final-actions">
      <button type="button" class="final-undo">Undo</button>
      <button type="button" class="final-reset">Reset</button>
    </div>
    <div class="final-again" hidden><button type="button" class="final-retry">Try again</button></div>`);

  const flipTiles = element.querySelector<HTMLElement>(".final-tiles")!;
  const tiles = [...element.querySelectorAll<HTMLButtonElement>(".tile")];
  const forceRow = element.querySelector<HTMLElement>(".available-forces"); // (none in Flips-only)
  const forceSlots = [...element.querySelectorAll<HTMLElement>(".force-slot")];
  const result = element.querySelector<HTMLElement>(".result")!;
  const hintButton = element.querySelector<HTMLButtonElement>(".buy-hint")!;

  // --- the run's warm-ups (Solve it): WARMUPS Gamma puzzles, each one a random Gamma level,
  // turned, mirrored and its colors swapped at random, played on the levels' own 5x5 board. Each
  // solved: the next at once, and the counter goes up by 3. After the last: the board. ---------
  let warm = run ? 0 : WARMUPS; // (the warm-up being played; WARMUPS: on to the board)
  let shown = base + (wonBefore ? FINAL_RUN_STARS : 0); // (the counter, as it shows now)
  const count = element.querySelector<HTMLElement>(".run-count");
  // The counter runs up (or down) to `to`, quickly, a number at a time
  const countTo = (to: number) => {
    if (!count || wonBefore) return; // (won before: it stays at the stages' full count)
    const from = shown;
    shown = to;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 500);
      count.textContent = String(Math.round(from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    count.parentElement!.classList.remove("bump");
    void count.offsetWidth;
    count.parentElement!.classList.add("bump");
  };
  // A warm-up's 3 stars on their way, as a completed stage's coins fly into the pouch (home.ts,
  // flyCoins; its styles too): "+3" rises from the board, the stars burst out of its middle, hang
  // a moment, then fly into the counter one after the other, each adding 1 as it lands
  const flyStars = (from: HTMLElement, reward: number) => {
    const add = (n: number) => {
      if (!count || wonBefore || ended) return;
      shown += n;
      count.textContent = String(shown);
      count.parentElement!.classList.remove("bump");
      void count.offsetWidth;
      count.parentElement!.classList.add("bump");
    };
    if (!count || matchMedia("(prefers-reduced-motion: reduce)").matches) return add(reward);
    const box = from.getBoundingClientRect();
    const icon = (count.parentElement!.querySelector(".star") ?? count).getBoundingClientRect();
    const start = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const end = { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 };
    const plus = document.createElement("div");
    plus.className = "reward-plus";
    plus.innerHTML = `+${reward} ${star(true)}`;
    plus.style.left = `${start.x}px`;
    plus.style.top = `${start.y - 30}px`;
    document.body.append(plus);
    plus.addEventListener("animationend", () => plus.remove());
    for (let i = 0; i < reward; i++) {
      const flyer = document.createElement("div");
      flyer.className = "flying-coin flying-star";
      flyer.innerHTML = star(true);
      flyer.style.left = `${start.x}px`;
      flyer.style.top = `${start.y}px`;
      document.body.append(flyer);
      // Out in a direction of its own, 50 to 80 px, then to the counter
      const angle = (i / reward) * 2 * Math.PI + Math.random() * 0.6;
      const reach = 50 + Math.random() * 30;
      const out = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * 0.8 };
      const to = { x: end.x - start.x, y: end.y - start.y };
      const spin = Math.random() < 0.5 ? -1 : 1;
      const flight = flyer.animate([
        { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0, easing: "cubic-bezier(0.15, 0.8, 0.3, 1)" },
        { transform: `translate(calc(${out.x}px - 50%), calc(${out.y}px - 50%)) scale(1.2) rotate(${spin * 90}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(${out.x}px - 50%), calc(${out.y + 6}px - 50%)) scale(1.1) rotate(${spin * 110}deg)`,
          opacity: 1, offset: 0.5, easing: "cubic-bezier(0.55, 0, 0.85, 0.4)" },
        { transform: `translate(calc(${to.x}px - 50%), calc(${to.y}px - 50%)) scale(0.6) rotate(${spin * 360}deg)`, opacity: 1 },
      ], { duration: 1000, delay: i * 90, fill: "both" });
      flight.onfinish = () => {
        flyer.remove();
        add(1);
        sound.coin();
      };
    }
  };
  const showLine = () => element.querySelectorAll<HTMLElement>(".run-line li").forEach((li, i) => {
    li.classList.toggle("done", i < warm);
    li.classList.toggle("current", i === warm);
  });
  const gammas = WARMUP_TIER.levels.slice().sort(() => Math.random() - 0.5).slice(0, WARMUPS);
  const nextWarmup = () => {
    if (ended) return;
    showLine();
    const slot = element.querySelector<HTMLElement>(".run-slot");
    if (warm >= WARMUPS) {
      // The boss: the board
      element.classList.remove("warming");
      slot?.replaceChildren();
      showHintButton();
      return;
    }
    const widget = createFlipTiles({
      solver: false, newGame: false, start: scramble(gammas[warm].board), maxMoves: 50, allowForce: true,
    });
    // (each in a skin and a tile shape picked at random, on this board only: one more thing that
    // changes, so the warm-ups never settle into a rhythm)
    const look = {
      skin: SKINS[Math.floor(Math.random() * SKINS.length)].id,
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)].id,
    };
    for (const [name, value] of Object.entries(skinVariables(look))) widget.style.setProperty(name, value);
    let done = false;
    widget.addEventListener("flip-tiles-change", (e) => {
      if (done || ended || !(e as CustomEvent<FlipTilesChange>).detail.solved) return;
      done = true;
      warm++;
      if (!wonBefore) flyStars(widget, 3); // (its 3 stars fly into the counter)
      sound.climb(warm - 1); // (a note higher with each warm-up)
      window.setTimeout(nextWarmup, 350); // (a moment to see it solved)
    });
    slot!.replaceChildren(widget);
  };

  // The board: tile k is 1 (yellow) or 0 (green); a flip changes a tile and the 4 around it
  const start = [...BOARD].map(Number);
  let moves: Move[] = [];
  let state = start.slice();
  let ended = false;
  const changed = (move: Move) => {
    const [r, c] = [Math.floor(move.tile / SIZE), move.tile % SIZE];
    const around = move.kind === "force" ? [[0, 0]] : [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    return around.map(([dr, dc]) => [r + dr, c + dc]).filter(([y, x]) => y >= 0 && y < SIZE && x >= 0 && x < SIZE)
      .map(([y, x]) => y * SIZE + x);
  };
  const solvedState = (s: number[]) => s.every((v) => v === s[0]);
  const forcesUsed = () => moves.filter((m) => m.kind === "force").length;

  // Draw the board: the tiles that changed turn over, the further from `origin`, the later (a
  // ripple, as on the levels); the moves made marked on their tiles; the hints bought marked too
  const draw = (origin: number, before: number[]) => {
    const [or, oc] = [Math.floor(origin / SIZE), origin % SIZE];
    const hints = hintOrder.slice(0, finalHintsBought(goal));
    tiles.forEach((tile, k) => {
      if (state[k] !== before[k]) {
        const distance = Math.abs(Math.floor(k / SIZE) - or) + Math.abs((k % SIZE) - oc);
        tile.style.setProperty("--flip-delay", `${distance * RIPPLE_MS}ms`);
        tile.classList.remove("flipping");
        void tile.offsetWidth; // (restart the animation)
        tile.classList.add("flipping");
      }
      tile.classList.toggle("one", state[k] === 1);
      tile.classList.toggle("flipped", moves.some((m) => m.tile === k && m.kind === "flip"));
      tile.classList.toggle("forced", moves.some((m) => m.tile === k && m.kind === "force"));
      tile.classList.toggle("flip", hints.some((m) => m.tile === k && m.kind === "flip"));
      tile.classList.toggle("force", hints.some((m) => m.tile === k && m.kind === "force"));
    });
    // The goal's progress under its star; past the goal's moves, the star fades (missed this try)
    const counted = goal === "flips" ? moves.length - forcesUsed() : moves.length;
    element.querySelector(".final-progress")!.textContent = `(${counted}/${target})`;
    element.querySelector(".final-goal-star")!.classList.toggle("missed", counted > target);
    forceSlots.forEach((slot, i) => slot.classList.toggle("filled", i < maxForces - forcesUsed()));
    forceRow?.setAttribute("aria-label", `Available forces: ${maxForces - forcesUsed()} of ${maxForces}`);
    // (only a solve within the goal's moves counts, as in ranked: another just stays on the board,
    // and the clock runs on)
    if (moves.length && solvedState(state) && counted <= target && (goal !== "flips" || forcesUsed() === 0)) solved();
  };
  // A move: made, or (the same move again) taken back
  const play = (move: Move) => {
    if (ended) return;
    const again = moves.some((m) => m.tile === move.tile && m.kind === move.kind);
    if (move.kind === "force" && !again && forcesUsed() >= maxForces) {
      // (no forces left: the row shakes, as on the levels)
      forceRow?.classList.remove("denied");
      void forceRow?.offsetWidth;
      forceRow?.classList.add("denied");
      return;
    }
    const before = state.slice();
    moves = again ? moves.filter((m) => !(m.tile === move.tile && m.kind === move.kind)) : [...moves, move];
    for (const k of changed(move)) state[k] ^= 1;
    sound[move.kind === "force" ? "force" : "flip"]();
    draw(move.tile, before);
  };

  // A tap flips, a tap and hold forces (with a mouse: click, right click); not forces in Flips only
  for (const tile of tiles) {
    const k = Number(tile.dataset.tile);
    let timer: number | undefined;
    let held = false;
    const cancel = () => {
      window.clearTimeout(timer);
      timer = undefined;
      tile.classList.remove("holding");
    };
    tile.addEventListener("pointerdown", (e) => {
      held = false;
      if (e.pointerType === "mouse" || maxForces === 0 || ended) return;
      tile.classList.add("holding");
      timer = window.setTimeout(() => {
        cancel();
        held = true;
        play({ tile: k, kind: "force" });
        navigator.vibrate?.(30);
      }, HOLD_MS);
    });
    tile.addEventListener("pointerleave", cancel);
    tile.addEventListener("pointercancel", cancel);
    tile.addEventListener("click", () => {
      cancel();
      if (!held) play({ tile: k, kind: "flip" });
      held = false;
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (maxForces > 0 && !held && timer === undefined) play({ tile: k, kind: "force" });
    });
  }
  const restart = (newMoves: Move[]) => {
    if (ended) return;
    const before = state.slice();
    moves = newMoves;
    state = start.slice();
    for (const m of moves) for (const k of changed(m)) state[k] ^= 1;
    draw(moves.at(-1)?.tile ?? Math.floor(TILES / 2), before);
  };
  element.querySelector(".final-undo")!.addEventListener("click", () => restart(moves.slice(0, -1)));
  element.querySelector(".final-reset")!.addEventListener("click", () => restart([]));

  // Hints: FINAL_HINT_COST each, one move of the solution at a time, marked on its tile. Each asks
  // first: more than a level's hint. (Short of coins: says so, with Top up where there is one.)
  const showHintButton = () => {
    const left = SOLUTION[goal].length - finalHintsBought(goal);
    // (none during the run's warm-ups: hints are for the board)
    hintButton.disabled = left === 0 || ended || element.classList.contains("warming");
    if (left === 0) hintButton.textContent = "No hints left";
  };
  hintButton.addEventListener("click", () => {
    const short = coins() < FINAL_HINT_COST;
    const dialog = popup("final-hint-dialog final-dark", `<h2>${short ? "Not enough coins" : "A costly hint"}</h2>`, `
      <p class="hint-dialog-text">This hint costs ${coin()} ${FINAL_HINT_COST}, more than usual.
        ${short ? "" : "Proceed?"}</p>
      <p class="hint-dialog-text final-balance">You have ${coin()} ${coins()}.</p>
      <div class="dialog-buttons">
        <button type="button" class="cancel">Cancel</button>
        ${short
          ? canTopUp() ? `<button type="button" class="primary top-up">Top up</button>` : ""
          : `<button type="button" class="primary proceed">Proceed</button>`}
      </div>`);
    dialog.querySelector(".cancel")!.addEventListener("click", () => dialog.close());
    dialog.querySelector(".top-up")?.addEventListener("click", () => {
      dialog.close();
      openTopUp(showHintButton);
    });
    dialog.querySelector(".proceed")?.addEventListener("click", () => {
      dialog.close();
      if (!ended && buyFinalHint(goal, SOLUTION[goal].length)) {
        draw(Math.floor(TILES / 2), state);
        showHintButton();
      }
    });
  });

  // Solved: the board lights up (as on the levels), then the star drops in, if in the goal's moves
  const clock = element.querySelector<HTMLElement>(".final-clock")!;
  function solved() {
    ended = true;
    window.clearInterval(timer);
    const perfect = true; // (only a solve within the goal's moves gets here: see draw)
    const slowest = Math.max(0, ...tiles.map((t) => parseFloat(t.style.getPropertyValue("--flip-delay")) || 0));
    const solvedDelay = slowest + 520; // (--flash-time + --flip-time)
    const stampDelay = Math.round(solvedDelay + STAMP_SHARE * waveDelay(TILES - 1));
    flipTiles.style.setProperty("--solved-delay", `${solvedDelay}ms`);
    flipTiles.style.setProperty("--stamp-delay", `${stampDelay}ms`);
    flipTiles.classList.add("is-solved");
    flipTiles.classList.toggle("all-one", state[0] === 1);
    element.querySelector(".solved strong")!.textContent = "Solved!";
    element.classList.add("solved-final");
    sound.solved(0.35);
    // The star (a perfect solve): big and blue above Solved!, turning around its own axis (no
    // drop into a socket, as on a level: this is the one star of its kind)
    // (solid: a few darker copies behind its face, each a little further back, make its thickness,
    // seen as it turns)
    // (Solve it's star: gold, as the stages' stars; the other two: blue)
    const DEPTH = 7;
    const blue = GOALS[goal].blue;
    result.querySelector(".result-stars")!.innerHTML = perfect
      ? `<span class="final-prize${blue ? "" : " gold"}">${Array.from({ length: DEPTH }, (_, i) =>
        `<span class="prize-layer" style="--z: ${i + 1}">${bigStarGold(blue)}</span>`).join("")}` +
        `<span class="prize-face">${bigStarGold(blue)}</span></span>`
      : "";
    result.classList.toggle("gold", !blue);
    element.querySelector(".final-goal-star .star")!.classList.toggle("earned", perfect);
    if (perfect) awardFinalStar(goal); // (kept: shown on the challenge's screen from now on)
    if (run) {
      // (the run won: all its stars, the counter up to the stages' full count)
      warm = WARMUPS + 1;
      showLine();
      countTo(base + FINAL_RUN_STARS);
    }
    result.querySelector(".result-title")!.textContent = perfect
      ? "The star is yours!"
      : `in ${moves.length} moves: the star needs ${goal === "flips" ? `${target} flips` : goal === "solve" ? `at most ${target}` : target}`;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      if (!element.isConnected) return;
      result.hidden = false;
      if (perfect) sound.fanfare(0); // (the three-star fanfare of the levels)
      // (solved: Continue, back to the challenge's screen, where a star earned shows)
      const again = element.querySelector<HTMLElement>(".final-again")!;
      again.querySelector("button")!.textContent = "Continue";
      again.hidden = false;
    }, reduced ? 0 : stampDelay);
    result.classList.toggle("final-won", perfect);
    showHintButton();
  }

  // Out of time: the board goes dark, and the try has failed
  const begin = Date.now();
  const tick = () => {
    if (!element.isConnected && Date.now() - begin > 1000) return window.clearInterval(timer);
    if (ended) return;
    const left = Math.max(0, TIME - (Date.now() - begin));
    const seconds = Math.ceil(left / 1000);
    clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    clock.classList.toggle("late", left <= 30_000); // (the last half minute: red)
    if (left === 0) {
      ended = true;
      window.clearInterval(timer);
      element.classList.add("over");
      countTo(base); // (the run lost: none of its stars, the counter back down)
      // "Time's up" over the board in play (a warm-up's, or the final board), as Solved! is: the
      // tiles go dark under it
      const board = element.querySelector<HTMLElement>(element.classList.contains("warming") ? ".run-slot .board" : ".final-tiles .board");
      board?.insertAdjacentHTML("beforeend", `<div class="time-up" role="alert">
        <strong>Time's up</strong><span>The puzzle wins this time.</span></div>`);
      element.querySelector<HTMLElement>(".final-again")!.hidden = false;
      showHintButton();
    }
  };
  const timer = window.setInterval(tick, 250);
  // Try again (out of time): a fresh try; Continue (solved): back to the challenge's screen
  element.querySelector(".final-retry")!.addEventListener("click", () => {
    if (element.classList.contains("solved-final")) go("#/final", true);
    else rerender();
  });
  draw(Math.floor(TILES / 2), state);
  showHintButton();
  if (run) nextWarmup(); // (the first warm-up)
  return element;
}
