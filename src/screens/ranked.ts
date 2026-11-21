// Ranked mode's screens (the rules: src/ranked/rules.ts; the games: src/ranked/ranked.ts):
//   #/ranked              the lobby: pick the mode and the difficulty, see your record, Play
//   #/ranked/play         a game: the clock, the board, the Codex (no hints)
//   #/ranked/leaderboard  the online leaderboards, and joining them
// Leaving a game's screen while it is on counts as a loss: main.ts asks first.
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import { MASKS } from "../game/flipTiles";
import { go, previousHash } from "../nav";
import { DIFFICULTIES, RANKED_MODES, boardText, type RankedMode } from "../ranked/puzzles";
import {
  activeGame, elapsed, hasJoined, join, lastChoice, lastGame, loseGame, myStats, playerName, startGame,
  takeCutOff, trySolve,
} from "../ranked/ranked";
import { fetchLeaderboard, sendGames } from "../ranked/online";
import {
  FORCE, NAME_MAX, RELAXED_AFTER, SCORE_WEIGHT, TIME_LIMIT, boardId, formatTime, type BoardId,
} from "../ranked/rules";
import { STAR_NAME, isDifficultyOpen, stageFor } from "../ranked/unlock";
import { openCodex } from "./codex";
import { LOCK, plural, screen, topbar } from "./ui";

