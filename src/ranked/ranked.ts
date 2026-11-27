// Ranked mode on the device: the game being played, the games played, and the player's
// leaderboard settings. Everything works offline; the games go to the online leaderboard
// (online.ts) when the player has joined it and there is a connection.
//
// No pausing, no second tries:
//   - The game is saved as "active" *before* its puzzle is shown. It ends only by a solve, the
//     time limit, giving up, or leaving the game's screen (the app asks first): all but a solve
//     count as a loss (TIME_LIMIT).
//   - An active game found when the app starts was cut off (the app closed, crashed, or was
//     reloaded): a loss. So closing the app can't buy time or a new puzzle.
//   - The clock is the wall clock: it runs on while the app is in the background. Within a run
//     of the app, the time is the larger of the wall clock and the system's steady clock
//     (performance.now), so setting the phone's clock back doesn't take time off.
import { Preferences } from "@capacitor/preferences";
import { log } from "../log";
import { makePuzzle, type RankedMode, type RankedPuzzle } from "./puzzles";
import { NAME_MAX, TIME_LIMIT, acceptsSolve, statsOf, type GameRecord } from "./rules";

const KEY = "ranked-v1";

export interface ActiveGame extends RankedPuzzle {
  id: string;
  startedAt: number; // Date.now() when the puzzle was shown
}

interface Saved {
  deviceId: string; // random, made once: the player's id on the online leaderboard
  name: string; // the name on the leaderboard (others may have the same one)
  joined: boolean; // the player chose to be on the online leaderboard
  games: GameRecord[];
  uploaded: string[]; // the ids of the games the server has
  refused: string[]; // the ids of games the server refused: not in the score here either
  active: ActiveGame | null;
  choice: { mode: RankedMode; difficulty: number }; // last chosen in the lobby
  cutOff: number; // games lost by leaving or closing the app, not yet told to the player
}

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("-");

const fresh = (): Saved => ({
  deviceId: randomId(), name: "", joined: false, games: [], uploaded: [], refused: [], active: null,
  choice: { mode: "flips", difficulty: 4 }, cutOff: 0,
});
let saved = fresh();
// The steady clock at the moment the active game started in this run of the app
let steadyStart: number | null = null;

const save = () => void Preferences.set({ key: KEY, value: JSON.stringify(saved) }).catch(() => {});

export async function loadRanked() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    saved = value ? { ...fresh(), ...JSON.parse(value) } : fresh();
  } catch {
    saved = fresh();
  }
  if (saved.active) {
    log("info", `Ranked: the game ${saved.active.id} was cut off (the app closed): a loss`);
    endActive(false, []);
    saved.cutOff++;
  }
  save();
}

// --- playing -------------------------------------------------------------------------------

export const activeGame = () => saved.active;

// Start a game: the puzzle is saved as active before anyone sees it
export function startGame(mode: RankedMode, difficulty: number): ActiveGame {
  if (saved.active) endActive(false, []); // (a game still going is lost)
  const game: ActiveGame = { ...makePuzzle(mode, difficulty), id: randomId(), startedAt: Date.now() };
  saved.active = game;
  saved.choice = { mode, difficulty };
  steadyStart = performance.now();
  save();
  log("info", `Ranked: game ${game.id} started (${mode} ${difficulty})`);
  return game;
}

// The time on the clock of the active game (ms)
export function elapsed(): number {
  if (!saved.active) return 0;
  const wall = Date.now() - saved.active.startedAt;
  const steady = steadyStart === null ? 0 : performance.now() - steadyStart;
  return Math.max(wall, steady, 0);
}

// The board was solved with these moves (encoded): true when it counts, and then the game is won
export function trySolve(moves: number[]): boolean {
  const game = saved.active;
  if (!game) return false;
  const time = elapsed();
  if (!acceptsSolve(game, moves, time)) return false;
  endActive(true, moves, time);
  return true;
}

// The active game is lost: the time ran out, the player gave up or left
export function loseGame(reason: string) {
  if (!saved.active) return;
  log("info", `Ranked: game ${saved.active.id} lost (${reason})`);
  endActive(false, []);
}

function endActive(won: boolean, moves: number[], time = TIME_LIMIT) {
  const g = saved.active!;
  saved.games.push({
    id: g.id, mode: g.mode, difficulty: g.difficulty, board: g.board, moves,
    time: won ? Math.max(1, Math.round(time)) : TIME_LIMIT, won, playedAt: g.startedAt,
  });
  saved.active = null;
  steadyStart = null;
  save();
  rankedChanged.forEach((f) => f());
}

// Called when games were added (online.ts sends them)
export const rankedChanged = new Set<() => void>();

// --- what the player sees ------------------------------------------------------------------

export const lastChoice = () => saved.choice;
// The score here is worked out exactly as the server does, from the same games (the ones it
// refused left out), so the score in the lobby and on the leaderboard are the same
export const myStats = () => statsOf(saved.games.filter((g) => !saved.refused.includes(g.id)));
export const games = (): readonly GameRecord[] => saved.games;
export const lastGame = (): GameRecord | undefined => saved.games[saved.games.length - 1];

// Games lost by leaving or closing the app since the player was last told (and now told)
export function takeCutOff(): number {
  const n = saved.cutOff;
  if (n) {
    saved.cutOff = 0;
    save();
  }
  return n;
}

// --- the online leaderboard (see online.ts) -------------------------------------------------

export const deviceId = () => saved.deviceId;
export const playerName = () => saved.name;
export const hasJoined = () => saved.joined;

export function join(name: string) {
  saved.name = name.trim().slice(0, NAME_MAX);
  saved.joined = saved.name.length > 0;
  save();
}

// Off the leaderboards (after the server deleted the player: online.ts, leaveLeaderboards). The
// games stay on the device for the player's own record; a new device id, so joining again later
// starts a new player (and sends the games again).
export function leave() {
  saved.name = "";
  saved.joined = false;
  saved.deviceId = randomId();
  saved.uploaded = [...saved.refused];
  save();
}

export const pendingGames = () => saved.games.filter((g) => !saved.uploaded.includes(g.id));

export function markUploaded(ids: string[], refused: string[] = []) {
  saved.uploaded = [...new Set([...saved.uploaded, ...ids, ...refused])];
  saved.refused = [...new Set([...saved.refused, ...refused])];
  save();
}
