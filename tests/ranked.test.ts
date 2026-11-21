// Ranked mode: the puzzles, the rules, and the games on the device (no cheating by leaving or
// closing the app). The server: leaderboard.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MASKS, solveFlips, solveMoves } from "../src/game/flipTiles";
import {
  DIFFICULTIES, fewestForces, fewestForcesSolution, hintSolution, makePuzzle, type RankedMode,
} from "../src/ranked/puzzles";
import {
  FORCE, HINT_AFTER, HINT_EVERY, RECOVER_GAMES, SCORE_UPDATE_RATE, hintsAt, TIME_LIMIT, acceptsSolve, checkGame, formatScore, formatTime,
  lossPenalty, statsOf,
  type GameRecord,
} from "../src/ranked/rules";
import { readSaved, saved } from "./helpers";

// A fixed sequence of "random" numbers: the same puzzles every run
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

// A solution of a puzzle, encoded as the game saves moves: the fewest moves, with the fewest
// forces of those (forces first), as the player has to
const solutionOf = (board: number, mode: RankedMode) => {
  if (mode === "flips") return solveFlips(board)!;
  const { flips, forces } = fewestForcesSolution(board, ((s) => s.flips.length + s.forces.length)(solveMoves(board)))!;
  return [...forces.map((k) => k + FORCE), ...flips];
};

describe("puzzles", () => {
  it("every difficulty of both modes gives puzzles of exactly that difficulty", () => {
    const rand = random(7);
    for (const mode of ["flips", "moves"] as RankedMode[]) {
      for (const d of DIFFICULTIES[mode]) {
        for (let i = 0; i < 3; i++) {
          const p = makePuzzle(mode, d, rand);
          if (mode === "flips") {
            expect(solveFlips(p.board)!.length).toBe(d);
            expect(p.maxForces).toBe(0);
          } else {
            const { flips, forces } = solveMoves(p.board);
            expect(flips.length + forces.length).toBe(d);
            expect(p.maxForces).toBeLessThanOrEqual(forces.length);
            expect(p.maxForces).toBe(fewestForces(p.board, d));
          }
        }
      }
    }
  });
});

