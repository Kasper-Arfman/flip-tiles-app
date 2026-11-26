// The online leaderboards of ranked mode: what the server does, apart from where it keeps its
// data (any key-value store: Netlify Blobs on the site, see functions/ranked.mts; a Map in the
// tests, see tests/leaderboard.test.ts).
//
// A player is a device: the game makes a random id once (deviceId) and sends it with the
// player's name and games. Names may be the same for different players. The deviceId is never
// shown to anyone: players are stored under a hash of it, and a leaderboard only says which
// entry is "you" to the device that asks.
//
//   POST   /api/ranked/games        { deviceId, name, games, scores, counts }  -> { accepted, rejected }
//   GET    /api/ranked/leaderboard?board=overall|moves-5&deviceId=...&offset=0&limit=25
//                                    -> { board, entries, me, players, updated }
//          (a page: `limit` entries, at most 100, from place offset + 1; without them the top 100)
//
// Every game is checked again here (src/ranked/rules.ts, checkGame): the board is of the stated
// difficulty, a win is a real solve by the rules, in a time a human can make. What can't be
// checked is the time itself: a changed app could send made-up times. That is the limit of a
// game that plays offline.
//
// The score shown is the one the player's app reports (Player.scores), so it is the same as in
// the game; it counts only on a leaderboard where this server has a real game of theirs, and
// only as a time from 0:00 to 5:00. A changed app could report a better score than its games
// earned: the price of showing exactly the game's own score.
import {
  ALL_BOARDS, NAME_MAX, TIME_LIMIT, checkGame, statsOf,
  type BoardId, type GameRecord, type Stats,
} from "../src/ranked/rules";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

interface Player {
  name: string;
  games: GameRecord[];
  // The scores the player's own app worked out, per leaderboard: these are shown, so a player's
  // score on the leaderboard is the one they see in the game (also for games played with an
  // older version of the scoring). Used only on a leaderboard where this server has a game of
  // theirs; without one, the score is worked out here from their games.
  scores?: Partial<Record<BoardId, number>>;
  // The number of games the player's app counts, per leaderboard: shown in the same way as the
  // scores, so the games on the leaderboard are the ones in the game (also when games were lost
  // on the way here). Not checked: nothing is won by a higher count.
  counts?: Partial<Record<BoardId, number>>;
}

// A score as an app reports it: a time from 0:00 to 5:00
const validScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= TIME_LIMIT;
// A number of games as an app reports it
const validCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 1_000_000;

export interface Entry {
  rank: number;
  name: string;
  value: number; // a leaderboard: the score (ms, see statsOf); overall: the average place (1 = first)
  games: number;
  me: boolean;
}

const TOP = 100; // entries in a leaderboard
const MAX_GAMES_PER_REQUEST = 200;
const MAX_GAMES_PER_PLAYER = 20_000;
const CACHE_MS = 30_000; // the leaderboards are worked out at most this often

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{8,64}$/.test(id);

// A name as shown: at most 20 characters, no control characters, never empty
export const cleanName = (name: unknown) =>
  (typeof name === "string" ? name.replace(/[\p{C}<>]/gu, "").trim().slice(0, NAME_MAX) : "") || "Player";

const PLAYER_KEY = /^players\/[0-9a-f]{64}$/;

async function playerKey(deviceId: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`flip-tiles:${deviceId}`));
  return `players/${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // The apps ask from their own origin (https://localhost, capacitor://localhost)
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

// All the leaderboards at once, from all players (cached a short while)
interface Row {
  key: string;
  name: string;
  value: number; // see Entry
  games: number;
  score: number; // ms: a leaderboard's score; overall: the scores added up (its tie-break)
  boards: number; // overall: the leaderboards the player is on
}
let cache: { at: number; boards: Map<BoardId, Row[]> } | null = null;

export const PETER_NAME = "Peter Pathetic";
const PETER: Row = { key: "made-up/peter-pathetic", name: PETER_NAME, value: TIME_LIMIT, games: 0, score: TIME_LIMIT, boards: 1 };

async function allBoards(store: KeyValueStore, now: number) {
  if (cache && now - cache.at < CACHE_MS) return cache.boards;
  const boards = new Map<BoardId, Row[]>();
  for (const id of ALL_BOARDS) boards.set(id, []);
  for (const key of await store.list("players/")) {
    // Only real players (players/ + a hash, see playerKey): the local test server (`npm run
    // serve`) on Windows leaves half-written copies under other names, which would show the same
    // player twice
    if (!PLAYER_KEY.test(key)) continue;
    const text = await store.get(key);
    if (!text) continue;
    const player: Player = JSON.parse(text);
    for (const [id, s] of Object.entries(statsOf(player.games)) as [BoardId, Stats][]) {
      // (a leaderboard no longer in the game, e.g. a difficulty taken out, isn't shown)
      const score = validScore(player.scores?.[id]) ? player.scores![id]! : s.score;
      const games = validCount(player.counts?.[id]) ? player.counts![id]! : s.games;
      boards.get(id)?.push({ key, name: player.name, value: score, games, score, boards: 1 });
    }
  }
  // Peter Pathetic, a made-up player on every leaderboard with the worst score there is (and no
  // games, so a real player with the same score still ranks above him): no leaderboard is empty
  for (const list of boards.values()) list.push({ ...PETER });
  // A leaderboard: the lowest score first (more games first when equal)
  for (const list of boards.values()) list.sort((a, b) => a.value - b.value || b.games - a.games);

  // Overall: first the number of leaderboards a player is on (more is higher: someone on 6
  // leaderboards is above anyone on 1), then their average place on them (lower is higher), then
  // their average score on them (faster is higher). Peter comes last, at his
  // average place on the leaderboards that have real players (1 when there are none): on a
  // leaderboard nobody played he is first, which mustn't lift him overall.
  const players = new Map<string, Row & { places: number[] }>();
  const peterPlaces: number[] = [];
  for (const list of boards.values()) {
    list.forEach((row, i) => {
      if (row.key === PETER.key) {
        if (list.length > 1) peterPlaces.push(i + 1);
        return;
      }
      const p = players.get(row.key) ?? { ...row, value: 0, games: 0, score: 0, boards: 0, places: [] };
      p.places.push(i + 1);
      p.games += row.games;
      p.score += row.score;
      p.boards++;
      players.set(row.key, p);
    });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const overall = [...players.values()].map(({ places, ...p }) => ({ ...p, value: mean(places) }));
  overall.sort((a, b) => b.boards - a.boards || a.value - b.value || a.score / a.boards - b.score / b.boards);
  overall.push({ ...PETER, value: mean(peterPlaces) });
  boards.set("overall", overall);
  cache = { at: now, boards };
  return boards;
}

