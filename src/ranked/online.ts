// The online leaderboards (the server: netlify/leaderboard.ts). Only for a player who joined
// them (ranked.ts, join): then their name, their random device id and their ranked games are
// sent; nothing else, and nothing at all before joining.
//
// Offline is normal: games wait on the device (pendingGames) and are sent at the next chance
// (when the app starts, after each game, when the connection comes back).
import { Capacitor } from "@capacitor/core";
import { log } from "../log";
import type { Entry } from "../../netlify/leaderboard";
import { deviceId, hasJoined, markUploaded, myStats, pendingGames, playerName } from "./ranked";
import type { BoardId } from "./rules";

// Where the site is. On the web: the site the game came from. In the apps: this address, the
// Netlify site (set it before a release: npm run release-check reminds you).
export const SERVER_URL = "https://fliptilespuzzle.netlify.app";
// (While developing: the server at the page's own address, which is the local one under
// `npm run serve`, so tests never reach the live leaderboards; plain `npm run dev` has none.)
const api = (path: string) => `${Capacitor.isNativePlatform() ? SERVER_URL : "."}/api/ranked${path}`;

async function call(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(api(path), {
      ...init,
      signal: controller.signal,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

let sending: Promise<void> | null = null;

// Send the games the server doesn't have yet (one send at a time); quietly does nothing offline.
// `always`: also with no games waiting (to send a new name).
export function sendGames(always = false): Promise<void> {
  if (!hasJoined() || (!always && !pendingGames().length)) return sending ?? Promise.resolve();
  sending ??= (async () => {
    try {
      const games = pendingGames().slice(0, 200);
      const result = await call("/games", {
        method: "POST",
        // (with the scores shown in the game, which the leaderboards show too)
        body: JSON.stringify({ deviceId: deviceId(), name: playerName(), games, scores: myScores() }),
      });
      // (a refused game is never accepted later: it isn't sent again)
      markUploaded(result.accepted, result.rejected.map((r: { id: string }) => r.id));
      for (const r of result.rejected) log("warn", `Ranked: the server refused game ${r.id}: ${r.reason}`);
    } catch (error) {
      log("info", `Ranked: games not sent now (${String(error)}); later`);
    } finally {
      sending = null;
    }
  })();
  return sending;
}

export interface Leaderboard {
  board: BoardId;
  entries: Entry[];
  me: Entry | null;
  players: number;
  updated?: number; // when the server last worked the leaderboards out (ms since 1970)
}

// A leaderboard, or a page of it (`limit` entries from place offset + 1). Anyone can look; only a
// player who joined sends their id along (to be found in it).
export async function fetchLeaderboard(board: BoardId, page?: { offset: number; limit: number }): Promise<Leaderboard> {
  await sendGames(); // (so the player's own latest games count)
  const id = hasJoined() ? `&deviceId=${encodeURIComponent(deviceId())}` : "";
  const range = page ? `&offset=${page.offset}&limit=${page.limit}` : "";
  return call(`/leaderboard?board=${board}${id}${range}`);
}

// The name of the world's #1 on Top Ranked Players, for the home screen. Asked at most once a
// minute; the last one known is kept on the device, so it shows offline too. None while only
// Peter Pathetic is there (the made-up player: the only one with no games).
const TOP_KEY = "flip-tiles-top-player";
let topAsked = 0;

export function knownTopPlayer(): string | null {
  try {
    return localStorage.getItem(TOP_KEY);
  } catch {
    return null;
  }
}

export async function fetchTopPlayer(): Promise<string | null> {
  if (Date.now() - topAsked < 60_000) return knownTopPlayer();
  topAsked = Date.now();
  const { entries } = await fetchLeaderboard("overall");
  const top = entries[0]?.games > 0 ? entries[0].name : null;
  try {
    if (top) localStorage.setItem(TOP_KEY, top);
    else localStorage.removeItem(TOP_KEY);
  } catch {
    // (no storage: shown this time only)
  }
  return top;
}

// Send what is waiting, at the start and whenever the connection comes back
export function startSending() {
  void sendGames(true); // (always once: the scores, also with no new games)
  window.addEventListener("online", () => void sendGames());
}

// The scores shown in the game, per leaderboard (sent with the games)
const myScores = () =>
  Object.fromEntries(Object.entries(myStats()).map(([id, s]) => [id, Math.round(s!.score)]));