const MODE_NAMES: Record<RankedMode, string> = { moves: "Fewest moves", flips: "Flips only" };
const unit = (mode: RankedMode) => (mode === "flips" ? "flip" : "move");
// "5 moves", "4 flips" (a difficulty is just its number: no stage names)
const label = (mode: RankedMode, d: number) => plural(d, unit(mode));

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
  // A difficulty opens with its stage (unlock.ts); the choice falls back to the first open one
  const open = DIFFICULTIES[mode].filter((d) => isDifficultyOpen(mode!, d));
  if (!open.includes(difficulty)) difficulty = open[0] ?? DIFFICULTIES[mode][0];
  const anyOpen = open.length > 0;
  const stats = myStats()[boardId(mode, difficulty)];
  const cutOff = takeCutOff();
  // The next difficulty still locked: its stage is what to complete next
  const nextLocked = DIFFICULTIES[mode].find((d) => !isDifficultyOpen(mode!, d));

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
        ${DIFFICULTIES[mode].map((d) => isDifficultyOpen(mode!, d)
          ? `<button type="button" role="radio" data-difficulty="${d}" aria-checked="${d === difficulty}">${d}</button>`
          : `<button type="button" role="radio" class="locked" disabled aria-checked="false"
              aria-label="${d}: earn every ${STAR_NAME[mode!]} star of stage ${stageFor(d)?.stage} to open">${LOCK}</button>`).join("")}
      </div>
      ${nextLocked === undefined ? "" : `<p class="ranked-label">Earn every ${STAR_NAME[mode]} star of stage ${stageFor(nextLocked)?.stage} to unlock the next difficulty.</p>`}
    </section>
    <section class="ranked-card">
      <h2>Your record</h2>
      <dl class="ranked-stats">
        <dt>Games</dt><dd>${stats?.games ?? 0}</dd>
        <dt>Solved</dt><dd>${stats?.wins ?? 0}</dd>
        <dt>Score</dt><dd>${formatTime(stats?.score ?? TIME_LIMIT)}</dd>
        <dt>Position</dt><dd class="ranked-position">${!hasJoined()
          ? `<a href="#/ranked/leaderboard">Join the leaderboards</a>`
          : stats ? "…" : "–"}</dd>
      </dl>
    </section>
    <button type="button" class="primary play-ranked"${anyOpen ? "" : " disabled"}>${anyOpen ? `Play · ${label(mode, difficulty)}` : "Play"}</button>
    <details class="ranked-rules">
      <summary>How ranked works</summary>
      <ul>
        <li>The clock starts when the puzzle appears, and doesn't stop: not in the Codex, not when you switch apps.</li>
        <li>For the first ${formatTime(RELAXED_AFTER)}, only a solve in exactly ${plural(difficulty, unit(mode))} counts. After that, more flips are allowed too.</li>
        <li>Not solved in ${formatTime(TIME_LIMIT)}: a loss, counted as ${formatTime(TIME_LIMIT)}.</li>
        <li>Giving up, leaving the game or closing the app also counts as a loss.</li>
        <li>No hints. Your rank is your score: it starts at ${formatTime(TIME_LIMIT)}, and every game moves it ${Math.round(SCORE_WEIGHT * 100)}% of the way to that game's time. Lower is better.</li>
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
  // Leaderboards: the one of the mode and difficulty chosen here
  element.querySelector(".leaderboards-link")!.addEventListener("click", () => showLeaderboard(boardId(mode!, difficulty!)));
  element.querySelector(".play-ranked")!.addEventListener("click", (e) => {
    (e.currentTarget as HTMLButtonElement).disabled = true;
    startGame(mode!, difficulty!);
    go("#/ranked/play");
  });

  // The position on this leaderboard, from the server (a joined player with enough games here)
  const position = element.querySelector<HTMLElement>(".ranked-position")!;
  if (hasJoined() && stats && anyOpen) {
    const board = boardId(mode, difficulty);
    fetchLeaderboard(board).then(
      (data) => {
        if (!element.isConnected) return;
        position.textContent = data.me ? `#${data.me.rank} of ${data.players}` : "not ranked yet";
      },
      () => {
        if (element.isConnected) position.textContent = "offline";
      },
    );
  }
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
    ${topbar(`Ranked · ${label(game.mode, game.difficulty)}`, "#/ranked", `<button type="button" class="give-up">Give up</button>`)}
    <div class="ranked-clock" role="timer">0:00</div>
    <p class="ranked-phase"></p>
    <p class="ranked-progress">${game.mode === "flips" ? "Flips" : "Moves"} <span class="count">(0/${game.difficulty})</span></p>
    ${game.mode === "flips" ? "" : `<p class="available-forces" role="img">Available forces:
      ${forced ? `<span class="force-slots">${Array.from({ length: game.maxForces }, () => `<i class="force-slot filled"></i>`).join("")}</span>` : "none"}</p>`}
    <div class="board-slot"></div>
    <button type="button" class="open-codex">Codex</button>
    <div class="result ranked-result" hidden aria-live="polite">
      <p class="result-title" hidden>Time's up</p>
      <div class="score-change" aria-label="">
        <span class="score-label">Score</span>
        <span class="score-value"></span>
        <span class="score-delta"></span>
      </div>
      <div class="result-buttons">
        <button type="button" class="ranked-done">Done</button>
        <button type="button" class="primary ranked-again">New game</button>
      </div>
    </div>`);

  const widget = createFlipTiles({
    solver: false, newGame: false, start: boardText(game.board), maxMoves: 50,
    allowForce: forced, maxForces: game.maxForces,
  }) as HTMLElement & FlipTilesControls;
  element.querySelector(".board-slot")!.append(widget);
  // Codex on the board's own row of buttons, after < > and Reset
  widget.querySelector(".moves")!.append(element.querySelector(".open-codex")!);
  const result = element.querySelector<HTMLElement>(".result")!;
  widget.querySelector(".board")!.append(result);

  const clock = element.querySelector<HTMLElement>(".ranked-clock")!;
  const phase = element.querySelector<HTMLElement>(".ranked-phase")!;
  const count = element.querySelector<HTMLElement>(".ranked-progress .count")!;
  // (no forces row in flips mode)
  const forceRow = element.querySelector<HTMLElement>(".available-forces");
  const forceSlots = [...(forceRow?.querySelectorAll<HTMLElement>(".force-slot") ?? [])];
  widget.addEventListener("flip-tiles-no-forces-left", () => {
    if (!forceRow) return;
    forceRow.classList.remove("denied");
    void forceRow.offsetWidth;
    forceRow.classList.add("denied");
  });

  // A solve with too many moves (before 4:00) isn't one: the board takes off its "solved" state
  // at once, before anything is drawn, so it just shows the finished tiles, no Solved! animation,
  // and the tiles still take moves. When it counts after all, the state goes back on, and the
  // animation plays then.
  const setSolvedLook = (on: boolean) => {
    if (!on) {
      widget.classList.remove("is-solved", "all-one");
      return;
    }
    let state = game.board;
    for (const m of solvedWith ?? []) state ^= m & FORCE ? 1 << (m & 31) : MASKS[m & 31];
    widget.classList.add("is-solved");
    widget.classList.toggle("all-one", (state >>> 0) !== 0);
  };

  let solvedWith: number[] | null = null; // the moves on the board, when they solve it
  let over = false;
  // The score on this leaderboard before this game (5:00 before the first)
  const scoreBefore = myStats()[boardId(game.mode, game.difficulty)]?.score ?? TIME_LIMIT;

  // The score's change, once the result shows: the old score counts to the new one, then the
  // difference pops in, green when it went down (better), red when it went up (worse)
  const showScoreChange = () => {
    const after = myStats()[boardId(game.mode, game.difficulty)]!.score;
    const box = result.querySelector<HTMLElement>(".score-change")!;
    const value = box.querySelector<HTMLElement>(".score-value")!;
    const delta = box.querySelector<HTMLElement>(".score-delta")!;
    const change = after - scoreBefore;
    const better = change < -50; // (less than a twentieth of a second: no change)
    const worse = change > 50;
    // The difference in seconds, with tenths ("0.5s", "11.2s"): a loss can change the score by
    // under a second; a minute or more as m:ss
    const amount = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : formatTime(ms));
    box.classList.toggle("better", better);
    box.classList.toggle("worse", worse);
    delta.textContent = better ? `▼ ${amount(-change)}` : worse ? `▲ ${amount(change)}` : "=";
    box.setAttribute("aria-label",
      `Score ${formatTime(after)}, ${better ? `${amount(-change)} better` : worse ? `${amount(change)} worse` : "the same"}`);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    const start = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      value.textContent = formatTime(scoreBefore + (after - scoreBefore) * eased);
      if (t < 1) requestAnimationFrame(step);
      else box.classList.add("settled"); // (the difference pops in)
    };
    value.textContent = formatTime(scoreBefore);
    requestAnimationFrame(step);
  };

  const finish = (won: boolean) => {
    over = true;
    clearInterval(timer);
    element.classList.add("ranked-over");
    element.classList.remove("too-many");
    const done = lastGame()!;
    // (a win: only the buttons; a loss also says so)
    result.querySelector<HTMLElement>(".result-title")!.hidden = won;
    if (won) setSolvedLook(true);
    clock.textContent = formatTime(done.time);
    // Won: after the board's own Solved! animation; lost: at once
    window.setTimeout(() => {
      result.hidden = false;
      showScoreChange();
    }, won ? 1800 : 0);
    void sendGames();
  };

  const tick = () => {
    if (over) return;
    if (!element.isConnected) return clearInterval(timer);
    const t = elapsed();
    clock.textContent = formatTime(t);
    if (t >= RELAXED_AFTER) {
      element.classList.add("relaxed");
      phase.textContent = `More flips allowed now · ${formatTime(TIME_LIMIT - t)} left`;
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
    // Solved, but with more moves than allowed yet: not a win, and nothing happens (the count
    // shows it, e.g. (13/12)); take moves back, or wait for 4:00
    element.classList.toggle("too-many", solved);
    if (solved) setSolvedLook(false);
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

// The leaderboard the leaderboards screen opens on (the lobby: its mode and difficulty; the home
// screen's gold button: Top Ranked Players)
export function showLeaderboard(board: BoardId) {
  shownBoard = board;
}

export function rankedLeaderboard(rerender: () => void) {
  const options = [
    `<option value="overall">Top Ranked Players</option>`,
    ...RANKED_MODES.map((m) => `<optgroup label="${MODE_NAMES[m]}">${DIFFICULTIES[m]
      .map((d) => `<option value="${boardId(m, d)}">${plural(d, unit(m))}</option>`).join("")}</optgroup>`),
  ].join("");
  const element = screen("ranked-screen leaderboard-screen", `
    ${topbar("Leaderboards", previousHash() === "#/" ? "#/" : "#/ranked")}
    <section class="ranked-card join-card">
      ${hasJoined()
        ? `<p class="welcome">Welcome <strong>${escape(playerName())}</strong>
             <button type="button" class="rename link-button">(Change name)</button></p>`
        : `<h2>Join the online leaderboards</h2>
           <p>Pick a name (others may have the same one). Your ranked games, your name and a random
             number for this device are sent to the game's server, nothing else.</p>
           <form class="join-form"><input name="name" maxlength="${NAME_MAX}" required placeholder="Your name" autocomplete="nickname" />
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
      ? `Showing best players across the leaderboards.`
      : `Ranking players by completion time.`;
    list.innerHTML = `<p class="ranked-label">Loading…</p>`;
    try {
      const data = await fetchLeaderboard(board);
      if (shownBoard !== board || !element.isConnected) return;
      // (Top Ranked Players: the name and games only; a leaderboard also the score)
      const value = (v: number) => (board === "overall" ? "" : `<span class="value">${formatTime(v)}</span>`);
      const row = (e: { rank: number; name: string; value: number; games: number; me: boolean }) =>
        `<li class="${e.me ? "me" : ""}"><span class="rank">${e.rank}</span><span class="name">${escape(e.name)}${e.me ? " (you)" : ""}</span>` +
        `${value(e.value)}<span class="games">${plural(e.games, "game")}</span></li>`;
      list.innerHTML = data.entries.length
        ? `<ol class="leaderboard-list">${data.entries.map(row).join("")}</ol>` +
          (data.me && !data.entries.some((e) => e.me) ? `<ol class="leaderboard-list mine">${row(data.me)}</ol>` : "") +
          `<p class="ranked-label">${plural(data.players, "player")} ranked.</p>`
        : `<p class="ranked-label">No one is ranked here yet.</p>`;
      // When the server last worked the leaderboards out (in the phone's own time)
      if (data.updated) {
        const time = new Date(data.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        list.insertAdjacentHTML("beforeend", `<p class="ranked-label leaderboard-updated">Last updated ${time}</p>`);
      }
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
  void show();
  return element;
}
