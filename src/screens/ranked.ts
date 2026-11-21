// Ranked mode's screens (the rules: src/ranked/rules.ts; the games: src/ranked/ranked.ts):
//   #/ranked              the lobby: pick the mode and the difficulty, see your record, Play
//   #/ranked/play         a game: the clock, the board, the Codex (no hints)
//   #/ranked/leaderboard  the online leaderboards, and joining them
// Leaving a game's screen while it is on counts as a loss: main.ts asks first.
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import { MASKS } from "../game/flipTiles";
import { go, previousHash } from "../nav";
import { sound } from "../sound";
import { DIFFICULTIES, RANKED_MODES, boardText, hintSolution, type RankedMode } from "../ranked/puzzles";
import {
  activeGame, elapsed, hasJoined, join, lastChoice, lastGame, loseGame, myStats, playerName, startGame,
  takeCutOff, trySolve,
} from "../ranked/ranked";
import { fetchLeaderboard, sendGames } from "../ranked/online";
import {
  FORCE, HINT_AFTER, HINT_EVERY, NAME_MAX, RECOVER_GAMES, SCORE_UPDATE_RATE, hintsAt, TIME_LIMIT, boardId, formatScore, formatTime, type BoardId,
} from "../ranked/rules";
import { STAR_NAME, earned, isDifficultyOpen, requirements } from "../ranked/unlock";
import { openCodex, popup } from "./codex";
import { starsToUnlock } from "../progress";
import { showGrade } from "./tier";
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

// The button to Top Ranked Players (the home screen's Ranked row, the lobby's top bar): a trophy
export const TROPHY = `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2.5 3 0 0 0 3 4M17 6h2.5a2.5 3 0 0 1-3 4" fill="none" stroke-width="1.8" />` +
  `<path d="M10.5 14h3v3h-3zM8 19.5h8v1.5H8z" /></svg>`;

// The #1 of a leaderboard: a small crown just before the name (in the place's column, so the
// names stay in line)
const CROWN = `<svg class="first-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>`;

