// Ranked mode's screens (the rules: src/ranked/rules.ts; the games: src/ranked/ranked.ts):
//   #/ranked              the lobby: pick the mode and the difficulty, see your record, Play
//   #/ranked/play         a game: the clock, the board, the Codex (no hints)
//   #/ranked/leaderboard  the online leaderboards, and joining them
// Leaving a game's screen while it is on counts as a loss: main.ts asks first.
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import { TIERS } from "../levels/levels";
import { go } from "../nav";
import { DIFFICULTIES, RANKED_MODES, boardText, type RankedMode } from "../ranked/puzzles";
import {
  activeGame, elapsed, hasJoined, join, lastChoice, lastGame, leave, loseGame, myStats, playerName, startGame,
  takeCutOff, trySolve,
} from "../ranked/ranked";
import { fetchLeaderboard, forgetMe, sendGames } from "../ranked/online";
import {
  FORCE, MIN_GAMES, RELAXED_AFTER, TIME_LIMIT, average, boardId, formatTime, overallScore, type BoardId,
} from "../ranked/rules";
import { openCodex } from "./codex";
import { plural, screen, topbar } from "./ui";

const MODE_NAMES: Record<RankedMode, string> = { moves: "Fewest moves", flips: "Flips only" };
const unit = (mode: RankedMode) => (mode === "flips" ? "flip" : "move");
// "5 moves", "Gamma · 3 flips" (in flips mode, a difficulty is a stage's: its minFlips)
const label = (mode: RankedMode, d: number) => {
  const stage = mode === "flips" ? TIERS.find((t) => t.difficulty === d)?.stage : undefined;
  return `${stage ? `${stage} · ` : ""}${plural(d, unit(mode))}`;
};

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A stopwatch, for the home screen's card and the lobby
export const STOPWATCH = `<svg class="stopwatch" viewBox="0 0 24 24" aria-hidden="true">` +
  `<circle cx="12" cy="13.5" r="7.5" fill="none" stroke-width="2" /><path d="M12 13.5V9.5M10 3h4M18 7l1.4-1.4" fill="none" stroke-width="2" stroke-linecap="round" /></svg>`;

// --- the lobby -----------------------------------------------------------------------------

let mode: RankedMode | undefined;
let difficulty: number | undefined;

