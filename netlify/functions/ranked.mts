// The online leaderboards, as a Netlify Function at /api/ranked/... (see netlify/leaderboard.ts
// for what it does). Its data is kept in Netlify Blobs, the site's own key-value storage: no
// database or account elsewhere is needed. It goes online with the site: `npx netlify deploy`
// (see README, "Ranked mode").
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { handle, type KeyValueStore } from "../leaderboard";

export default async (request: Request) => {
  const blobs = getStore("ranked");
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
