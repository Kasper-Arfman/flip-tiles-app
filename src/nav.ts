// Moving between screens. Each screen has its own address after the # in the URL:
//   #/                  home: the tiers
//   #/how-to-play       the rules
//   #/shop              the shop: skins for coins
//   #/codex             the Codex: one entry per completed stage
//   #/tier/4            the levels of difficulty 4
//   #/level/4/7         level 7 of difficulty 4
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
  | { screen: "tier"; difficulty: number }
  | { screen: "level"; difficulty: number; number: number };

export function currentRoute(): Route {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  if (parts[0] === "how-to-play") return { screen: "how-to-play" };
  if (parts[0] === "shop") return { screen: "shop" };
  if (parts[0] === "codex") return { screen: "codex" };
  if (parts[0] === "tier" && a) return { screen: "tier", difficulty: a };
  if (parts[0] === "level" && a && b) return { screen: "level", difficulty: a, number: b };
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

export function goUp(parent: string) {
  if (visited.length > 1 && visited[visited.length - 2] === parent) history.back();
  else go(parent, true);
}
