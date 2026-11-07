// What the player has, saved on the device with Capacitor's Preferences plugin: stars, coins,
// the difficulties opened with coins, the skins bought, the hints bought, and the recorded
// solves of each level (to replay them). In the app it is stored natively (Android SharedPreferences, iOS UserDefaults),
// which the system doesn't clear like a web page's storage; in the browser the plugin falls
// back to localStorage.
//
// A level's stars and hints are kept by its board's standard form (level.key, see levels.ts),
// not its id or number, so they stay with the level when the curation script is run again: when
// the levels move around, or are shown turned, mirrored or with swapped colors. Its recorded
// solves are moves on the board as shown, so they are kept by the board itself.
import { Preferences } from "@capacitor/preferences";
import type { Move } from "./game/flipTiles";
import { TIERS, type Level, type Tier } from "./levels/levels";
import { DEFAULT_SKIN } from "./skins";

export const STAR_SOLVED = 1; // solved, in any number of moves
export const STAR_FLIPS = 2; // flips only, in the fewest flips
export const STAR_MOVES = 4; // the fewest moves
export const STARS = [STAR_SOLVED, STAR_FLIPS, STAR_MOVES];
export const ALL_STARS = STAR_SOLVED | STAR_FLIPS | STAR_MOVES;

// A tier opens when this many stars are earned in the tier before it (or all of them, for a
// tier with fewer stars than this), or when it is bought with coins
export const UNLOCK_STARS = 30;

// Within a tier, a group of levels (a grade) opens when this many stars are earned in the group
// before it (or all of them, for a group with fewer stars than this)
export const UNLOCK_GRADE_STARS = 10;

// Coins
export const STARTING_COINS = 1000; // what a new player gets (generous, for testing)
export const UNLOCK_COST = 100; // to open a difficulty early
export const GRADE_UNLOCK_COST = 50; // to open the next group of levels in a difficulty early
export const HINT_COST = 1; // to show one more move of a solution
export const SKIN_COST = 50; // a skin in the shop

// The two solutions a level's hints show: "flips" (only flips, the second star) and "moves"
// (the fewest moves, the third star)
export type HintGoal = "flips" | "moves";

// What is saved, each under its own key
let stars: Record<string, number> = {}; // level key -> star bits
// The wallet: coins, the difficulties and groups of levels opened with coins (a group as
// "difficulty:grade"), the skins owned and the one in use
const NEW_WALLET = () => ({
  coins: STARTING_COINS, unlocked: [] as number[], grades: [] as string[], skins: [DEFAULT_SKIN], skin: DEFAULT_SKIN,
});
let wallet = NEW_WALLET();
let hints: Record<string, Partial<Record<HintGoal, number>>> = {}; // level key -> hints bought per goal
// board -> solves to replay, as moves (tile, + 32 for a force): the last ones that earned the
// flips star and the moves star
type Recorded = Partial<Record<ReplayKind, number[]>>;
let replays: Record<string, Recorded> = {};

// The player went through How to play (a new player must, before the first level)
let rulesSeen = false;

const KEYS = {
  stars: "progress-v1", wallet: "wallet-v1", hints: "hints-v1", replays: "replays-v1", rules: "rules-seen-v1",
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback; // unreadable: start afresh rather than not starting at all
  }
}

const write = (key: string, value: unknown) => void Preferences.set({ key, value: JSON.stringify(value) });

export async function loadProgress() {
  let saved: Partial<ReturnType<typeof NEW_WALLET>>;
  [stars, saved, hints, replays, rulesSeen] = await Promise.all([
    read(KEYS.stars, {}),
    read(KEYS.wallet, {}),
    read(KEYS.hints, {}),
    read(KEYS.replays, {}),
    read(KEYS.rules, false),
  ]);
  wallet = { ...NEW_WALLET(), ...saved }; // (a wallet saved before skins existed has none)
}

export async function resetProgress() {
  stars = {};
  wallet = NEW_WALLET();
  hints = {};
  replays = {};
  rulesSeen = false;
  await Promise.all(Object.values(KEYS).map((key) => Preferences.remove({ key })));
}

// --- how to play ----------------------------------------------------------------------------

// Has the player been through How to play? (A player who has stars has played already.)
export const hasSeenRules = () => rulesSeen || totalStars() > 0;

export function markRulesSeen() {
  rulesSeen = true;
  write(KEYS.rules, true);
}

// --- stars --------------------------------------------------------------------------------

export const starsOf = (level: Level) => stars[level.key] ?? 0;

export const countStars = (bits: number) => STARS.filter((s) => bits & s).length;

// Add the stars of one solve to the level's best; returns the ones that are new
export function award(level: Level, earned: number): number {
  const before = starsOf(level);
  const fresh = earned & ~before;
  if (fresh) {
    stars[level.key] = before | earned;
    write(KEYS.stars, stars);
  }
  return fresh;
}

export const tierStars = (tier: Tier) => tier.levels.reduce((n, l) => n + countStars(starsOf(l)), 0);
export const tierSolved = (tier: Tier) => tier.levels.filter((l) => starsOf(l) & STAR_SOLVED).length;
export const totalStars = () => TIERS.reduce((n, t) => n + tierStars(t), 0);

// The most stars a tier can give
export const maxStars = (tier: Tier) => 3 * tier.levels.length;

// --- coins and opening tiers ----------------------------------------------------------------

export const coins = () => wallet.coins;

function spend(amount: number): boolean {
  if (wallet.coins < amount) return false;
  wallet.coins -= amount;
  write(KEYS.wallet, wallet);
  return true;
}

