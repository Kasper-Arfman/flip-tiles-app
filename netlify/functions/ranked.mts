// The online leaderboards, as a Netlify Function at /api/ranked/... (see netlify/leaderboard.ts
// for what it does). Its data is kept in Netlify Blobs, the site's own key-value storage: no
// database or account elsewhere is needed. It goes online with the site: `npx netlify deploy`
// (see README, "Ranked mode").
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { handle, type KeyValueStore } from "../leaderboard";

// The live site keeps the real leaderboards. A test deploy (`npx netlify deploy` without --prod)
// gets its own store, so test games never reach them: Netlify gives every such deploy an address
// with "--" in it (<id>--fliptilespuzzle.netlify.app), the live site's address has none.
export const storeName = (url: string) => (new URL(url).hostname.includes("--") ? "ranked-test" : "ranked");

export default async (request: Request) => {
  // Strong: a read always sees the last write. (By default Netlify Blobs may answer with a copy
  // up to a minute old: two games sent soon after each other then both started from the same
  // old player, and the second save threw away the first game.)
  const blobs = getStore({ name: storeName(request.url), consistency: "strong" });
  const store: KeyValueStore = {
    get: (key) => blobs.get(key, { type: "text" }),
    set: async (key, value) => void (await blobs.set(key, value)),
    delete: (key) => blobs.delete(key),
    list: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
  return handle(request, store);
};

export const config: Config = {
  path: "/api/ranked/*",
};