export function forgetCache() {
  cache = null;
}

export async function handle(request: Request, store: KeyValueStore, now = Date.now()): Promise<Response> {
  if (request.method === "OPTIONS") return json({});
  const path = new URL(request.url).pathname.replace(/^.*\/api\/ranked/, "");
  try {
    if (request.method === "POST" && path === "/games") {
      const body = await request.json();
      if (!validId(body?.deviceId) || !Array.isArray(body.games) || body.games.length > MAX_GAMES_PER_REQUEST) {
        return json({ error: "bad request" }, 400);
      }
      const key = await playerKey(body.deviceId);
      const text = await store.get(key);
      const player: Player = text ? JSON.parse(text) : { name: "", games: [] };
      player.name = cleanName(body.name);
      // The app's own scores (see Player.scores)
      if (body.scores && typeof body.scores === "object") {
        player.scores ??= {};
        for (const [id, v] of Object.entries(body.scores)) {
          if ((ALL_BOARDS as string[]).includes(id) && validScore(v)) player.scores[id as BoardId] = v;
        }
      }
      // ... and its own numbers of games (see Player.counts)
      if (body.counts && typeof body.counts === "object") {
        player.counts ??= {};
        for (const [id, v] of Object.entries(body.counts)) {
          if ((ALL_BOARDS as string[]).includes(id) && validCount(v)) player.counts[id as BoardId] = v;
        }
      }
      const known = new Set(player.games.map((g) => g.id));
      const accepted: string[] = [];
      const rejected: { id: string; reason: string }[] = [];
      for (const game of body.games as GameRecord[]) {
        const reason = known.has(game?.id) ? null : checkGame(game, now);
        if (reason) {
          rejected.push({ id: String(game?.id), reason });
          continue;
        }
        if (!known.has(game.id)) {
          const { id, mode, difficulty, board, moves, time, won, playedAt } = game;
          player.games.push({ id, mode, difficulty, board, moves, time, won, playedAt });
          known.add(game.id);
        }
        accepted.push(game.id);
      }
      if (player.games.length > MAX_GAMES_PER_PLAYER) return json({ error: "too many games" }, 400);
      await store.set(key, JSON.stringify(player));
      forgetCache();
      return json({ accepted, rejected });
    }

    if (request.method === "GET" && path === "/leaderboard") {
      const params = new URL(request.url).searchParams;
      const board = params.get("board") as BoardId;
      if (board !== "overall" && !ALL_BOARDS.includes(board)) return json({ error: "no such leaderboard" }, 404);
      const deviceId = params.get("deviceId");
      const myKey = validId(deviceId) ? await playerKey(deviceId) : null;
      const list = (await allBoards(store, now)).get(board)!;
      // A page of it: `offset` entries skipped, at most `limit` (TOP when not asked: older apps)
      const offset = Math.max(0, Math.min(list.length, Math.floor(Number(params.get("offset")) || 0)));
      const limit = Math.max(1, Math.min(TOP, Math.floor(Number(params.get("limit")) || TOP)));
      const entries: Entry[] = list.slice(offset, offset + limit)
        .map((e, i) => ({ rank: offset + i + 1, name: e.name, value: e.value, games: e.games, me: e.key === myKey }));
      const mine = myKey ? list.findIndex((e) => e.key === myKey) : -1;
      const me = mine < 0 ? null : { rank: mine + 1, name: list[mine].name, value: list[mine].value, games: list[mine].games, me: true };
      // (updated: when the leaderboards were last worked out, ms since 1970)
      return json({ board, entries, me, players: list.length, updated: cache!.at });
    }

    return json({ error: "not found" }, 404);
  } catch {
    return json({ error: "bad request" }, 400);
  }
}