// The button to the leaderboard of the mode and difficulty chosen (the lobby's record): a list
// of high scores, a star on the first row
const HISCORES = `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M5 2.8l1.1 2.2 2.4.35-1.75 1.7.4 2.4L5 8.3l-2.15 1.15.4-2.4L1.5 5.35l2.4-.35z" />` +
  `<rect x="10" y="4.5" width="12" height="3" rx="1.5" />` +
  `<circle cx="5" cy="13" r="2" /><rect x="10" y="11.5" width="12" height="3" rx="1.5" />` +
  `<circle cx="5" cy="20" r="2" /><rect x="10" y="18.5" width="12" height="3" rx="1.5" /></svg>`;

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
  const anyLocked = DIFFICULTIES[mode].some((d) => !isDifficultyOpen(mode!, d));

  const element = screen("ranked-screen", `
    ${topbar("Ranked", "#/", `<a class="leaderboard-button global-link" href="#/ranked/leaderboard" aria-label="Top Ranked Players">${TROPHY}</a>`)}
    ${cutOff ? `<p class="ranked-notice">${plural(cutOff, "ranked game")} ended when the app closed: counted as ${cutOff === 1 ? "a loss" : "losses"}.</p>` : ""}
    ${hasJoined() ? `<p class="welcome">Welcome <strong>${escape(playerName())}</strong>
      <button type="button" class="rename link-button">(Change name)</button></p>` : ""}
    <div class="shop-tabs" role="tablist">
      ${RANKED_MODES.map((m) => `<button type="button" role="tab" class="shop-tab" data-mode="${m}"
        aria-selected="${m === mode}">${MODE_NAMES[m]}</button>`).join("")}
    </div>
    <section class="ranked-card">
      <h2>Difficulty</h2>
      <div class="difficulty-picker" role="radiogroup" aria-label="Difficulty">
        ${DIFFICULTIES[mode].map((d) => isDifficultyOpen(mode!, d)
          ? `<button type="button" role="radio" data-difficulty="${d}" aria-checked="${d === difficulty}">${d}</button>`
          : `<button type="button" class="locked" data-locked="${d}"
              aria-label="${d}, locked: see which stars open it">${LOCK}</button>`).join("")}
      </div>
      ${anyLocked ? `<p class="ranked-label">Tap a locked difficulty to see which stars open it.</p>` : ""}
    </section>
    <section class="ranked-card record-card">
      <div class="record-text">
      <h2>Your record</h2>
      <dl class="ranked-stats">
        <dt>Games</dt><dd>${stats?.games ?? 0}</dd>
        <dt>Solved</dt><dd>${stats?.wins ?? 0}</dd>
        <dt>Score</dt><dd>${formatScore(stats?.score ?? TIME_LIMIT)}</dd>
        <dt>Position</dt><dd class="ranked-position">${!hasJoined()
          ? `<a href="#/ranked/leaderboard">Join the leaderboards</a>`
          : stats ? "…" : "–"}</dd>
      </dl>
      </div>
      <a class="leaderboard-button leaderboards-link" href="#/ranked/leaderboard" aria-label="Leaderboard of ${label(mode, difficulty)}">${HISCORES}</a>
    </section>
    <button type="button" class="primary play-ranked"${anyOpen ? "" : " disabled"}>${anyOpen ? `Play · ${label(mode, difficulty)}` : "Play"}</button>
    <button type="button" class="ranked-rules-link">How ranked works</button>`);

  welcomeLine(rerender, element);
  // How ranked works: a popup, from the underlined text under Play
  element.querySelector(".ranked-rules-link")!.addEventListener("click", () => {
    popup("ranked-rules", `<h2>How ranked works</h2>`, `<ul>
      <li>Solve puzzles quickly on a timer. Only the requested solution counts.</li>
      <li>Your score starts at ${formatTime(TIME_LIMIT)} and estimates your average completion time. Get it as low as you can!</li>
      <li>Giving up, leaving the game or closing the app results in a penalty.</li>
      <li>Stuck? Hints begin to appear after ${formatTime(HINT_AFTER)}, separated by ${HINT_EVERY / 1000} s intervals.</li> 
      <li>Become the fastest player and climb to the top of the leaderboard.</li>
    </ul>`);
  });
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
  for (const button of element.querySelectorAll<HTMLButtonElement>("[data-locked]")) {
    button.addEventListener("click", () => showUnlock(mode!, Number(button.dataset.locked)));
  }
  // Leaderboards: the one of the mode and difficulty chosen here
  element.querySelector(".leaderboards-link")!.addEventListener("click", () => showLeaderboard(boardId(mode!, difficulty!)));
  // The trophy: Top Ranked Players, the leaderboard of all leaderboards
  element.querySelector(".global-link")!.addEventListener("click", () => showLeaderboard("overall"));
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

