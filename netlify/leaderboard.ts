// The online leaderboards of ranked mode: what the server does, apart from where it keeps its
// data (any key-value store: Netlify Blobs on the site, see blobStore.ts; a Map in the tests,
// see tests/leaderboard.test.ts). The design is in docs/developer/leaderboards.md.
//
// A player is a device: the game makes a random id once (deviceId) and sends it with the
// player's name and games. Names may be the same for different players. The deviceId is never
// shown to anyone: players are stored under a hash of it, and a leaderboard only says which
// entry is "you" to the device that asks. Each entry has a public id instead (another hash), to
// report a name with.
//
//   POST   /api/ranked/games        { deviceId, name, games, scores, counts }  -> { accepted, rejected }
//   GET    /api/ranked/leaderboard?board=overall|moves-5&deviceId=...&offset=0&limit=25
//                                    -> { board, entries, me, players, updated }
//          (a page: `limit` entries, at most 100, from place offset + 1; without them the top 100)
//   POST   /api/ranked/report       { deviceId, id }  -> { ok }   (a name reported as offensive)
//   POST   /api/ranked/leave        { deviceId }      -> { ok }   (the player and their games deleted)
//   GET    /api/ranked/admin/reports                 (with the admin token: see below)
//   POST   /api/ranked/admin/hide   { id }, /admin/show { id }
//
// Built for many players: a request never reads all players. Sending games writes only that
// player, and a mark that they changed. The leaderboards are worked out on a schedule (rebuild,
// every minute: functions/ranked-rebuild.mts), from a short summary of every player (the
// index) that is brought up to date with only the players marked; each leaderboard is then
// stored ready to show, and a request reads just the one it asks for.
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
  ALL_BOARDS, TIME_LIMIT, checkGame, statsOf,
  type BoardId, type GameRecord, type Stats,
} from "../src/ranked/rules";
import { HIDDEN_NAME, cleanName, isOffensive } from "../src/ranked/names";

export { cleanName };

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

// What is stored where:
//   players/<hash>        a player: name, games, scores, counts (POST /games)
//   changed/<hash>        a mark: that player changed since the last rebuild
//   changed/moderation    a mark: a name was hidden or shown again
//   index                 every player in short (name, and per leaderboard the score and games):
//                         the rebuild's own, kept up to date with the marked players
//   boards/<board>        a leaderboard as worked out by the last rebuild (GET /leaderboard)
//   reports/<id>          the reports on a player's name (by public id)
//   hidden/<id>           a hidden name: shown as "Player" for as long as the player keeps it
// (The players were stored like this before the leaderboards had a schedule: the first rebuild
// finds them all.)
const MARK = "changed/";
const MODERATION_MARK = "changed/moderation";
const INDEX = "index";
const boardKey = (board: BoardId) => `boards/${board}`;

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
  id: string; // the player's public id (to report their name with)
  name: string;
  value: number; // a leaderboard: the score (ms, see statsOf); overall: the average place (1 = first)
  games: number;
  me: boolean;
}

const TOP = 100; // entries in a leaderboard
const MAX_GAMES_PER_REQUEST = 200;
const MAX_GAMES_PER_PLAYER = 20_000;
const CACHE_MS = 20_000; // a stored leaderboard is read again at most this often (per server)
const FULL_REBUILD_MS = 24 * 3_600_000; // once a day the index is made again from all players
export const REPORTS_TO_HIDE = 3; // different players reporting a name hide it for everyone
const BATCH = 50; // storage reads or writes at the same time

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{8,64}$/.test(id);
const validPublicId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{16}$/.test(id);

const PLAYER_KEY = /^players\/[0-9a-f]{64}$/;
const PLAYER_MARK = /^changed\/[0-9a-f]{64}$/;

