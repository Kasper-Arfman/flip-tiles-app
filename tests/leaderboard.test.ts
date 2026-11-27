// The online leaderboards' server (netlify/leaderboard.ts), with a Map as its storage: what
// it accepts, how it ranks, and that a device id never leaks.
import { beforeEach, describe, expect, it } from "vitest";
import { PETER_NAME, cleanName, forgetCache, handle, rebuild, type KeyValueStore } from "../netlify/leaderboard";
import { storeName } from "../netlify/blobStore";
import { solveFlips } from "../src/game/flipTiles";
import { fewestForcesSolution, makePuzzle, type RankedMode } from "../src/ranked/puzzles";
import { FORCE, SCORE_UPDATE_RATE, TIME_LIMIT, type GameRecord } from "../src/ranked/rules";

const MANY = 5; // games per player in most tests

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
// (worked out on each read, as on the local test server: the tests don't wait for the schedule)
const board = (store: KeyValueStore, id: string, deviceId?: string) =>
  handle(new Request(`${URL_BASE}/leaderboard?board=${id}${deviceId ? `&deviceId=${deviceId}` : ""}`), store, Date.now(), { rebuildOnRead: true })
    .then((r) => r.json());

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
    const real = game("moves", 4, 20_000);
    const fake = { ...game("moves", 4, 20_000), moves: [] }; // (a "win" without a solve)
    const result = await post(store, { deviceId: "device-aaaa", name: "Ann", games: [real, fake] });
    expect(result.accepted).toEqual([real.id]);
    expect(result.rejected).toEqual([{ id: fake.id, reason: "not a solve by the rules" }]);
    const again = await post(store, { deviceId: "device-aaaa", name: "Ann", games: [real] });
    expect(again.accepted).toEqual([real.id]);
    const stored = JSON.parse([...store.data.values()][0]);
    expect(stored.games.length).toBe(1);
  });

  it("shows a player once, even with stray copies in the storage (the local test server's)", async () => {
    await post(store, { deviceId: "device-once", name: "Una", games: games(2, "flips", 4, 20_000) });
    const [key, value] = [...store.data.entries()][0];
    store.data.set("players/.fs22mc69v2n", value); // (a half-written copy, as on Windows)
    forgetCache();
    const lb = await board(store, "flips-4");
    expect(key).toMatch(/^players\/[0-9a-f]{64}$/);
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(["Una", PETER_NAME]);
  });

  it("ranks by score from the first game; one great game doesn't beat many good ones; same names are fine", async () => {
    await post(store, { deviceId: "device-slow", name: "Sam", games: games(20, "moves", 4, 90_000) });
    await post(store, { deviceId: "device-fast", name: "Sam", games: games(20, "moves", 4, 30_000) });
    await post(store, { deviceId: "device-new1", name: "Newbie", games: games(1, "moves", 4, 10_000) });
    const lb = await board(store, "moves-4", "device-slow");
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(["Sam", "Sam", "Newbie", PETER_NAME]);
    expect(lb.entries[1].me).toBe(true);
    expect(lb.me.rank).toBe(2);
    expect(lb.players).toBe(4);
  });

  it("gives a page of a leaderboard: offset and limit, with the right places", async () => {
    await post(store, { deviceId: "device-slow", name: "Sam", games: games(3, "moves", 4, 90_000) });
    await post(store, { deviceId: "device-fast", name: "Ann", games: games(3, "moves", 4, 30_000) });
    await post(store, { deviceId: "device-mid1", name: "Bo", games: games(3, "moves", 4, 60_000) });
    const page = await handle(new Request(`${URL_BASE}/leaderboard?board=moves-4&offset=1&limit=2&deviceId=device-fast`), store)
      .then((r) => r.json());
    expect(page.entries.map((e: { rank: number; name: string }) => [e.rank, e.name])).toEqual([[2, "Bo"], [3, "Sam"]]);
    expect(page.me).toMatchObject({ rank: 1, name: "Ann" }); // (your place, also when not on the page)
    expect(page.players).toBe(4);
    // (nonsense is cut to what makes sense; without them: the top 100)
    const odd = await handle(new Request(`${URL_BASE}/leaderboard?board=moves-4&offset=-5&limit=9999`), store).then((r) => r.json());
    expect(odd.entries).toHaveLength(4);
  });

  it("the score starts at 5:00 and moves 1/10 towards each game; a loss (at this score) counts as 5:00", async () => {
    // (in the order played: the times as sent)
    const list = [game("flips", 4, 60_000), game("flips", 4, 0, false), game("flips", 4, 120_000)];
    list.forEach((g, i) => (g.playedAt = Date.now() - 1000 * (3 - i)));
    await post(store, { deviceId: "device-loss", name: "Lou", games: list });
    let expected = TIME_LIMIT;
    for (const t of [60_000, TIME_LIMIT, 120_000]) expected = (1 - SCORE_UPDATE_RATE) * expected + SCORE_UPDATE_RATE * t;
    expect((await board(store, "flips-4")).entries[0].value).toBeCloseTo(expected, 6);
  });

  it("overall: more leaderboards first, then the average place, then the average score", async () => {
    // moves-4: Ann 1st, Bob 2nd, Cy 3rd. flips-5: Ann 1st, Cy 2nd. moves-5: only Cy, 1st.
    await post(store, { deviceId: "device-ann", name: "Ann", games: [...games(MANY, "moves", 4, 20_000), ...games(MANY, "flips", 5, 50_000)] });
    await post(store, { deviceId: "device-bob", name: "Bob", games: games(MANY, "moves", 4, 30_000) });
    await post(store, { deviceId: "device-cy", name: "Cy", games: [...games(MANY, "moves", 4, 40_000), ...games(MANY, "flips", 5, 60_000), ...games(MANY, "moves", 5, 90_000)] });
    const lb = await board(store, "overall", "device-cy");
    // Cy is on 3 leaderboards (average place 2), Ann on 2 (1), Bob on 1 (2): Cy, Ann, Bob
    expect(lb.entries.map((e: { name: string; value: number }) => [e.name, e.value])).toEqual([["Cy", 2], ["Ann", 1], ["Bob", 2], [PETER_NAME, 3]]);
    expect(lb.me).toMatchObject({ rank: 1, name: "Cy" });
  });

  it("overall: the best on one leaderboard ranks below someone who plays many", async () => {
    // Ace: the fastest on moves-4 only. Allround: slower there, but also on 5 more leaderboards
    await post(store, { deviceId: "device-ace", name: "Ace", games: games(MANY, "moves", 4, 5_000) });
    await post(store, { deviceId: "device-all", name: "Allround", games: [
      ...games(2, "moves", 4, 200_000), // (6 leaderboards: moves-4, and flips 4 to 8)
      ...[4, 5, 6, 7, 8].flatMap((d) => games(2, "flips", d, 200_000)),
    ] });
    const lb = await board(store, "overall");
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(["Allround", "Ace", PETER_NAME]);
  });

  it("overall: a tie on average place goes to the lowest average score", async () => {
    await post(store, { deviceId: "device-slow", name: "Slow", games: [...games(MANY, "moves", 4, 20_000), ...games(MANY, "flips", 5, 90_000)] });
    await post(store, { deviceId: "device-quick", name: "Quick", games: [...games(MANY, "moves", 4, 30_000), ...games(MANY, "flips", 5, 50_000)] });
    // Both 1.5 on average; Quick's average score (games of 30 and 50 s) beats Slow's (20 and 90 s)
    const lb = await board(store, "overall");
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(["Quick", "Slow", PETER_NAME]);
  });

  it("a player who leaves is deleted: their data, and from the leaderboards", async () => {
    await post(store, { deviceId: "device-leaver", name: "Lea", games: games(MANY, "moves", 4, 10_000) });
    await post(store, { deviceId: "device-stayer", name: "Sam", games: games(MANY, "moves", 4, 12_000) });
    expect((await board(store, "moves-4")).entries.length).toBe(3);
    const leave = (deviceId: string) =>
      handle(new Request(`${URL_BASE}/leave`, { method: "POST", body: JSON.stringify({ deviceId }) }), store);
    expect((await leave("device-leaver")).status).toBe(200);
    await rebuild(store);
    const names = (await board(store, "moves-4")).entries.map((e: { name: string }) => e.name);
    expect(names).toEqual(["Sam", PETER_NAME]);
    expect([...store.data.values()].join()).not.toContain("Lea");
    expect((await leave("x")).status).toBe(400); // (not a device id)
  });

  it("never shows a device id; no one else can remove a player", async () => {
    await post(store, { deviceId: "secret-device-id", name: "Zed", games: games(MANY, "moves", 4, 10_000) });
    const response = await handle(new Request(`${URL_BASE}/leaderboard?board=moves-4`), store);
    expect(await response.clone().text()).not.toContain("secret-device-id");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect([...store.data.keys()].join()).not.toContain("secret-device-id");
    const remove = await handle(new Request(`${URL_BASE}/player`, { method: "DELETE", body: JSON.stringify({ deviceId: "secret-device-id" }) }), store);
    expect(remove.status).toBe(404);
    expect((await board(store, "moves-4")).entries.length).toBe(2); // (Zed and Peter)
  });

  it("test deploys (an address with --) keep their games apart from the live site's", () => {
    expect(storeName("https://fliptilespuzzle.netlify.app/api/ranked/games")).toBe("ranked");
    expect(storeName("https://6738a1b2c3--fliptilespuzzle.netlify.app/api/ranked/games")).toBe("ranked-test");
    expect(storeName("https://deploy-preview-3--fliptilespuzzle.netlify.app/api/ranked/games")).toBe("ranked-test");
  });

  it("Peter Pathetic is on every leaderboard, last, with the worst score; below even a player who only lost", async () => {
    for (const id of ["overall", "moves-4", "flips-12"]) {
      const lb = await board(store, id);
      expect(lb.entries).toEqual([{ rank: 1, id: "0000000000000000", name: PETER_NAME, value: id === "overall" ? 1 : TIME_LIMIT, games: 0, me: false }]);
    }
    await post(store, { deviceId: "device-loser", name: "Lou", games: [game("moves", 4, 0, false)] });
    expect((await board(store, "moves-4")).entries.map((e: { name: string }) => e.name)).toEqual(["Lou", PETER_NAME]);
  });

  it("shows the score the player's app reports, on leaderboards where it has their games", async () => {
    await post(store, { deviceId: "device-own", name: "Own", games: games(3, "moves", 4, 60_000), scores: { "moves-4": 204_000 } });
    expect((await board(store, "moves-4")).entries[0]).toMatchObject({ name: "Own", value: 204_000, games: 3 });
    // A later send with only scores (no new games) updates it
    await post(store, { deviceId: "device-own", name: "Own", games: [], scores: { "moves-4": 199_000 } });
    forgetCache();
    expect((await board(store, "moves-4")).entries[0].value).toBe(199_000);
  });

  it("shows the number of games the player's app reports (games lost on the way don't count)", async () => {
    await post(store, { deviceId: "device-count", name: "Count", games: games(3, "moves", 4, 60_000), counts: { "moves-4": 99 } });
    expect((await board(store, "moves-4")).entries[0]).toMatchObject({ name: "Count", games: 99 });
    // Not a whole number above 0, or a leaderboard without their games: ignored
    await post(store, { deviceId: "device-count", name: "Count", games: [], counts: { "moves-4": -1, "flips-9": 5 } });
    forgetCache();
    expect((await board(store, "moves-4")).entries[0].games).toBe(99);
    expect((await board(store, "flips-9")).entries.map((e: { name: string }) => e.name)).toEqual([PETER_NAME]);
  });

  it("ignores a reported score without games there, or that isn't a time from 0:00 to 5:00", async () => {
    await post(store, { deviceId: "device-odd", name: "Odd", games: games(2, "moves", 4, 60_000),
      scores: { "flips-9": 1_000, "moves-4": -5, "nonsense": 7 } });
    const own = (await board(store, "moves-4")).entries[0];
    expect(own.name).toBe("Odd");
    expect(own.value).toBeGreaterThan(0); // (worked out from the games: the -5 is ignored)
    expect((await board(store, "flips-9")).entries.map((e: { name: string }) => e.name)).toEqual([PETER_NAME]);
  });

  it("says when the leaderboards were last worked out", async () => {
    const lb = await board(store, "moves-4");
    expect(typeof lb.updated).toBe("number");
    expect(Math.abs(lb.updated - Date.now())).toBeLessThan(60_000);
  });

  it("refuses bad requests", async () => {
    expect((await handle(new Request(`${URL_BASE}/leaderboard?board=moves-99`), store)).status).toBe(404);
    expect((await handle(new Request(`${URL_BASE}/games`, { method: "POST", body: "nonsense" }), store)).status).toBe(400);
    expect((await handle(new Request(`${URL_BASE}/games`, { method: "POST", body: JSON.stringify({ deviceId: "x", games: [] }) }), store)).status).toBe(400);
    expect(cleanName("  <b>Ann</b>\u0000 ")).toBe("bAnn/b");
    expect(cleanName("")).toBe("Player");
  });
});
