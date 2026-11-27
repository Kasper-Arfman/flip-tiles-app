// The online leaderboards, as a Netlify Function at /api/ranked/... (see netlify/leaderboard.ts
// for what it does, and docs/developer/leaderboards.md). It goes online with the site (see
// docs/developer/deploy/web.md).
import type { Config } from "@netlify/functions";
import { blobStore, storeName } from "../blobStore";
import { handle } from "../leaderboard";

// (Netlify runs functions on Node; this project has no Node types for the app's own code)
declare const process: { env: Record<string, string | undefined> };

export default async (request: Request) => {
  const name = storeName(request.url);
  return handle(request, blobStore(name), Date.now(), {
    // No schedule runs on the local test server (`npm run serve`) or a test deploy: there the
    // leaderboards are worked out on each request
    rebuildOnRead: name === "ranked-test" || process.env.NETLIFY_DEV === "true",
    adminToken: process.env.RANKED_ADMIN_TOKEN || undefined,
  });
};

export const config: Config = {
  path: "/api/ranked/*",
};