describe("the rules", () => {
  const puzzle = { mode: "flips" as const, difficulty: 3, board: MASKS[0] ^ MASKS[6] ^ MASKS[18], maxForces: 0 };

  it("a solve in exactly the difficulty counts; one that doesn't solve the board never does", () => {
    expect(acceptsSolve(puzzle, [0, 6, 18], 10_000)).toBe(true);
    expect(acceptsSolve(puzzle, [0, 6], 10_000)).toBe(false);
    expect(acceptsSolve(puzzle, [0, 6], HINT_AFTER + 1)).toBe(false);
  });

  it("moves mode: a longer solve never counts, nor one with more forces than given", () => {
    const p = makePuzzle("moves", 4, random(3));
    const best = solutionOf(p.board, "moves");
    expect(acceptsSolve(p, best, 1000)).toBe(true);
    // A longer solve: one flip replaced by forcing each tile of its cross (3 to 5 forces)
    const flip = best.find((m) => !(m & FORCE));
    if (flip !== undefined) {
      const crossForces = [...Array(25).keys()].filter((k) => (MASKS[flip] >>> k) & 1).map((k) => k + FORCE);
      const longer = [...best.filter((m) => m !== flip), ...crossForces];
      const roomy = { ...p, maxForces: 25 };
      expect(acceptsSolve(roomy, longer, 1000)).toBe(false);
      expect(acceptsSolve(roomy, longer, TIME_LIMIT - 1)).toBe(false);
    }
    expect(acceptsSolve({ ...puzzle, mode: "flips" }, [0 + FORCE, 6, 18], 1000)).toBe(false);
    expect(acceptsSolve(puzzle, [0, 6, 18], TIME_LIMIT)).toBe(false); // (time's up)
  });

  it("a flips puzzle solved with more flips never counts", () => {
    // Board: flips 0, 6 and 18. Another solution: the same three, plus a set of flips that
    // changes nothing (5x5 has such "quiet" sets): find one with the solver
    const quietFirstRow = [...Array(32).keys()].find((first) => {
      if (!first) return false;
      let s = 0;
      for (let k = 0; k < 25; k++) if (k < 5 ? (first >>> k) & 1 : (s >>> (k - 5)) & 1) s ^= MASKS[k];
      return s === 0;
    })!;
    let s = 0;
    const quiet: number[] = [];
    for (let k = 0; k < 25; k++) {
      if (k < 5 ? (quietFirstRow >>> k) & 1 : (s >>> (k - 5)) & 1) {
        s ^= MASKS[k];
        quiet.push(k);
      }
    }
    // The three flips, toggled by the quiet set: a different solution, with more flips
    const moves = [0, 6, 18, ...quiet].filter((k, _, all) => all.indexOf(k) === all.lastIndexOf(k));
    expect(moves.length).toBeGreaterThan(3);
    expect(acceptsSolve(puzzle, moves, 1000)).toBe(false);
    expect(acceptsSolve(puzzle, moves, TIME_LIMIT - 1)).toBe(false);
  });

  it("hints: none before 3:00, then one more every 30 seconds, never more than the solution", () => {
    expect(hintsAt(HINT_AFTER - 1, 6)).toBe(0);
    expect(hintsAt(HINT_AFTER, 6)).toBe(1);
    expect(hintsAt(HINT_AFTER + HINT_EVERY - 1, 6)).toBe(1);
    expect(hintsAt(HINT_AFTER + HINT_EVERY, 6)).toBe(2);
    expect(hintsAt(TIME_LIMIT - 1, 6)).toBe(4); // (3:00, 3:30, 4:00, 4:30)
    expect(hintsAt(TIME_LIMIT - 1, 2)).toBe(2);
    // The hints are a real solution of the puzzle, of its number of moves, within its forces
    for (const mode of ["flips", "moves"] as RankedMode[]) {
      const p = makePuzzle(mode, 6, random(11));
      const hints = hintSolution(p);
      const encoded = hints.map((m) => m.tile + (m.kind === "force" ? FORCE : 0));
      expect(hints.length).toBe(6);
      expect(acceptsSolve(p, encoded, 1000)).toBe(true);
    }
  });

  it("a loss costs what RECOVER_GAMES games in half the score make up for, at most 5:00", () => {
    for (const s of [4_000, 10_000, 25_000]) {
      const f = lossPenalty(s);
      expect(f).toBeLessThan(TIME_LIMIT);
      // One loss, then RECOVER_GAMES games in s/2: back at s
      let score = (1 - SCORE_UPDATE_RATE) * s + SCORE_UPDATE_RATE * f;
      for (let i = 0; i < RECOVER_GAMES; i++) score = (1 - SCORE_UPDATE_RATE) * score + SCORE_UPDATE_RATE * (s / 2);
      expect(score).toBeCloseTo(s, 6);
    }
    expect(lossPenalty(120_000)).toBe(TIME_LIMIT);
    expect(lossPenalty(TIME_LIMIT)).toBe(TIME_LIMIT);
  });

  it("a fast player's loss counts as the penalty, and a slower win no worse than that", () => {
    const g = (time: number, won: boolean, playedAt: number): GameRecord =>
      ({ id: `g${playedAt}`, mode: "moves", difficulty: 4, board: 1, moves: [], time, won, playedAt });
    // Many 4-second games: a score near 0:04
    const fast = Array.from({ length: 200 }, (_, i) => g(4_000, true, i));
    const s = statsOf(fast)["moves-4"]!.score;
    const lost = statsOf([...fast, g(TIME_LIMIT, false, 1000)])["moves-4"]!.score;
    expect(lost).toBeCloseTo((1 - SCORE_UPDATE_RATE) * s + SCORE_UPDATE_RATE * lossPenalty(s), 6);
    const slowWin = statsOf([...fast, g(TIME_LIMIT - 1, true, 1000)])["moves-4"]!.score;
    expect(slowWin).toBeCloseTo(lost, 6);
  });

  it("the score: from 5:00, 1/10 of the way to each game (a loss: 5:00), newest last; times in m:ss", () => {
    const g = (time: number, won: boolean): GameRecord =>
      ({ id: `g${Math.random()}`, mode: "moves", difficulty: 4, board: 1, moves: [], time, won, playedAt: 0 });
    const first = { ...g(60_000, true), playedAt: 1 };
    const second = { ...g(0, false), playedAt: 2 };
    const stats = statsOf([second, first]); // (out of order: sorted by when played)
    const afterFirst = (1 - SCORE_UPDATE_RATE) * TIME_LIMIT + SCORE_UPDATE_RATE * 60_000;
    expect(stats["moves-4"]!.score).toBeCloseTo((1 - SCORE_UPDATE_RATE) * afterFirst + SCORE_UPDATE_RATE * TIME_LIMIT, 6);
    expect(stats["moves-4"]).toMatchObject({ games: 2, wins: 1 });
    expect(formatTime(67_400)).toBe("1:07");
    expect(formatTime(TIME_LIMIT)).toBe("5:00");
    // A score: under 10 seconds with hundredths, under a minute with tenths (cut off, not rounded up)
    expect(formatScore(59_990)).toBe("59.9");
    expect(formatScore(10_000)).toBe("10.0");
    expect(formatScore(9_999)).toBe("9.99");
    expect(formatScore(4_690)).toBe("4.69");
    expect(formatScore(4_230)).toBe("4.23");
    expect(formatScore(60_000)).toBe("1:00");
    expect(formatScore(67_400)).toBe("1:07");
  });

  it("difficulties start at 4 in both modes", () => {
    expect(DIFFICULTIES.moves[0]).toBe(4);
    expect(DIFFICULTIES.flips[0]).toBe(4);
  });

  it("the server's check refuses what isn't a real game", () => {
    const p = makePuzzle("moves", 4, random(11));
    const moves = solutionOf(p.board, "moves");
    const game: GameRecord = { id: "abcdefgh-1", mode: "moves", difficulty: 4, board: p.board, moves, time: 20_000, won: true, playedAt: Date.now() };
    expect(checkGame(game)).toBeNull();
    expect(checkGame({ ...game, difficulty: 5 })).toMatch(/difficulty/);
    expect(checkGame({ ...game, difficulty: 3 })).toMatch(/difficulty/); // (no longer offered)
    expect(checkGame({ ...game, moves: moves.slice(1) })).toMatch(/rules/);
    expect(checkGame({ ...game, time: 100 })).toMatch(/fast/);
    expect(checkGame({ ...game, won: false, moves: [], time: 30_000 })).toMatch(/whole time/);
    expect(checkGame({ ...game, won: false, moves: [], time: TIME_LIMIT })).toBeNull();
    expect(checkGame({ ...game, board: 0 })).toMatch(/board/);
    expect(checkGame({ ...game, id: "x" })).toMatch(/id/);
  });
});

