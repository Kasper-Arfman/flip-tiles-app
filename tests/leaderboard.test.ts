// The online leaderboards' server (netlify/leaderboard.ts), with a Map as its storage: what
// it accepts, how it ranks, and that a device id never leaks.
import { beforeEach, describe, expect, it } from "vitest";
import { cleanName, forgetCache, handle, type KeyValueStore } from "../netlify/leaderboard";
import { solveFlips } from "../src/game/flipTiles";
import { fewestForcesSolution, makePuzzle, type RankedMode } from "../src/ranked/puzzles";
import { FORCE, MIN_GAMES, TIME_LIMIT, type GameRecord } from "../src/ranked/rules";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
}

const URL_BASE = "https://example.netlify.app/api/ranked";
const post = (store: KeyValueStore, body: unknown) =>
  handle(new Request(`${URL_BASE}/games`, { method: "POST", body: JSON.stringify(body) }), store).then((r) => r.json());
const board = (store: KeyValueStore, id: string, deviceId?: string) =>
  handle(new Request(`${URL_BASE}/leaderboard?board=${id}${deviceId ? `&deviceId=${deviceId}` : ""}`), store).then((r) => r.json());

let counter = 0;
// A real game: a fresh puzzle, won in `time` with its best solution, or lost
function game(mode: RankedMode, difficulty: number, time: number, won = true): GameRecord {
  const p = makePuzzle(mode, difficulty);
  let moves: number[] = [];
  if (won) {
    if (mode === "flips") moves = solveFlips(p.board)!;
    else {
      const s = fewestForcesSolution(p.board, difficulty)!;
      moves = [...s.forces.map((k) => k + FORCE), ...s.flips];
    }
  }
  return { id: `game-${++counter}-xyz`, mode, difficulty, board: p.board, moves, time: won ? time : TIME_LIMIT, won, playedAt: Date.now() };
}

const games = (n: number, mode: RankedMode, d: number, time: number) => Array.from({ length: n }, () => game(mode, d, time));

describe("the leaderboard server", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
    forgetCache();
  });

  it("keeps real games once, and refuses made-up ones", async () => {
    const real = game("moves", 3, 20_000);
    const fake = { ...game("moves", 3, 20_000), moves: [] }; // (a "win" without a solve)
    const result = await post(store, { deviceId: "device-aaaa", name: "Ann", games: [real, fake] });
    expect(result.accepted).toEqual([real.id]);
    expect(result.rejected).toEqual([{ id: fake.id, reason: "not a solve by the rules" }]);
    const again = await post(store, { deviceId: "device-aaaa", name: "Ann", games: [real] });
    expect(again.accepted).toEqual([real.id]);
    const stored = JSON.parse([...store.data.values()][0]);
    expect(stored.games.length).toBe(1);
  });

  it("ranks by average time once a player has enough games; same names are fine", async () => {
    await post(store, { deviceId: "device-slow", name: "Sam", games: games(MIN_GAMES, "moves", 3, 90_000) });
    await post(store, { deviceId: "device-fast", name: "Sam", games: games(MIN_GAMES, "moves", 3, 30_000) });
    await post(store, { deviceId: "device-new1", name: "Newbie", games: games(MIN_GAMES - 1, "moves", 3, 10_000) });
    const lb = await board(store, "moves-3", "device-slow");
    expect(lb.entries.map((e: { name: string; value: number }) => [e.name, e.value])).toEqual([["Sam", 30_000], ["Sam", 90_000]]);
    expect(lb.entries[1].me).toBe(true);
    expect(lb.me.rank).toBe(2);
    expect(lb.players).toBe(2);
  });

  it("a loss counts as 5:00 in the average", async () => {
    const list = [...games(MIN_GAMES - 1, "flips", 4, 60_000), game("flips", 4, 0, false)];
    await post(store, { deviceId: "device-loss", name: "Lou", games: list });
    const lb = await board(store, "flips-4");
    expect(lb.entries[0].value).toBe(((MIN_GAMES - 1) * 60_000 + TIME_LIMIT) / MIN_GAMES);
  });

  it("the overall leaderboard adds up the boards: harder and faster ranks higher", async () => {
    await post(store, { deviceId: "device-easy", name: "Easy", games: games(MIN_GAMES, "moves", 2, 10_000) });
    await post(store, { deviceId: "device-hard", name: "Hard", games: games(MIN_GAMES, "flips", 8, 60_000) });
    const lb = await board(store, "overall");
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(["Hard", "Easy"]);
  });

  it("never shows a device id, and forgets a player who leaves", async () => {
    await post(store, { deviceId: "secret-device-id", name: "Zed", games: games(MIN_GAMES, "moves", 2, 10_000) });
    const response = await handle(new Request(`${URL_BASE}/leaderboard?board=moves-2`), store);
    expect(await response.clone().text()).not.toContain("secret-device-id");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect([...store.data.keys()].join()).not.toContain("secret-device-id");
    await handle(new Request(`${URL_BASE}/player`, { method: "DELETE", body: JSON.stringify({ deviceId: "secret-device-id" }) }), store);
    expect(store.data.size).toBe(0);
    expect((await board(store, "moves-2")).entries).toEqual([]);
  });

  it("refuses bad requests", async () => {
    expect((await handle(new Request(`${URL_BASE}/leaderboard?board=moves-99`), store)).status).toBe(404);
    expect((await handle(new Request(`${URL_BASE}/games`, { method: "POST", body: "nonsense" }), store)).status).toBe(400);
    expect((await handle(new Request(`${URL_BASE}/games`, { method: "POST", body: JSON.stringify({ deviceId: "x", games: [] }) }), store)).status).toBe(400);
    expect(cleanName("  <b>Ann</b>\u0000 ")).toBe("bAnn/b");
    expect(cleanName("")).toBe("Player");
  });
});