const sha256 = async (text: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const playerKey = async (deviceId: string) => `players/${await sha256(`flip-tiles:${deviceId}`)}`;
// The id a player is known by on the leaderboards (no way back to their key or device)
const publicId = async (key: string) => (await sha256(`flip-tiles-public:${key}`)).slice(0, 16);

// Do something for every item, BATCH at a time
async function each<T>(items: T[], f: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += BATCH) await Promise.all(items.slice(i, i + BATCH).map(f));
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

// --- the rebuild: the leaderboards worked out ----------------------------------------------

// A player in short, as the index keeps them: per leaderboard [score, games]
interface Summary {
  id: string;
  name: string;
  boards: Partial<Record<BoardId, [number, number]>>;
}
interface Index {
  fullAt: number; // when the index was last made from all players
  players: Record<string, Summary>; // by key
}

async function summarize(key: string, player: Player): Promise<Summary> {
  const boards: Summary["boards"] = {};
  for (const [id, s] of Object.entries(statsOf(player.games)) as [BoardId, Stats][]) {
    // (a leaderboard no longer in the game, e.g. a difficulty taken out, isn't shown)
    if (!ALL_BOARDS.includes(id)) continue;
    const score = validScore(player.scores?.[id]) ? player.scores![id]! : s.score;
    const games = validCount(player.counts?.[id]) ? player.counts![id]! : s.games;
    boards[id] = [score, games];
  }
  // (also a name stored before names were checked)
  const name = cleanName(player.name);
  return { id: await publicId(key), name: isOffensive(name) ? HIDDEN_NAME : name, boards };
}

// A row of a stored leaderboard. k: the player's key (never sent: only to find "me")
interface Row {
  k: string;
  id: string;
  name: string;
  value: number; // see Entry
  games: number;
}
interface StoredBoard {
  updated: number; // ms since 1970
  rows: Row[];
}

export const PETER_NAME = "Peter Pathetic";
const PETER_ID = "0000000000000000";
const PETER: Row = { k: "made-up/peter-pathetic", id: PETER_ID, name: PETER_NAME, value: TIME_LIMIT, games: 0 };

// All the leaderboards at once, from the index (hidden: the names hidden, by public id)
function rank(index: Index, hidden: Map<string, string>): Map<BoardId, Row[]> {
  const boards = new Map<BoardId, (Row & { score: number })[]>();
  for (const id of ALL_BOARDS) boards.set(id, []);
  for (const [k, p] of Object.entries(index.players)) {
    const name = hidden.get(p.id) === p.name ? HIDDEN_NAME : p.name;
    for (const [id, [score, games]] of Object.entries(p.boards) as [BoardId, [number, number]][]) {
      boards.get(id)?.push({ k, id: p.id, name, value: score, games, score });
    }
  }
  // Peter Pathetic, a made-up player on every leaderboard with the worst score there is (and no
  // games, so a real player with the same score still ranks above him): no leaderboard is empty
  for (const list of boards.values()) list.push({ ...PETER, score: TIME_LIMIT });
  // A leaderboard: the lowest score first (more games first when equal)
  for (const list of boards.values()) list.sort((a, b) => a.value - b.value || b.games - a.games);

  // Overall: first the number of leaderboards a player is on (more is higher: someone on 6
  // leaderboards is above anyone on 1), then their average place on them (lower is higher), then
  // their average score on them (faster is higher). Peter comes last, at his
  // average place on the leaderboards that have real players (1 when there are none): on a
  // leaderboard nobody played he is first, which mustn't lift him overall.
  const players = new Map<string, Row & { score: number; boards: number; places: number[] }>();
  const peterPlaces: number[] = [];
  for (const list of boards.values()) {
    list.forEach((row, i) => {
      if (row.k === PETER.k) {
        if (list.length > 1) peterPlaces.push(i + 1);
        return;
      }
      const p = players.get(row.k) ?? { ...row, value: 0, games: 0, score: 0, boards: 0, places: [] };
      p.places.push(i + 1);
      p.games += row.games;
      p.score += row.score;
      p.boards++;
      players.set(row.k, p);
    });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const overall = [...players.values()].map((p) => ({ ...p, value: mean(p.places) }));
  overall.sort((a, b) => b.boards - a.boards || a.value - b.value || a.score / a.boards - b.score / b.boards);

  const result = new Map<BoardId, Row[]>();
  const row = ({ k, id, name, value, games }: Row): Row => ({ k, id, name, value, games });
  for (const [id, list] of boards) result.set(id, list.map(row));
  result.set("overall", [...overall.map(row), { ...PETER, value: mean(peterPlaces) }]);
  return result;
}

// Bring the leaderboards up to date: the players changed since the last time (or all of them:
// the first time, once a day, or with full), then every leaderboard worked out and stored.
// Nothing is done when nothing changed. Run every minute (functions/ranked-rebuild.mts).
export async function rebuild(store: KeyValueStore, now = Date.now(), { full = false } = {}) {
  const text = await store.get(INDEX);
  let index: Index | null = text ? JSON.parse(text) : null;
  const marks = await store.list(MARK);
  const fully = full || !index || now - index.fullAt > FULL_REBUILD_MS;
  if (!fully && !marks.length) return { players: Object.keys(index!.players).length, changed: 0, full: false };
  // The marks go first: a player changing after this is marked again, for the next rebuild
  await each(marks, (m) => store.delete(m));
  let keys: string[];
  if (fully) {
    // Only real players (players/ + a hash, see playerKey): the local test server (`npm run
    // serve`) on Windows leaves half-written copies under other names, which would show the same
    // player twice
    keys = (await store.list("players/")).filter((k) => PLAYER_KEY.test(k));
    index = { fullAt: now, players: {} };
  } else {
    keys = marks.filter((m) => PLAYER_MARK.test(m)).map((m) => `players/${m.slice(MARK.length)}`);
  }
  await each(keys, async (key) => {
    const player = await store.get(key);
    if (player) index!.players[key] = await summarize(key, JSON.parse(player));
    else delete index!.players[key];
  });

  const hidden = new Map<string, string>();
  await each(await store.list("hidden/"), async (key) => {
    const h = await store.get(key);
    if (h) hidden.set(key.slice("hidden/".length), JSON.parse(h).name);
  });
  const boards = rank(index!, hidden);
  await each([...boards], ([id, rows]) => store.set(boardKey(id), JSON.stringify({ updated: now, rows } satisfies StoredBoard)));
  await store.set(INDEX, JSON.stringify(index));
  forgetCache();
  return { players: Object.keys(index!.players).length, changed: keys.length, full: fully };
}

// --- requests --------------------------------------------------------------------------------

// The stored leaderboards this server read lately (see CACHE_MS)
const cache = new Map<BoardId, { at: number; board: StoredBoard }>();

export function forgetCache() {
  cache.clear();
}

async function readBoard(store: KeyValueStore, id: BoardId, now: number): Promise<StoredBoard> {
  const known = cache.get(id);
  if (known && now - known.at < CACHE_MS) return known.board;
  let text = await store.get(boardKey(id));
  if (!text) {
    // Not worked out yet (the first request after this version goes online, before its first
    // scheduled rebuild): now, once
    await rebuild(store, now, { full: true });
    text = await store.get(boardKey(id));
  }
  const board: StoredBoard = text ? JSON.parse(text) : { updated: now, rows: [{ ...PETER }] };
  cache.set(id, { at: now, board });
  return board;
}

export interface Options {
  // Work the leaderboards out on every request, before answering: where no schedule runs (the
  // local test server, and test deploys: Netlify runs scheduled functions only on the live site)
  rebuildOnRead?: boolean;
  // The token for /admin/... (the Netlify environment variable RANKED_ADMIN_TOKEN): without one
  // there is no admin
  adminToken?: string;
}

export async function handle(request: Request, store: KeyValueStore, now = Date.now(), options: Options = {}): Promise<Response> {
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
      // (an offensive name isn't kept: the app says so before sending, an older app doesn't)
      const name = cleanName(body.name);
      player.name = isOffensive(name) ? HIDDEN_NAME : name;
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
      // (for the next rebuild: this player changed)
      await store.set(`${MARK}${key.slice("players/".length)}`, String(now));
      return json({ accepted, rejected });
    }

    if (request.method === "GET" && path === "/leaderboard") {
      const params = new URL(request.url).searchParams;
      const board = params.get("board") as BoardId;
      if (board !== "overall" && !ALL_BOARDS.includes(board)) return json({ error: "no such leaderboard" }, 404);
      if (options.rebuildOnRead) await rebuild(store, now);
      const deviceId = params.get("deviceId");
      const myKey = validId(deviceId) ? await playerKey(deviceId) : null;
      const { updated, rows } = await readBoard(store, board, now);
      // A page of it: `offset` entries skipped, at most `limit` (TOP when not asked: older apps)
      const offset = Math.max(0, Math.min(rows.length, Math.floor(Number(params.get("offset")) || 0)));
      const limit = Math.max(1, Math.min(TOP, Math.floor(Number(params.get("limit")) || TOP)));
      const entry = (r: Row, i: number): Entry => ({ rank: i + 1, id: r.id, name: r.name, value: r.value, games: r.games, me: r.k === myKey });
      const entries = rows.slice(offset, offset + limit).map((r, i) => entry(r, offset + i));
      const mine = myKey ? rows.findIndex((r) => r.k === myKey) : -1;
      // (updated: when the leaderboards were last worked out, ms since 1970)
      return json({ board, entries, me: mine < 0 ? null : entry(rows[mine], mine), players: rows.length, updated });
    }

    // A name reported as offensive, by a player who joined the leaderboards. Hidden for everyone
    // once REPORTS_TO_HIDE different players reported it (unless you showed it again: admin).
    if (request.method === "POST" && path === "/report") {
      const body = await request.json();
      if (!validId(body?.deviceId) || !validPublicId(body.id) || body.id === PETER_ID) return json({ error: "bad request" }, 400);
      const reporter = await playerKey(body.deviceId);
      const row = (await readBoard(store, "overall", now)).rows.find((r) => r.id === body.id);
      if (!row) return json({ error: "no such player" }, 404);
      if (row.k === reporter || row.name === HIDDEN_NAME) return json({ ok: true });
      const report = await readReport(store, body.id, row.name);
      const by = (await publicId(reporter));
      if (!report.by.includes(by)) report.by.push(by);
      report.at = now;
      await store.set(`reports/${body.id}`, JSON.stringify(report));
      if (report.by.length >= REPORTS_TO_HIDE && !report.allowed) await hide(store, body.id, row.name, now);
      return json({ ok: true });
    }

    // A player leaves the leaderboards: everything stored about them is deleted (Apple asks
    // apps where a player can make an account to let them delete it, Guideline 5.1.1(v)). Only
    // the device knows its id, so only the player can do this. The next rebuild takes them off.
    if (request.method === "POST" && path === "/leave") {
      const body = await request.json();
      if (!validId(body?.deviceId)) return json({ error: "bad request" }, 400);
      const key = await playerKey(body.deviceId);
      const id = await publicId(key);
      await store.delete(key);
      await store.delete(`reports/${id}`);
      await store.delete(`hidden/${id}`);
      await store.set(`${MARK}${key.slice("players/".length)}`, String(now));
      return json({ ok: true });
    }

    if (path.startsWith("/admin/")) {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      if (!options.adminToken || token !== options.adminToken) return json({ error: "not found" }, 404);
      // Every reported or hidden name, the latest report first
      if (request.method === "GET" && path === "/admin/reports") {
        const list: { id: string; name: string; reports: number; at: number; allowed: boolean; hidden: boolean }[] = [];
        const hidden = new Set((await store.list("hidden/")).map((k) => k.slice("hidden/".length)));
        await each(await store.list("reports/"), async (key) => {
          const r: Report | null = JSON.parse((await store.get(key)) ?? "null");
          const id = key.slice("reports/".length);
          if (r) list.push({ id, name: r.name, reports: r.by.length, at: r.at, allowed: !!r.allowed, hidden: hidden.has(id) });
        });
        return json(list.sort((a, b) => b.at - a.at));
      }
      if (request.method === "POST" && (path === "/admin/hide" || path === "/admin/show")) {
        const body = await request.json();
        if (!validPublicId(body?.id)) return json({ error: "bad request" }, 400);
        const row = (await readBoard(store, "overall", now)).rows.find((r) => r.id === body.id);
        const report = await readReport(store, body.id, row?.name ?? "");
        if (path === "/admin/hide") {
          // (the name as the player has it now; a hidden name shows as Player, so the report's)
          const name = row && row.name !== HIDDEN_NAME ? row.name : report.name;
          if (!name) return json({ error: "no such player" }, 404);
          await hide(store, body.id, name, now);
        } else {
          // Shown again, and from now on not hidden by reports (until the player picks another name)
          await store.delete(`hidden/${body.id}`);
          await store.set(`reports/${body.id}`, JSON.stringify({ ...report, allowed: true }));
          await store.set(MODERATION_MARK, String(now));
        }
        return json({ ok: true });
      }
    }

    return json({ error: "not found" }, 404);
  } catch {
    return json({ error: "bad request" }, 400);
  }
}

// The reports on a name (by: the reporters' public ids). A new name starts with none.
interface Report {
  name: string;
  by: string[];
  at: number;
  allowed?: boolean; // shown again by you (admin/show): reports don't hide it
}

async function readReport(store: KeyValueStore, id: string, name: string): Promise<Report> {
  const r: Report | null = JSON.parse((await store.get(`reports/${id}`)) ?? "null");
  return r && (r.name === name || !name) ? r : { name, by: [], at: 0 };
}

async function hide(store: KeyValueStore, id: string, name: string, now: number) {
  await store.set(`hidden/${id}`, JSON.stringify({ name, at: now }));
  await store.set(MODERATION_MARK, String(now)); // (the next rebuild shows it as Player)
}
