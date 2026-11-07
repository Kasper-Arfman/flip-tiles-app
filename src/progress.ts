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
import { DEFAULT_SKIN, SHAPES, SKINS, SQUARE, type Look, type Shape, type Skin } from "./skins";

export const STAR_SOLVED = 1; // solved, in any number of moves
export const STAR_FLIPS = 2; // flips only, in the fewest flips
export const STAR_MOVES = 4; // the fewest moves
export const STARS = [STAR_SOLVED, STAR_FLIPS, STAR_MOVES];
export const ALL_STARS = STAR_SOLVED | STAR_FLIPS | STAR_MOVES;

// A tier opens when the player has earned enough stars in all (counted over every tier), or when
// it is bought with coins. Alpha is always open, Beta needs FIRST_UNLOCK_STARS, and each tier
// after that UNLOCK_STARS_STEP more: 5, 20, 35, 50, ...
export const FIRST_UNLOCK_STARS = 5;
export const UNLOCK_STARS_STEP = 15;

// The stars in all a tier needs to open (by its place in the list: 0 = Alpha)
export const unlockStars = (i: number) => (i <= 0 ? 0 : FIRST_UNLOCK_STARS + UNLOCK_STARS_STEP * (i - 1));

// Within a tier, a group of levels (a grade) opens when this many stars are earned in the group
// before it (or all of them, for a group with fewer stars than this)
export const UNLOCK_GRADE_STARS = 10;

// Coins
// The coins of the whole game: 100 to start + 50 for each of the 12 stages = 700, enough for
// the 25 skins to find (25 each), when nothing else is bought; not for the 12 shapes as well
// (another 300)
export const STARTING_COINS = 100; // what a new player gets
export const UNLOCK_COST = 100; // to open a difficulty early
export const GRADE_UNLOCK_COST = 50; // to open the next group of levels in a difficulty early
export const HINT_COST = 5; // to show one more move of a solution
export const SKIN_COST = 25; // a mystery box in the shop: a random new skin, or a new shape
export const BOX_BUNDLE = 10; // Open 10: ten boxes at once (ten different new ones)
export const BUNDLE_COST = BOX_BUNDLE * SKIN_COST; // (250: the same price per box)
// Everything at once, in the shop: every stage, group of levels, skin and shape. Bought one by
// one that is 11 stages x 100 + 25 skins and 12 shapes x 25 = 2,025 coins, plus the groups of
// levels (50 each).
export const UNLOCK_ALL_COST = 10_000;
export const STAGE_REWARD = 50; // for completing a stage: every star in it

// The two solutions a level's hints show: "flips" (only flips, the second star) and "moves"
// (the fewest moves, the third star)
export type HintGoal = "flips" | "moves";

// What is saved, each under its own key
let stars: Record<string, number> = {}; // level key -> star bits
// The wallet: coins, the difficulties and groups of levels opened with coins (a group as
// "difficulty:grade"), the skins and shapes owned and the ones in use, and the stages whose
// completion reward was paid (by difficulty)
const NEW_WALLET = () => ({
  coins: STARTING_COINS, unlocked: [] as number[], grades: [] as string[], skins: [DEFAULT_SKIN], skin: DEFAULT_SKIN,
  shapes: [SQUARE], shape: SQUARE, rewarded: [] as number[],
});
let wallet = NEW_WALLET();
let hints: Record<string, Partial<Record<HintGoal, number>>> = {}; // level key -> hints bought per goal
// board -> solves to replay, as moves (tile, + 32 for a force): the last ones that earned the
// flips star and the moves star
type Recorded = Partial<Record<ReplayKind, number[]>>;
let replays: Record<string, Recorded> = {};

// The player finished the tutorial (the first two levels, guided: see tutorialStep)
let tutorialDone = false;

const KEYS = {
  stars: "progress-v1", wallet: "wallet-v1", hints: "hints-v1", replays: "replays-v1", tutorial: "tutorial-done-v1",
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
  [stars, saved, hints, replays, tutorialDone] = await Promise.all([
    read(KEYS.stars, {}),
    read(KEYS.wallet, {}),
    read(KEYS.hints, {}),
    read(KEYS.replays, {}),
    read(KEYS.tutorial, false),
  ]);
  wallet = { ...NEW_WALLET(), ...saved }; // (a wallet saved before skins existed has none)
  // Skins and shapes taken out of the game since: gone from the wallet, and one that was on is
  // swapped for the start's (Classic, the square)
  wallet.skins = wallet.skins.filter((id) => SKINS.some((s) => s.id === id));
  wallet.shapes = wallet.shapes.filter((id) => SHAPES.some((s) => s.id === id));
  if (!wallet.skins.includes(wallet.skin)) wallet.skin = DEFAULT_SKIN;
  if (!wallet.shapes.includes(wallet.shape)) wallet.shape = SQUARE;
}

export async function resetProgress() {
  stars = {};
  wallet = NEW_WALLET();
  hints = {};
  replays = {};
  tutorialDone = false;
  await Promise.all(Object.values(KEYS).map((key) => Preferences.remove({ key })));
}