export function rankedLobby(rerender: () => void) {
  mode ??= lastChoice().mode;
  difficulty ??= lastChoice().difficulty;
  if (!DIFFICULTIES[mode].includes(difficulty)) difficulty = DIFFICULTIES[mode][1];
  const stats = myStats()[boardId(mode, difficulty)];
  const cutOff = takeCutOff();
  const toGo = MIN_GAMES - (stats?.games ?? 0);

  const element = screen("ranked-screen", `
    ${topbar("Ranked", "#/")}
    ${cutOff ? `<p class="ranked-notice">${plural(cutOff, "ranked game")} ended when the app closed: counted as ${cutOff === 1 ? "a loss" : "losses"}.</p>` : ""}
    <div class="shop-tabs" role="tablist">
      ${RANKED_MODES.map((m) => `<button type="button" role="tab" class="shop-tab" data-mode="${m}"
        aria-selected="${m === mode}">${MODE_NAMES[m]}</button>`).join("")}
    </div>
    <section class="ranked-card">
      <h2>Difficulty</h2>
      <div class="difficulty-picker" role="radiogroup" aria-label="Difficulty">
        ${DIFFICULTIES[mode].map((d) => `<button type="button" role="radio" data-difficulty="${d}"
          aria-checked="${d === difficulty}">${d}</button>`).join("")}
      </div>
      <p class="ranked-label">${label(mode, difficulty)}: a random puzzle that takes ${mode === "flips" ? "exactly that many flips, with flips only" : "exactly that many moves"}.</p>
    </section>
    <section class="ranked-card">
      <h2>Your record</h2>
      <dl class="ranked-stats">
        <dt>Games</dt><dd>${stats?.games ?? 0}</dd>
        <dt>Solved</dt><dd>${stats?.wins ?? 0}</dd>
        <dt>Average time</dt><dd>${stats ? formatTime(average(stats)) : "–"}</dd>
      </dl>
      <p class="ranked-label">${toGo > 0 ? `${plural(toGo, "more game")} to be ranked here.` : "Ranked on this leaderboard."}
        Overall score: ${overallScore(myStats())}.</p>
    </section>
    <button type="button" class="primary play-ranked">Play · ${label(mode, difficulty)}</button>
    <details class="ranked-rules">
      <summary>How ranked works</summary>
      <ul>
        <li>The clock starts when the puzzle appears, and doesn't stop: not in the Codex, not when you switch apps.</li>
        <li>For the first ${formatTime(RELAXED_AFTER, false)}, only a solve in exactly ${plural(difficulty, unit(mode))} counts. After that, more flips are allowed too.</li>
        <li>Not solved in ${formatTime(TIME_LIMIT, false)}: a loss, counted as ${formatTime(TIME_LIMIT, false)}.</li>
        <li>Giving up, leaving the game or closing the app also counts as a loss.</li>
        <li>No hints. Your rank is your average time, after ${MIN_GAMES} games.</li>
      </ul>
    </details>
    <a class="leaderboards-link" href="#/ranked/leaderboard">Leaderboards</a>`);

  for (const tab of element.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    tab.addEventListener("click", () => {
      mode = tab.dataset.mode as RankedMode;
      rerender();
    });
  }
  for (const button of element.querySelectorAll<HTMLButtonElement>("[data-difficulty]")) {
    button.addEventListener("click", () => {
      difficulty = Number(button.dataset.difficulty);
      rerender();
    });
  }
  element.querySelector(".play-ranked")!.addEventListener("click", (e) => {
    (e.currentTarget as HTMLButtonElement).disabled = true;
    startGame(mode!, difficulty!);
    go("#/ranked/play");
  });
  return element;
}

// --- a game --------------------------------------------------------------------------------