// A locked difficulty's popup: the groups of levels whose stars open it, each with how many of
// its levels have the star, and a link to it (to the group on its stage's screen)
function showUnlock(mode: RankedMode, d: number) {
  const needed = requirements(mode, d);
  const rows = needed.map((r, i) => {
    const done = earned(mode, r);
    const complete = done === r.levels.length;
    const name = r.minMoves === undefined ? `Stage ${r.tier.stage}` : `${r.tier.stage} · ${plural(r.minMoves, "move")}`;
    // (the row is a progress bar: the share of the group's levels with the star)
    const bar = `style="--done: ${(100 * done) / r.levels.length}%"`;
    const inner = `<span class="unlock-name">${name}</span>
      <span class="unlock-count">${complete ? "✓" : `${done}/${r.levels.length}`}</span>`;
    // (no link for a stage not open yet: its screen can't be opened; nor for a group already
    // complete: nothing to do there)
    if (starsToUnlock(r.tier) > 0) {
      return `<li class="stage-locked"><span class="unlock-row" ${bar} aria-label="${name}, stage locked">${LOCK}${inner}</span></li>`;
    }
    if (complete) return `<li class="complete"><span class="unlock-row" aria-label="${name}, complete">${inner}</span></li>`;
    return `<li><a class="unlock-row" ${bar} href="#/tier/${r.tier.difficulty}" data-i="${i}">${inner}</a></li>`;
  }).join("");
  const dialog = popup("unlock-dialog", `<h2>${MODE_NAMES[mode]} · ${label(mode, d)}</h2>`, `
    <p class="hint-dialog-text">${mode === "flips"
      ? `Earn the ${STAR_NAME[mode]} star on every level of the following stage.`
      : `Earn the ${STAR_NAME[mode]} star on every level of ${needed.length === 1 ? "this group" : "these groups"} to unlock it.`}</p>
    <ul class="unlock-list">${rows}</ul>`);
  for (const link of dialog.querySelectorAll<HTMLAnchorElement>("[data-i]")) {
    link.addEventListener("click", () => {
      const r = needed[Number(link.dataset.i)];
      if (r.minMoves !== undefined) showGrade(r.minMoves);
    });
  }
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

  // A solve with too many moves isn't one: the board takes off its "solved" state at once,
  // before anything is drawn, so it just shows the finished tiles, no Solved! animation, and the
  // tiles still take moves (take some back). For a real win the state goes back on, and the
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
      `Score ${formatScore(after)}, ${better ? `${amount(-change)} better` : worse ? `${amount(change)} worse` : "the same"}`);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    const start = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      value.textContent = formatScore(scoreBefore + (after - scoreBefore) * eased);
      if (t < 1) requestAnimationFrame(step);
      else box.classList.add("settled"); // (the difference pops in)
    };
    value.textContent = formatScore(scoreBefore);
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
    if (won) sound.solved(0.35);
    else sound.lose();
    clock.textContent = formatTime(done.time);
    // Won: after the board's own Solved! animation; lost: at once
    window.setTimeout(() => {
      result.hidden = false;
      showScoreChange();
    }, won ? 1800 : 0);
    void sendGames();
  };

  // Hints: from 3:00 one move of a solution, then one more every 30 seconds (rules.ts, hintsAt),
  // marked on the board as on the levels (a hollow diamond, gold = flip, red = force)
  const hints = hintSolution(game);
  let hintsShown = 0;
  let lastTick = 0; // (the second of the last tick, in the last 10 seconds)

  const tick = () => {
    if (over) return;
    if (!element.isConnected) return clearInterval(timer);
    const t = elapsed();
    clock.textContent = formatTime(t);
    const n = hintsAt(t, hints.length);
    if (n > 0) {
      element.classList.add("hinting");
      const next = HINT_AFTER + n * HINT_EVERY;
      phase.textContent = n < hints.length && next < TIME_LIMIT
        ? `${plural(n, "hint")} · the next in ${Math.ceil((next - t) / 1000)}s`
        : `${plural(n, "hint")} · ${formatTime(TIME_LIMIT - t)} left`;
    }
    if (n !== hintsShown) {
      if (n > hintsShown) sound.hint();
      hintsShown = n;
      widget.setMarks(hints.slice(0, n));
    }
    // The last 10 seconds: a tick each second
    const left = Math.ceil((TIME_LIMIT - t) / 1000);
    if (left <= 10 && left > 0 && left !== lastTick) {
      lastTick = left;
      sound.tick();
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
    // Solved, but with more moves than allowed: not a win, and nothing happens (the count shows
    // it, e.g. (13/12)); take moves back
    element.classList.toggle("too-many", solved);
    if (solved) setSolvedLook(false);
  });

  element.querySelector(".open-codex")!.addEventListener("click", openCodex);
  element.querySelector(".give-up")!.addEventListener("click", () => {
    if (over || !confirm("Give up? It counts as a loss.")) return;
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
const PAGE = 10; // entries on a page of a leaderboard

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
  // (joined: the name is on the Ranked screen, "Welcome <name>"; not yet: how to join, here)
  const element = screen("ranked-screen leaderboard-screen", `
    ${topbar("Leaderboards", previousHash() === "#/" ? "#/" : "#/ranked")}
    ${hasJoined() ? "" : `<section class="ranked-card join-card">
      <h2>Join the online leaderboards</h2>
      <p>Pick a name (others may have the same one). Your ranked games, your name and a random
        number for this device are sent to the game's server, nothing else.</p>
      <form class="join-form"><input name="name" maxlength="${NAME_MAX}" required placeholder="Your name" autocomplete="nickname" />
        <button type="submit" class="primary">Join</button></form>
    </section>`}
    <label class="board-choice">Leaderboard <select>${options}</select></label>
    <div class="leaderboard" aria-live="polite"><p class="ranked-label">Loading…</p></div>`);

  const select = element.querySelector("select")!;
  select.value = shownBoard;
  const list = element.querySelector<HTMLElement>(".leaderboard")!;
  // The page shown: PAGE entries from place offset + 1 (the top first; "Around me" moves it)
  let offset = 0;
  const show = async () => {
    const board = shownBoard;
    const from = offset;
    list.innerHTML = `<p class="ranked-label">Loading…</p>`;
    try {
      const data = await fetchLeaderboard(board, { offset: from, limit: PAGE });
      if (shownBoard !== board || offset !== from || !element.isConnected) return;
      // (Top Ranked Players: the name and games only; a leaderboard also the score)
      const value = (v: number) => (board === "overall" ? "" : `<span class="value">${formatScore(v)}</span>`);
      const row = (e: { rank: number; name: string; value: number; games: number; me: boolean }) =>
        `<li class="${[e.me ? "me" : "", e.rank === 1 ? "first" : ""].join(" ").trim()}"><span class="rank">${e.rank}${e.rank === 1 ? CROWN : ""}</span><span class="name">${escape(e.name)}${e.me ? " (you)" : ""}</span>` +
        `${value(e.value)}<span class="games">${plural(e.games, "game")}</span></li>`;
      if (!data.entries.length) {
        list.innerHTML = `<p class="ranked-label">No one is ranked here yet.</p>`;
        return;
      }
      const first = data.entries[0].rank;
      const last = data.entries[data.entries.length - 1].rank;
      // Your own row: right under the page's rows, a small gap between (above the buttons), when
      // you aren't on the first page (and not on this one:
      // there your row is marked already)
      const mine = data.me
        ? data.me.rank <= PAGE || data.entries.some((e) => e.me) ? ""
          : `<ol class="leaderboard-list mine">${row(data.me)}</ol>`
        : hasJoined() ? `<p class="ranked-label my-position">You're not on this leaderboard yet.</p>` : "";
      list.innerHTML = `<ol class="leaderboard-list">${data.entries.map(row).join("")}</ol>
        ${mine}
        <nav class="pager" aria-label="Pages">
          <button type="button" class="page-prev" aria-label="Higher places"${first > 1 ? "" : " disabled"}>‹</button>
          <span class="page-range">${first}–${last} of ${data.players}</span>
          <button type="button" class="page-next" aria-label="Lower places"${last < data.players ? "" : " disabled"}>›</button>
        </nav>
        ${data.me ? `<div class="pager-jumps">
          <button type="button" class="page-top"${first > 1 ? "" : " disabled"}>Top</button>
          <button type="button" class="page-me">Around me</button>
        </div>` : ""}`;
      list.querySelector(".page-prev")!.addEventListener("click", () => turnTo(Math.max(0, from - PAGE)));
      list.querySelector(".page-next")!.addEventListener("click", () => turnTo(from + PAGE));
      list.querySelector(".page-top")?.addEventListener("click", () => turnTo(0));
      // Around me: your place in the middle of the page
      list.querySelector(".page-me")?.addEventListener("click", () => turnTo(Math.max(0, data.me!.rank - 1 - Math.floor(PAGE / 2))));
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
  const turnTo = (to: number) => {
    offset = to;
    void show();
  };
  select.addEventListener("change", () => {
    shownBoard = select.value as BoardId;
    turnTo(0);
  });

  element.querySelector(".join-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = new FormData(e.target as HTMLFormElement).get("name") as string;
    if (!name.trim()) return;
    join(name);
    rerender();
  });
  void show();
  return element;
}

// "Welcome <name> (Change name)", on the Ranked screen for a player who joined the leaderboards
function welcomeLine(rerender: () => void, element: HTMLElement) {
  element.querySelector(".rename")?.addEventListener("click", () => {
    const name = prompt("Your name on the leaderboards", playerName());
    if (!name?.trim()) return;
    join(name);
    // (the name goes along with the next games sent; send now so it shows at once)
    void sendGames(true).then(rerender);
  });
}