// How many more stars must be earned in the tier before to open this one (0 = open)
export function starsToUnlock(tier: Tier): number {
  const i = TIERS.indexOf(tier);
  if (i <= 0 || wallet.unlocked.includes(tier.difficulty)) return 0;
  const before = TIERS[i - 1];
  return Math.max(0, Math.min(UNLOCK_STARS, maxStars(before)) - tierStars(before));
}

// How many more stars must be earned in the group before to open this group of a tier (0 = open)
export function starsToUnlockGrade(tier: Tier, grade: number): number {
  if (grade <= 0 || wallet.grades.includes(`${tier.difficulty}:${grade}`)) return 0;
  const before = tier.grades[grade - 1];
  const earned = before.reduce((n, l) => n + countStars(starsOf(l)), 0);
  return Math.max(0, Math.min(UNLOCK_GRADE_STARS, 3 * before.length) - earned);
}

// A locked group that is next in line (the group before it is open) can be bought with coins
export const canBuyGrade = (tier: Tier, grade: number) =>
  grade > 0 && starsToUnlockGrade(tier, grade) > 0 && starsToUnlockGrade(tier, grade - 1) === 0;

// Open the next group of levels with coins; false when it isn't next in line or coins are short
export function buyGrade(tier: Tier, grade: number): boolean {
  if (!canBuyGrade(tier, grade) || !spend(GRADE_UNLOCK_COST)) return false;
  wallet.grades.push(`${tier.difficulty}:${grade}`);
  write(KEYS.wallet, wallet);
  return true;
}

// A level can be played: its tier and its group are open
export const isLevelOpen = (tier: Tier, level: Level) =>
  starsToUnlock(tier) === 0 && starsToUnlockGrade(tier, level.grade) === 0;

// Open a tier with coins; false when there aren't enough
export function buyTier(tier: Tier): boolean {
  if (!spend(UNLOCK_COST)) return false;
  wallet.unlocked.push(tier.difficulty);
  write(KEYS.wallet, wallet);
  return true;
}

// --- skins ----------------------------------------------------------------------------------

export const ownsSkin = (id: string) => wallet.skins.includes(id);
export const activeSkin = () => wallet.skin;

// Buy a skin; false when there aren't enough coins
export function buySkin(id: string): boolean {
  if (ownsSkin(id)) return true;
  if (!spend(SKIN_COST)) return false;
  wallet.skins.push(id);
  write(KEYS.wallet, wallet);
  return true;
}

export function useSkin(id: string) {
  if (!ownsSkin(id)) return;
  wallet.skin = id;
  write(KEYS.wallet, wallet);
}

// --- hints ----------------------------------------------------------------------------------

// The moves of a goal's solution, in the order the hints show them (forces first)
export function solutionFor(level: Level, goal: HintGoal): Move[] {
  if (goal === "flips") return level.solutionFlips.map((tile) => ({ kind: "flip", tile }));
  return [
    ...level.solutionMoves.forces.map((tile): Move => ({ kind: "force", tile })),
    ...level.solutionMoves.flips.map((tile): Move => ({ kind: "flip", tile })),
  ];
}

export const hintsBought = (level: Level, goal: HintGoal) => hints[level.key]?.[goal] ?? 0;

// Buy the next hint of a goal; false when there aren't enough coins or no hints left
export function buyHint(level: Level, goal: HintGoal): boolean {
  if (hintsBought(level, goal) >= solutionFor(level, goal).length || !spend(HINT_COST)) return false;
  hints[level.key] = { ...hints[level.key], [goal]: hintsBought(level, goal) + 1 };
  write(KEYS.hints, hints);
  return true;
}

// --- replays --------------------------------------------------------------------------------

const encode = (m: Move) => m.tile + (m.kind === "force" ? 32 : 0);
const decode = (n: number): Move => ({ kind: n & 32 ? "force" : "flip", tile: n & 31 });

// The solves kept per level to watch back: the last ones that earned the flips star and the
// moves star. Other solves aren't kept.
export type ReplayKind = "flips" | "moves";
export const REPLAY_KINDS: ReplayKind[] = ["flips", "moves"];

// What is kept for a board. Earlier versions also kept other solves: the first one kept one as
// { moves, stars } (recognisable by its stars), a later one a "last" solve. Those are left out.
function recorded(board: string): Recorded {
  const saved = replays[board] ?? {};
  return "stars" in saved ? {} : { flips: saved.flips, moves: saved.moves };
}

// A level's recorded solves (none before it got the flips or the moves star)
export function recordedSolves(level: Level): Partial<Record<ReplayKind, Move[]>> {
  const saved = recorded(level.board);
  const solves: Partial<Record<ReplayKind, Move[]>> = {};
  for (const kind of REPLAY_KINDS) if (Array.isArray(saved[kind])) solves[kind] = saved[kind]!.map(decode);
  return solves;
}

export const hasRecordedSolves = (level: Level) => Object.keys(recordedSolves(level)).length > 0;

// Keep a solve that earned the flips or the moves star, as that star's solve
export function recordSolve(level: Level, moves: Move[], earned: number) {
  if (!(earned & (STAR_FLIPS | STAR_MOVES))) return;
  const encoded = moves.map(encode);
  const kept: Recorded = recorded(level.board);
  if (earned & STAR_FLIPS) kept.flips = encoded;
  if (earned & STAR_MOVES) kept.moves = encoded;
  replays[level.board] = kept;
  write(KEYS.replays, replays);
}