export function rankedPlay(rerender: () => void) {
  const game = activeGame();
  if (!game) {
    queueMicrotask(() => go("#/ranked", true));
    return screen("ranked-play", "");
  }
  const forced = game.mode === "moves" && game.maxForces > 0;
  const element = screen("ranked-play", `
    ${topbar(`Ranked · ${label(game.mode, game.difficulty)}`, "#/ranked")}
    <div class="ranked-clock" role="timer">0:00.0</div>
    <p class="ranked-phase">Exactly ${plural(game.difficulty, unit(game.mode))}${game.mode === "flips" ? ", flips only" : ""}</p>
    <p class="ranked-progress">${game.mode === "flips" ? "Flips" : "Moves"} <span class="count">(0/${game.difficulty})</span></p>
    <p class="available-forces" role="img">Available forces:
      ${forced ? `<span class="force-slots">${Array.from({ length: game.maxForces }, () => `<i class="force-slot filled"></i>`).join("")}</span>` : "none"}</p>
    <div class="board-slot"></div>
    <div class="hint-bar">
      <button type="button" class="open-codex">Codex</button>
      <button type="button" class="give-up">Give up</button>
    </div>
    <div class="result ranked-result" hidden aria-live="polite">
      <p class="result-title"></p>
      <p class="result-detail"></p>
      <div class="result-buttons">
        <button type="button" class="ranked-done">Done</button>
        <button type="button" class="primary ranked-again">Play again</button>
      </div>
    </div>`);

  const widget = createFlipTiles({
    solver: false, newGame: false, start: boardText(game.board), maxMoves: 50,
    allowForce: forced, maxForces: game.maxForces,
  }) as HTMLElement & FlipTilesControls;
  element.querySelector(".board-slot")!.append(widget);
  const result = element.querySelector<HTMLElement>(".result")!;
  widget.querySelector(".board")!.append(result);

  const clock = element.querySelector<HTMLElement>(".ranked-clock")!;
  const phase = element.querySelector<HTMLElement>(".ranked-phase")!;
  const count = element.querySelector<HTMLElement>(".ranked-progress .count")!;
  const forceRow = element.querySelector<HTMLElement>(".available-forces")!;
  const forceSlots = [...forceRow.querySelectorAll<HTMLElement>(".force-slot")];
  widget.addEventListener("flip-tiles-no-forces-left", () => {
    forceRow.classList.remove("denied");
    void forceRow.offsetWidth;
    forceRow.classList.add("denied");
  });

  let solvedWith: number[] | null = null; // the moves on the board, when they solve it
  let over = false;

  const finish = (won: boolean) => {
    over = true;
    clearInterval(timer);
    element.classList.add("ranked-over");
    element.classList.remove("too-many");
    const done = lastGame()!;
    const stats = myStats()[boardId(done.mode, done.difficulty)]!;
    result.querySelector(".result-title")!.textContent = won ? formatTime(done.time) : "Time's up";
    result.querySelector(".result-detail")!.textContent =
      `${won ? `Solved in ${plural(done.moves.length, unit(game.mode))}. ` : "Counted as 5:00. "}` +
      `Average: ${formatTime(average(stats))} over ${plural(stats.games, "game")}.`;
    clock.textContent = formatTime(done.time);
    // Won: after the board's own Solved! animation; lost: at once
    window.setTimeout(() => (result.hidden = false), won ? 1800 : 0);
    void sendGames();
  };

  const tick = () => {
    if (over) return;
    if (!element.isConnected) return clearInterval(timer);
    const t = elapsed();
    clock.textContent = formatTime(t);
    if (t >= RELAXED_AFTER) {
      element.classList.add("relaxed");
      phase.textContent = `More flips allowed now · ${formatTime(TIME_LIMIT - t, false)} left`;
      if (solvedWith && trySolve(solvedWith)) return finish(true); // (a longer solve on the board counts now)
    }
    if (t >= TIME_LIMIT) {
      loseGame("time");
      finish(false);
    }
  };
  const timer = window.setInterval(tick, 100);
  // (the first tick once the screen is on the page: tick stops the clock for a screen that left it)
  queueMicrotask(tick);

  widget.addEventListener("flip-tiles-change", (e) => {
    if (over) return;
    const { moves, solved } = (e as CustomEvent<FlipTilesChange>).detail;
    const forces = moves.filter((m) => m.kind === "force").length;
    count.textContent = `(${moves.length}/${game.difficulty})`;
    count.classList.toggle("over", moves.length > game.difficulty);
    forceSlots.forEach((slot, i) => slot.classList.toggle("filled", i < game.maxForces - forces));
    const encoded = moves.map((m) => m.tile + (m.kind === "force" ? FORCE : 0));
    solvedWith = solved ? encoded : null;
    if (solved && trySolve(encoded)) return finish(true);
    // Solved, but with more moves than allowed yet: not a win; take moves back (or wait)
    element.classList.toggle("too-many", solved);
    if (solved) {
      phase.textContent = `Solved in ${plural(moves.length, unit(game.mode))}: it must be ${game.difficulty} before ${formatTime(RELAXED_AFTER, false)}. Undo some.`;
    } else if (elapsed() < RELAXED_AFTER) {
      phase.textContent = `Exactly ${plural(game.difficulty, unit(game.mode))}${game.mode === "flips" ? ", flips only" : ""}`;
    }
  });

  element.querySelector(".open-codex")!.addEventListener("click", openCodex);
  element.querySelector(".give-up")!.addEventListener("click", () => {
    if (over || !confirm("Give up? It counts as a loss (5:00).")) return;
    loseGame("gave up");
    finish(false);
  });
  result.querySelector(".ranked-done")!.addEventListener("click", () => go("#/ranked", true));
  result.querySelector(".ranked-again")!.addEventListener("click", () => {
    startGame(game.mode, game.difficulty);
    rerender();
  });
  return element;
}

// --- the leaderboards ----------------------------------------------------------------------

let shownBoard: BoardId = "overall";

