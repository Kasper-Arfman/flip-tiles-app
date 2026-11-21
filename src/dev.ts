// Switches for building and testing the game. Both must be false in a version for players:
// `npm run release-check` (part of `npm run release`) refuses to go on otherwise.

// While building the game: true shows what players must not see yet: in the shop, the skins and
// shapes not found yet, in their look and with their names (a player sees a gray card with a
// question mark).
export const DEV_MODE = false;

// A test version (for yourself and testers): the shop's coin pack is free and shown everywhere,
// also in the browser (it gives its coins at once, without the store), and the debug screen
// (tap the version at the bottom of the home screen 5 times) has test tools: add coins, load a
// save. Set it to false when the purchases in the stores have been tested, for the release.
export const TEST_BUILD = false;
