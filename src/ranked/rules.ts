// The rules of ranked mode, shared by the game (src/ranked/ranked.ts) and the leaderboard server
// (netlify/), so both judge a game the same way.
//
//   - A game has TIME_LIMIT (5 minutes). Not solved by then: a loss, counted as TIME_LIMIT.
//   - Until RELAXED_AFTER (4 minutes), only a solve in exactly the puzzle's number of moves
//     counts (fewer is impossible). After that, a solve with more flips counts too (still no
//     more forces than the puzzle gives).
//   - Flips mode: flips only.
//   - The rank on a leaderboard is the average time of all games (losses as TIME_LIMIT), once a
//     player has MIN_GAMES of them there. Lower is better.
//   - The overall leaderboard adds up a score per leaderboard the player is ranked on: harder
//     puzzles and faster times give more (see boardScore).
import { MASKS, N, isSolved, solveFlips, solveMoves } from "../game/flipTiles";
import { DIFFICULTIES, fewestForces, type RankedMode } from "./puzzles";

export const TIME_LIMIT = 5 * 60_000; // ms
export const RELAXED_AFTER = 4 * 60_000; // ms
export const MIN_GAMES = 5; // games on a leaderboard before the player is ranked there
export const MIN_MS_PER_MOVE = 200; // faster than this is not a human (the server refuses it)

// A move as it is saved and sent: the tile, + 32 for a force
export const FORCE = 32;

// Whether a solve counts: the moves (encoded) solve the board, follow the mode, and are few
// enough for the time they took
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
  return moves.length === puzzle.difficulty || (time >= RELAXED_AFTER && moves.length > puzzle.difficulty);
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
  total: number; // ms, the times added up (losses as TIME_LIMIT)
}
export const average = (s: Stats) => (s.games ? s.total / s.games : TIME_LIMIT);

// The games added up per leaderboard
export function statsOf(games: GameRecord[]): Partial<Record<BoardId, Stats>> {
  const stats: Partial<Record<BoardId, Stats>> = {};
  for (const g of games) {
    const s = (stats[boardId(g.mode, g.difficulty)] ??= { games: 0, wins: 0, total: 0 });
    s.games++;
    s.wins += g.won ? 1 : 0;
    s.total += g.won ? Math.min(g.time, TIME_LIMIT) : TIME_LIMIT;
  }
  return stats;
}

// The score of one leaderboard for the overall one: the difficulty, times how much of the time
// was left on average (0 to 100 points per difficulty step). Only once ranked there.
export function boardScore(difficulty: number, s: Stats): number {
  if (s.games < MIN_GAMES) return 0;
  return Math.round(100 * difficulty * (1 - average(s) / TIME_LIMIT));
}

export function overallScore(stats: Partial<Record<BoardId, Stats>>): number {
  let score = 0;
  for (const [id, s] of Object.entries(stats)) score += boardScore(Number(id.split("-")[1]), s!);
  return score;
}

// The minutes and seconds of a time: "1:07.4" (tenths), or "1:07" without them
export function formatTime(ms: number, tenths = true): string {
  const t = Math.max(0, ms);
  const minutes = Math.floor(t / 60_000);
  const seconds = Math.floor((t % 60_000) / 1000);
  const text = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return tenths ? `${text}.${Math.floor((t % 1000) / 100)}` : text;
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
