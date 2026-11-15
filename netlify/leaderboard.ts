// The online leaderboards of ranked mode: what the server does, apart from where it keeps its
// data (any key-value store: Netlify Blobs on the site, see functions/ranked.mts; a Map in the
// tests, see tests/leaderboard.test.ts).
//
// A player is a device: the game makes a random id once (deviceId) and sends it with the
// player's name and games. Names may be the same for different players. The deviceId is never
// shown to anyone: players are stored under a hash of it, and a leaderboard only says which
// entry is "you" to the device that asks.
//
//   POST   /api/ranked/games        { deviceId, name, games }  -> { accepted, rejected }
//   GET    /api/ranked/leaderboard?board=overall|moves-5&deviceId=...
//                                    -> { board, entries, me, players }
//   DELETE /api/ranked/player       { deviceId }               -> { deleted }
//
// Every game is checked again here (src/ranked/rules.ts, checkGame): the board is of the stated
// difficulty, a win is a real solve by the rules, in a time a human can make. What can't be
// checked is the time itself: a changed app could send made-up times. That is the limit of a
// game that plays offline.
import {
  ALL_BOARDS, MIN_GAMES, average, boardScore, checkGame, overallScore, statsOf,
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
}

export interface Entry {
  rank: number;
  name: string;
  value: number; // a leaderboard: the average time (ms); overall: the score
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
  (typeof name === "string" ? name.replace(/[\p{C}<>]/gu, "").trim().slice(0, 20) : "") || "Player";

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
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

// All the leaderboards at once, from all players (cached a short while)
let cache: { at: number; boards: Map<BoardId, { key: string; name: string; value: number; games: number }[]> } | null = null;

async function allBoards(store: KeyValueStore, now: number) {
  if (cache && now - cache.at < CACHE_MS) return cache.boards;
  const boards = new Map<BoardId, { key: string; name: string; value: number; games: number }[]>();
  for (const id of [...ALL_BOARDS, "overall" as const]) boards.set(id, []);
  for (const key of await store.list("players/")) {
    const text = await store.get(key);
    if (!text) continue;
    const player: Player = JSON.parse(text);
    const stats = statsOf(player.games);
    let games = 0;
    for (const [id, s] of Object.entries(stats) as [BoardId, Stats][]) {
      games += s.games;
      if (s.games >= MIN_GAMES) boards.get(id)?.push({ key, name: player.name, value: average(s), games: s.games });
    }
    const score = overallScore(stats);
    if (score > 0) boards.get("overall")!.push({ key, name: player.name, value: score, games });
  }
  for (const [id, list] of boards) {
    // A leaderboard: the lowest average first (more games first when equal); overall: the highest score
    list.sort(id === "overall" ? (a, b) => b.value - a.value || b.games - a.games : (a, b) => a.value - b.value || b.games - a.games);
  }
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
      const entries: Entry[] = list.slice(0, TOP)
        .map((e, i) => ({ rank: i + 1, name: e.name, value: e.value, games: e.games, me: e.key === myKey }));
      const mine = myKey ? list.findIndex((e) => e.key === myKey) : -1;
      const me = mine < 0 ? null : { rank: mine + 1, name: list[mine].name, value: list[mine].value, games: list[mine].games, me: true };
      return json({ board, entries, me, players: list.length });
    }

    if (request.method === "DELETE" && path === "/player") {
      const body = await request.json();
      if (!validId(body?.deviceId)) return json({ error: "bad request" }, 400);
      await store.delete(await playerKey(body.deviceId));
      forgetCache();
      return json({ deleted: true });
    }
    return json({ error: "not found" }, 404);
  } catch {
    return json({ error: "bad request" }, 400);
  }
}

// (for the score's name in answers)
export { boardScore };
