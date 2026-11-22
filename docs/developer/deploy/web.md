# Deploying: the web version and the leaderboards (Netlify)

Back to [the developer guide](../../index.md).

## Ranked mode: putting the leaderboards online

Ranked mode plays fully offline; only the online leaderboards need the server, a **Netlify
Function** (`netlify/functions/ranked.mts`, logic in `netlify/leaderboard.ts`) that keeps its data
in **Netlify Blobs**, Netlify's own storage. No database or other account is needed.

A function can't go online by dragging `dist/` onto Netlify Drop: the site must be deployed with
the Netlify command line (or from git). Once:

1. `npx netlify login` (opens the browser), then `npx netlify link` and pick your existing site.
2. `npx netlify deploy --prod`: builds the game (`netlify.toml` says how) and puts the site and the
   function online. Use this for every update from now on, instead of Drop.
3. In `src/ranked/online.ts`, set `SERVER_URL` to the site's address
   (`https://<your site>.netlify.app`): the apps send their games there (the web version uses its
   own address). `npm run release-check` refuses a release until this is set.
4. Check it: open `https://<your site>.netlify.app/api/ranked/leaderboard?board=overall` in a
   browser. It should answer `{"board":"overall","entries":[],...}`.

Netlify's free plan includes functions and Blobs; a small game stays far inside its limits. The
leaderboards are worked out from all players' data at most every 30 seconds; with many thousands
of players that would need a smarter store (the function is written so the storage can be
swapped: `KeyValueStore`).

## Updating the game without players losing progress

A player's progress lives on their phone (see *Saving* below), and an update only replaces the
app's files, so the progress itself survives every update. What can still make it *look* lost is
the new version no longer recognising it. Rules to keep:

1. **Never replace released levels.** Stars, hints and replays are saved by the level's board.
   A level that disappears takes them along. `npm run curate` now keeps every level that is in
   `levels.json` and prints any it had to leave out; read that line before you release.
   (`--fresh` throws them all away: only before a first release.)
2. **Locked or open is never saved.** It is worked out every time from the stars on the levels
   in the game now, in the stages above (or the group before); only coin purchases are saved.
   So stars on levels that left the game, or stars further on, never open anything.
3. **Old saved data is converted.** The wallet has a `version`; when the format changes, raise
   `WALLET_VERSION` in `progress.ts` and convert the old data in `migrate`.
4. **Keep the address.** Storage belongs to the site's address: friends must keep using the same
   `something.netlify.app` (update it from the site's *Deploys* page, never with a new drop).
5. Test an update the way a friend gets it: play the *old* build, then load the new one in the
   same browser, and check the stars are still there.

**Release check.** Before handing out a new version, the whole game was played through on the
built app (`npm run preview`), as a phone with touch (taps, and holds to force), in Chrome's
engine and in WebKit (Safari's engine), and the browser was closed and opened again to check
that stars, coins, skin, hints, replays and the first-time rules were all still there.
