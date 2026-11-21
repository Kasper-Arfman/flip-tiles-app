// The rules of ranked mode, shared by the game (src/ranked/ranked.ts) and the leaderboard server
// (netlify/), so both judge a game the same way.
//
//   - A game has TIME_LIMIT (5 minutes). Not solved by then: a loss, counted as a penalty of at
//     most TIME_LIMIT (lighter for fast players, see lossPenalty).
//   - Only a solve in exactly the puzzle's number of moves counts (fewer is impossible), with no
//     more forces than the puzzle gives.
//   - From HINT_AFTER (3 minutes) on, the board shows one move of a solution as a hint, and one
//     more every HINT_EVERY (30 seconds): see hintsAt.
//   - Flips mode: flips only.
//   - The rank on a leaderboard is the score: a weighted average time that starts at TIME_LIMIT
//     (see statsOf), from the first game on. Lower is better.
//   - The overall leaderboard ranks by the number of leaderboards a player is on (more is
//     better), then the average of their places on them (lower is better), then the average of
//     their scores on them (lower is better).
import { MASKS, N, isSolved, solveFlips, solveMoves } from "../game/flipTiles";
import { DIFFICULTIES, fewestForces, type RankedMode } from "./puzzles";

export const TIME_LIMIT = 5 * 60_000; // ms
export const NAME_MAX = 16; // characters in a name on the leaderboards (a common limit in games)
export const HINT_AFTER = 3 * 60_000; // ms: the first hint
export const HINT_EVERY = 30_000; // ms: each hint after it

// How many hints the board shows at this time in a game (0 before HINT_AFTER; then 1, 2, ...,
// up to the solution's number of moves)
export const hintsAt = (time: number, moves: number) =>
  time < HINT_AFTER ? 0 : Math.min(moves, 1 + Math.floor((time - HINT_AFTER) / HINT_EVERY));
export const MIN_MS_PER_MOVE = 200; // faster than this is not a human (the server refuses it)

// score = (1 - SCORE_UPDATE_RATE) x score + SCORE_UPDATE_RATE x time
export const SCORE_UPDATE_RATE = 1 / 10;  // 0 (slow) to 1 (fast)

// The loss penalty (forfeit, left, time's up) can be compensated within RECOVER_GAMES 'good' games.
export const RECOVER_GAMES = 5;

// A move as it is saved and sent: the tile, + 32 for a force
export const FORCE = 32;

// Whether a solve counts: the moves (encoded) solve the board, follow the mode, are exactly the
// puzzle's number, and came in time
export function acceptsSolve(
  puzzle: { mode: RankedMode; difficulty: number; board: number; maxForces: number },
  moves: number[],
  time: number,
): boolean {
  let state = puzzle.board;
  for (const m of moves) state ^= m & FORCE ? 1 << (m & 31) : MASKS[m & 31];
  if (!isSolved(state >>> 0)) return false;
  const forces = moves.filter((m) => m & FORCE).length;
  if (puzzle.mode === "flips" && forces > 0) return false;
  if (forces > puzzle.maxForces) return false;
  if (time >= TIME_LIMIT) return false;
  return moves.length === puzzle.difficulty;
}

// The leaderboards: one per mode and difficulty ("moves-5"), and the overall one
export type BoardId = `${RankedMode}-${number}` | "overall";
export const boardId = (mode: RankedMode, difficulty: number): BoardId => `${mode}-${difficulty}`;
export const ALL_BOARDS = (["moves", "flips"] as RankedMode[])
  .flatMap((mode) => DIFFICULTIES[mode].map((d) => boardId(mode, d)));

// A game as saved, sent and stored
export interface GameRecord {
  id: string; // random, made by the device: the server keeps each game once
  mode: RankedMode;
  difficulty: number;
  board: number;
  moves: number[]; // the solve (encoded, see FORCE); empty for a loss
  time: number; // ms; TIME_LIMIT for a loss
  won: boolean;
  playedAt: number; // when it started (ms since 1970)
}

export interface Stats {
  games: number;
  wins: number;
  score: number; // ms: the weighted average time (see SCORE_UPDATE_RATE)
}


