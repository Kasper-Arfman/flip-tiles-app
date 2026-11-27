// Moving between screens. Each screen has its own address after the # in the URL:
//   #/                  home: the tiers
//   #/how-to-play       the rules
//   #/shop              the shop: skins for coins
//   #/codex             the Codex: one entry per completed stage
//   #/debug             the debug screen (tap the version on the home screen 5 times)
//   #/ranked            ranked mode: the lobby; #/ranked/play a game; #/ranked/leaderboard
//   #/tier/4            the levels of the tier with id 4 (a stage: its difficulty; a bonus
//                       stage: 100 + its difficulty, see Tier.id)
//   #/level/4/7         level 7 of tier 4
//   #/final             the final puzzle (7x7): its two stars; #/final/moves, #/final/flips a try
// Going to a screen adds it to the browser's history, so the back button (in the browser, and
// Android's back button in the app) goes back a screen. On the first screen, Android's back
// button closes the app.
//
// The back arrow in a screen's top bar goes *up* (from a level to its tier, from a tier to home).
// When the screen above is the one we came from, that is the same as going back in the history;
// otherwise (after a reload, or after Next level) the current entry is replaced, so the history
// doesn't grow a loop.

export type Route =
  | { screen: "home" }
  | { screen: "how-to-play" }
  | { screen: "shop" }
  | { screen: "codex" }
  | { screen: "debug" }
  | { screen: "ranked" }
  | { screen: "ranked-play" }
  | { screen: "ranked-leaderboard" }
  | { screen: "tier"; tier: number }
  | { screen: "level"; tier: number; number: number }
  | { screen: "final" }
  | { screen: "final-play"; goal: "solve" | "flips" | "moves" };

export function currentRoute(): Route {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  if (parts[0] === "how-to-play") return { screen: "how-to-play" };
  if (parts[0] === "shop") return { screen: "shop" };
  if (parts[0] === "codex") return { screen: "codex" };
  if (parts[0] === "debug") return { screen: "debug" };
  if (parts[0] === "ranked" && parts[1] === "play") return { screen: "ranked-play" };
  if (parts[0] === "ranked" && parts[1] === "leaderboard") return { screen: "ranked-leaderboard" };
  if (parts[0] === "ranked") return { screen: "ranked" };
  if (parts[0] === "final" && (parts[1] === "solve" || parts[1] === "flips" || parts[1] === "moves")) return { screen: "final-play", goal: parts[1] };
  if (parts[0] === "final") return { screen: "final" };
  if (parts[0] === "tier" && a) return { screen: "tier", tier: a };
  if (parts[0] === "level" && a && b) return { screen: "level", tier: a, number: b };
  return { screen: "home" };
}

const hashNow = () => location.hash || "#/";
const visited = [hashNow()]; // our own copy of the history, to know where back goes
let replacing = false;

export function onNavigate(render: () => void) {
  window.addEventListener("hashchange", () => {
    const hash = hashNow();
    if (replacing) visited[visited.length - 1] = hash;
    else if (visited.length > 1 && visited[visited.length - 2] === hash) visited.pop();
    else visited.push(hash);
    replacing = false;
    render();
  });
}

// To another screen; replace = instead of the current one in the history
export function go(hash: string, replace = false) {
  if (hash === hashNow()) return;
  if (!replace) {
    location.hash = hash;
    return;
  }
  replacing = true;
  location.replace(hash);
}

// The screen before this one in the history (undefined on the first screen)
export const previousHash = (): string | undefined => visited[visited.length - 2];

export function goUp(parent: string) {
  if (visited.length > 1 && visited[visited.length - 2] === parent) history.back();
  else go(parent, true);
}