export function rankedLeaderboard(rerender: () => void) {
  const options = [
    `<option value="overall">Overall (best in the world)</option>`,
    ...RANKED_MODES.map((m) => `<optgroup label="${MODE_NAMES[m]}">${DIFFICULTIES[m]
      .map((d) => `<option value="${boardId(m, d)}">${label(m, d)}</option>`).join("")}</optgroup>`),
  ].join("");
  const element = screen("ranked-screen leaderboard-screen", `
    ${topbar("Leaderboards", "#/ranked")}
    <section class="ranked-card join-card">
      ${hasJoined()
        ? `<p>You are on the leaderboards as <strong>${escape(playerName())}</strong>.</p>
           <button type="button" class="rename">Change name</button>
           <button type="button" class="leave">Leave the leaderboards</button>`
        : `<h2>Join the online leaderboards</h2>
           <p>Pick a name (others may have the same one). Your ranked games, your name and a random
             number for this device are sent to the game's server, nothing else. You can leave any time.</p>
           <form class="join-form"><input name="name" maxlength="20" required placeholder="Your name" autocomplete="nickname" />
             <button type="submit" class="primary">Join</button></form>`}
    </section>
    <label class="board-choice">Leaderboard <select>${options}</select></label>
    <p class="board-note"></p>
    <div class="leaderboard" aria-live="polite"><p class="ranked-label">Loading…</p></div>`);

  const select = element.querySelector("select")!;
  select.value = shownBoard;
  const list = element.querySelector<HTMLElement>(".leaderboard")!;
  const note = element.querySelector<HTMLElement>(".board-note")!;
  const show = async () => {
    const board = shownBoard;
    note.textContent = board === "overall"
      ? `Points from every leaderboard you are ranked on: harder and faster gives more.`
      : `Average time over all games (a loss counts as ${formatTime(TIME_LIMIT, false)}), from ${MIN_GAMES} games on.`;
    list.innerHTML = `<p class="ranked-label">Loading…</p>`;
    try {
      const data = await fetchLeaderboard(board);
      if (shownBoard !== board || !element.isConnected) return;
      const value = (v: number) => (board === "overall" ? String(v) : formatTime(v));
      const row = (e: { rank: number; name: string; value: number; games: number; me: boolean }) =>
        `<li class="${e.me ? "me" : ""}"><span class="rank">${e.rank}</span><span class="name">${escape(e.name)}${e.me ? " (you)" : ""}</span>` +
        `<span class="value">${value(e.value)}</span><span class="games">${plural(e.games, "game")}</span></li>`;
      list.innerHTML = data.entries.length
        ? `<ol class="leaderboard-list">${data.entries.map(row).join("")}</ol>` +
          (data.me && !data.entries.some((e) => e.me) ? `<ol class="leaderboard-list mine">${row(data.me)}</ol>` : "") +
          `<p class="ranked-label">${plural(data.players, "player")} ranked.</p>`
        : `<p class="ranked-label">No one is ranked here yet.</p>`;
    } catch {
      if (element.isConnected) {
        list.innerHTML = `<p class="ranked-label">The leaderboards need a connection. Your games are kept and sent later.</p>`;
      }
    }
  };
  select.addEventListener("change", () => {
    shownBoard = select.value as BoardId;
    void show();
  });

  element.querySelector(".join-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = new FormData(e.target as HTMLFormElement).get("name") as string;
    if (!name.trim()) return;
    join(name);
    rerender();
  });
  element.querySelector(".rename")?.addEventListener("click", () => {
    const name = prompt("Your name on the leaderboards", playerName());
    if (!name?.trim()) return;
    join(name);
    // (the name goes along with the next games sent; send now so it shows at once)
    void sendGames(true).then(rerender);
  });
  element.querySelector(".leave")?.addEventListener("click", async () => {
    if (!confirm("Leave the leaderboards? Your name and games are removed from the server (they stay on this device).")) return;
    try {
      await forgetMe();
    } catch {
      alert("No connection: try again when you are online.");
      return;
    }
    leave();
    rerender();
  });
  void show();
  return element;
}