describe("games on the device", () => {
  afterEach(() => vi.useRealTimers());

  // The app started afresh (on what is saved now)
  async function start() {
    vi.resetModules();
    const ranked = await import("../src/ranked/ranked");
    await ranked.loadRanked();
    return ranked;
  }

  it("a game is saved as active before it is shown, and a solve in the right moves wins", async () => {
    const ranked = await start();
    const game = ranked.startGame("moves", 4);
    expect(readSaved("ranked-v1").active.id).toBe(game.id);
    expect(ranked.trySolve(solutionOf(game.board, "moves").slice(1))).toBe(false); // (not solved)
    expect(ranked.trySolve(solutionOf(game.board, "moves"))).toBe(true);
    expect(ranked.activeGame()).toBeNull();
    expect(ranked.lastGame()).toMatchObject({ id: game.id, won: true });
    expect(ranked.myStats()["moves-4"]).toMatchObject({ games: 1, wins: 1 });
  });

  it("closing the app during a game makes it a loss of 5:00 (no new puzzle, no time bought)", async () => {
    let ranked = await start();
    const game = ranked.startGame("flips", 5);
    ranked = await start(); // (the app closed and opened again)
    expect(ranked.activeGame()).toBeNull();
    expect(ranked.lastGame()).toMatchObject({ id: game.id, won: false, time: TIME_LIMIT });
    expect(ranked.takeCutOff()).toBe(1);
    expect(ranked.takeCutOff()).toBe(0);
  });

  it("the clock runs on in the background, and setting the phone's clock back takes no time off", async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    const ranked = await start();
    ranked.startGame("moves", 4);
    vi.advanceTimersByTime(90_000); // (90 s, e.g. in another app)
    expect(Math.round(ranked.elapsed() / 1000)).toBe(90);
    vi.setSystemTime(Date.now() - 60 * 60_000); // (the phone's clock set back an hour)
    expect(Math.round(ranked.elapsed() / 1000)).toBe(90);
  });

  it("giving up, or leaving, is a loss; starting a new game while one is on loses that one", async () => {
    const ranked = await start();
    ranked.startGame("moves", 4);
    ranked.loseGame("gave up");
    ranked.startGame("moves", 4);
    ranked.startGame("moves", 4);
    expect(ranked.games().map((g) => g.won)).toEqual([false, false]);
    expect(ranked.myStats()["moves-4"]!.score).toBe(TIME_LIMIT);
  });

  it("nothing is sent before joining; after joining, all games wait to be sent", async () => {
    const ranked = await start();
    ranked.startGame("moves", 4);
    ranked.loseGame("test");
    expect(ranked.hasJoined()).toBe(false);
    ranked.join("  Kasper  ");
    expect(ranked.playerName()).toBe("Kasper");
    expect(ranked.pendingGames().length).toBe(1);
    ranked.markUploaded([ranked.games()[0].id]);
    expect(ranked.pendingGames().length).toBe(0);
    expect(saved.has("ranked-v1")).toBe(true);
  });

  it("a game the server refused is left out of the score here too (so both are the same)", async () => {
    const ranked = await start();
    const game = ranked.startGame("moves", 4);
    ranked.trySolve(solutionOf(game.board, "moves"));
    expect(ranked.myStats()["moves-4"]!.games).toBe(1);
    ranked.markUploaded([], [game.id]);
    expect(ranked.myStats()["moves-4"]).toBeUndefined();
    expect(ranked.pendingGames()).toEqual([]); // (not sent again)
  });
});
