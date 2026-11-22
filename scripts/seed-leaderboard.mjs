// Fills the LOCAL test leaderboards with made-up players, to see how a busy leaderboard looks:
//
//   npm run serve          (in one terminal: the local server, see docs/developer/testing/web.md)
//   npm run seed           (in another: 100 players; `npm run seed -- 30` for 30)
//
// Only ever to the local server: any address but localhost is refused, so the live
// leaderboards are never touched. The players are sent like any app sends its games (POST
// /api/ranked/games), so the server checks every game as usual: real puzzles (made here with
// the game's own code), solved by the rules. The players' scores are spread evenly from 0:05
// to 4:55.
//
// To take them off again: stop the server and delete the folder .netlify/blobs-serve (that is
// all the local leaderboard data, your own local test player too).
import { createServer } from "vite";

const SERVER = process.env.SEED_SERVER ?? "http://localhost:8888";
const PLAYERS = Number(process.argv[2] ?? 100);
const FASTEST = 5_000; // ms: no game, and no score, faster than this
const SLOWEST = 295_000; // ms: the slowest score (the scores are spread evenly between the two)

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SERVER)) {
  console.error(`Refused: ${SERVER} isn't the local server. This script only fills local test data.`);
  process.exit(1);
}

// The game's own code (TypeScript), loaded through Vite
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { DIFFICULTIES, fewestForcesSolution, makePuzzle } = await vite.ssrLoadModule("/src/ranked/puzzles.ts");
const { FORCE, NAME_MAX, TIME_LIMIT } = await vite.ssrLoadModule("/src/ranked/rules.ts");
const { solveFlips } = await vite.ssrLoadModule("/src/game/flipTiles.ts");

const FIRST = ["Ada", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jade", "Kai", "Lena", "Milo", "Nora",
  "Omar", "Pia", "Quin", "Rosa", "Sami", "Tess", "Uma", "Vic", "Wren", "Xavi", "Yara", "Zed"];
const LAST = ["Flip", "Tiles", "Ace", "Pro", "Fox", "Owl", "Star", "Moon", "Bolt", "Wave", "Rex", "Jinx", "Nova", "Pixel"];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);
const BOARDS = ["flips", "moves"].flatMap((mode) => DIFFICULTIES[mode].map((difficulty) => ({ mode, difficulty })));

// A game: a fresh puzzle, won in a time that suits the player's skill (or, now and then, lost)
function game(player, i, { mode, difficulty }, playedAt) {
  const p = makePuzzle(mode, difficulty);
  const id = `seed-${player}-${i}-${Math.random().toString(36).slice(2, 8)}`;
  // (the harder the puzzle, the more often lost)
  if (Math.random() < 0.04 + difficulty * 0.01) {
    return { id, mode, difficulty, board: p.board, moves: [], time: TIME_LIMIT, won: false, playedAt };
  }
  let moves;
  if (mode === "flips") moves = solveFlips(p.board);
  else {
    const s = fewestForcesSolution(p.board, difficulty);
    moves = [...s.forces.map((k) => k + FORCE), ...s.flips];
  }
  return { id, mode, difficulty, board: p.board, moves, time: 0, won: true, playedAt };
}

// (a dropped connection is tried again, a few times)
const post = async (body, tries = 3) => {
  try {
    const response = await fetch(`${SERVER}/api/ranked/games`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return await response.json();
  } catch (error) {
    if (tries <= 1) throw error;
    await new Promise((r) => setTimeout(r, 500));
    return post(body, tries - 1);
  }
};

// (is the server there?)
try {
  await fetch(`${SERVER}/api/ranked/leaderboard?board=overall`);
} catch {
  console.error(`No server at ${SERVER}. Start it first: npm run serve`);
  await vite.close();
  process.exit(1);
}

let sent = 0;
let refused = 0;
for (let n = 1; n <= PLAYERS; n++) {
  const name = `${pick(FIRST)} ${pick(LAST)}`.slice(0, NAME_MAX);
  // The player's score, the same on every leaderboard they're on: spread evenly from 0:05 to
  // 4:55 over all players. It is sent as the score their app worked out (like a real app does),
  // and their games take about that long.
  const skill = Math.round(between(FASTEST, SLOWEST));
  // A few leaderboards each, the easy ones more often
  const boards = BOARDS.filter((b) => Math.random() < 0.75 - (b.difficulty - 4) * 0.07);
  const chosen = boards.length ? boards : [BOARDS[0]];
  const games = [];
  let when = Date.now() - between(1, 30) * 86_400_000;
  for (const board of chosen) {
    const count = Math.round(between(2, 30));
    for (let i = 0; i < count; i++) {
      when += between(1, 60) * 60_000; // (minutes apart, oldest first)
      const g = game(n, games.length, board, Math.min(when, Date.now() - 60_000));
      if (g.won) g.time = Math.round(Math.min(TIME_LIMIT - 1000, Math.max(FASTEST, skill * between(0.8, 1.2))));
      games.push(g);
    }
  }
  const scores = Object.fromEntries(chosen.map((b) => [`${b.mode}-${b.difficulty}`, skill]));
  const deviceId = `seed-device-${String(n).padStart(4, "0")}-${Math.random().toString(36).slice(2, 10)}`;
  for (let i = 0; i < games.length; i += 200) {
    const result = await post({ deviceId, name, scores, games: games.slice(i, i + 200) });
    sent += result.accepted.length;
    refused += result.rejected.length;
  }
  process.stdout.write(`\r${n}/${PLAYERS} players, ${sent} games sent${refused ? `, ${refused} refused` : ""}`);
}
console.log(`\nDone. Open the game at ${SERVER} and look at the leaderboards.`);
await vite.close();