// --- the tutorial ---------------------------------------------------------------------------

// A new player starts with the tutorial: the first two levels, guided (a tap, then a tap and
// hold), one after the other. This is the level they are at, or null once it is done (also for
// a player who already has stars elsewhere: they have played before).
export function tutorialStep(): Level | null {
  if (tutorialDone) return null;
  const [tap, hold] = TIERS[0].levels;
  if (totalStars() > countStars(starsOf(tap)) + countStars(starsOf(hold))) return null;
  if (!(starsOf(tap) & STAR_SOLVED)) return tap;
  if (!(starsOf(hold) & STAR_SOLVED)) return hold;
  return null;
}

export const isTutorialLevel = (level: Level) => level === TIERS[0].levels[0] || level === TIERS[0].levels[1];

export function finishTutorial() {
  tutorialDone = true;
  write(KEYS.tutorial, true);
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

// Every star of the tier earned
export const isTierComplete = (tier: Tier) => tierStars(tier) === maxStars(tier);

// --- the reward for completing a stage ------------------------------------------------------

// Pay STAGE_REWARD for each completed stage not paid for yet (once per stage, also for a stage
// completed before this reward existed); returns those stages. The home screen calls it, and
// shows the coins flying from the stage to the coin pouch.
export function payStageRewards(): Tier[] {
  const due = TIERS.filter((t) => isTierComplete(t) && !wallet.rewarded.includes(t.difficulty));
  if (!due.length) return [];
  wallet.coins += STAGE_REWARD * due.length;
  wallet.rewarded.push(...due.map((t) => t.difficulty));
  write(KEYS.wallet, wallet);
  return due;
}

// --- coins and opening tiers ----------------------------------------------------------------

export const coins = () => wallet.coins;

function spend(amount: number): boolean {
  if (wallet.coins < amount) return false;
  wallet.coins -= amount;
  write(KEYS.wallet, wallet);
  return true;
}

// How many more stars (in all) must be earned to open this tier (0 = open)
export function starsToUnlock(tier: Tier): number {
  const i = TIERS.indexOf(tier);
  if (i <= 0 || wallet.unlocked.includes(tier.difficulty)) return 0;
  return Math.max(0, unlockStars(i) - totalStars());
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

// Everything is open and owned: every stage, every group of levels, every skin and shape
export const ownsAll = () =>
  TIERS.every((t) => starsToUnlock(t) === 0 && t.grades.every((_, g) => starsToUnlockGrade(t, g) === 0)) &&
  skinsLeft().length === 0 && shapesLeft().length === 0;

// Buy everything at once (in the shop): every stage, every group of levels, every skin and
// shape. False when there aren't enough coins or nothing is left to get.
export function buyUnlockAll(): boolean {
  if (ownsAll() || !spend(UNLOCK_ALL_COST)) return false;
  wallet.unlocked = TIERS.map((t) => t.difficulty);
  wallet.grades = TIERS.flatMap((t) => t.grades.map((_, g) => `${t.difficulty}:${g}`).slice(1));
  wallet.skins = SKINS.map((s) => s.id);
  wallet.shapes = SHAPES.map((s) => s.id);
  write(KEYS.wallet, wallet);
  return true;
}

// --- skins and shapes -----------------------------------------------------------------------

export const ownsSkin = (id: string) => wallet.skins.includes(id);
export const activeSkin = () => wallet.skin;
export const ownsShape = (id: string) => wallet.shapes.includes(id);
export const activeShape = () => wallet.shape;

// The look the player has on
export const activeLook = (): Look => ({ skin: wallet.skin, shape: wallet.shape });

// What the player doesn't have yet: what a mystery box can give
export const skinsLeft = () => SKINS.filter((s) => !ownsSkin(s.id));
export const shapesLeft = () => SHAPES.filter((s) => !ownsShape(s.id));

// `count` random different ones of `left`, every one as likely, for SKIN_COST each; none when
// there aren't that many left or not enough coins
function buyMystery<T extends { id: string }>(left: T[], owned: string[], count: number): T[] {
  if (left.length < count || !spend(SKIN_COST * count)) return [];
  const pool = [...left];
  const found: T[] = [];
  for (let i = 0; i < count; i++) found.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  owned.push(...found.map((f) => f.id));
  write(KEYS.wallet, wallet);
  return found;
}

// Open mystery boxes: random skins, or random shapes, the player doesn't have yet (1, or
// BOX_BUNDLE at once)
export const buyMysterySkins = (count = 1): Skin[] => buyMystery(skinsLeft(), wallet.skins, count);
export const buyMysteryShapes = (count = 1): Shape[] => buyMystery(shapesLeft(), wallet.shapes, count);

export function useSkin(id: string) {
  if (!ownsSkin(id)) return;
  wallet.skin = id;
  write(KEYS.wallet, wallet);
}

export function useShape(id: string) {
  if (!ownsShape(id)) return;
  wallet.shape = id;
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
export const REPLAY_KINDS: ReplayKind[] = ["moves", "flips"]; // (easy to hard, as the goals)

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