//
// With s the score before the loss, F the time a loss counts as, w = SCORE_UPDATE_RATE, r = 1 - w and
// n = RECOVER_GAMES, the loss makes the score
//   s1 = r x s + w x F
// and each good game after it (time s/2) makes it r x score + w x s/2, so after n of them
//   s(n) = r^n x s1 + (1 - r^n) x s/2
// Asking s(n) = s (back where the player was) and solving for F:
//   F = (s / w) x ((1 - (1 - r^n) / 2) / r^n - r)
// The penalty is the smaller of F and TIME_LIMIT. With w = 1/10 and n = 5, F is about 4.5 x s:
// a player with a score above 1:07 still loses the full 5:00; a very fast player (a score of
// 0:04 say) loses about 0:18. A slower win never counts as worse than a loss, so it is never
// better to give up than to finish.
export function lossPenalty(score: number): number {
  const w = SCORE_UPDATE_RATE;
  const r = 1 - w;
  const rn = r ** RECOVER_GAMES;
  const f = (score / w) * ((1 - (1 - rn) / 2) / rn - r);
  return Math.min(f, TIME_LIMIT);
}

// The games added up per leaderboard
export function statsOf(games: GameRecord[]): Partial<Record<BoardId, Stats>> {
  const stats: Partial<Record<BoardId, Stats>> = {};
  for (const g of [...games].sort((a, b) => a.playedAt - b.playedAt)) {
    const s = (stats[boardId(g.mode, g.difficulty)] ??= { games: 0, wins: 0, score: TIME_LIMIT });
    s.games++;
    s.wins += g.won ? 1 : 0;
    const penalty = lossPenalty(s.score);
    s.score = (1 - SCORE_UPDATE_RATE) * s.score + SCORE_UPDATE_RATE * (g.won ? Math.min(g.time, penalty) : penalty);
  }
  return stats;
}

// A score as shown (the leaderboards, the record, the score after a game): under 10 seconds in
// seconds with hundredths ("4.69"), under a minute with tenths ("59.9"), cut off, never rounded
// up ("9.99", not "10.00"); from a minute on as formatTime ("1:07"). (The clock always shows
// formatTime.)
export function formatScore(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return (Math.floor(t / 10) / 100).toFixed(2);
  if (t < 60_000) return (Math.floor(t / 100) / 10).toFixed(1);
  return formatTime(t);
}

// The minutes and seconds of a time: "1:07"
export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  return `${Math.floor(t / 60_000)}:${String(Math.floor((t % 60_000) / 1000)).padStart(2, "0")}`;
}

// The server's check of a game sent to it: the puzzle is what it says (worked out again), and a
// win is a solve by the rules in a time a human can make. Returns why not, or null when fine.
export function checkGame(g: GameRecord, now = Date.now()): string | null {
  if (typeof g !== "object" || g === null) return "not a game";
  if (typeof g.id !== "string" || !/^[\w-]{8,64}$/.test(g.id)) return "bad id";
  if (g.mode !== "moves" && g.mode !== "flips") return "bad mode";
  if (!DIFFICULTIES[g.mode].includes(g.difficulty)) return "bad difficulty";
  if (!Number.isInteger(g.board) || g.board < 0 || g.board >= 2 ** N || isSolved(g.board)) return "bad board";
  if (!Array.isArray(g.moves) || g.moves.length > 50 || !g.moves.every((m) => Number.isInteger(m) && m >= 0 && (m & 31) < N && m < 64)) {
    return "bad moves";
  }
  if (typeof g.time !== "number" || !(g.time > 0) || g.time > TIME_LIMIT) return "bad time";
  if (typeof g.won !== "boolean") return "bad result";
  if (typeof g.playedAt !== "number" || g.playedAt > now + 86_400_000 || g.playedAt < Date.UTC(2026, 0, 1)) return "bad date";
  const minimum = g.mode === "flips" ? solveFlips(g.board)?.length : ((s) => s.flips.length + s.forces.length)(solveMoves(g.board));
  if (minimum !== g.difficulty) return "the board isn't of this difficulty";
  if (!g.won) return g.time === TIME_LIMIT ? null : "a loss takes the whole time";
  const maxForces = g.mode === "flips" ? 0 : fewestForces(g.board, g.difficulty);
  if (!acceptsSolve({ ...g, maxForces }, g.moves, g.time)) return "not a solve by the rules";
  if (g.time < MIN_MS_PER_MOVE * g.moves.length) return "too fast";
  return null;
}
