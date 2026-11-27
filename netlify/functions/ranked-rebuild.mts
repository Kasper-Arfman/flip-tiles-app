// The leaderboards worked out, every minute (a Netlify scheduled function: it runs on the live
// site only, and costs nothing when no one played). See rebuild in netlify/leaderboard.ts.
import type { Config } from "@netlify/functions";
import { blobStore } from "../blobStore";
import { rebuild } from "../leaderboard";

export default async () => {
  const result = await rebuild(blobStore("ranked"));
  if (result.changed || result.full) console.log("leaderboards rebuilt", result);
};

export const config: Config = {
  schedule: "* * * * *",
};
