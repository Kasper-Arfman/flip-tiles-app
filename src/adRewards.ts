// How watching ads pays (the rules: monetization.ts). Kept apart from the progress, under its own
// key, so Reset progress doesn't hand out the welcome bonus or a full stack again.
//
//   adOffer()         can an ad be watched now, what it pays, and when the next one comes
//   recordAdWatched() an ad was watched to the end: pays its coins
//
// The rules themselves are pure functions of the saved state and the time (offerFor, watched),
// so they can be tested without waiting 20 minutes.
import { Preferences } from "@capacitor/preferences";
import {
  AD_DAILY_LIMIT, AD_DAILY_MULTIPLIER, AD_REFILL_MINUTES, AD_REWARD, AD_STACK, AD_WELCOME_MULTIPLIER,
} from "./monetization";
import { earnCoins } from "./progress";

const KEY = "ads-v1";
const REFILL_MS = AD_REFILL_MINUTES * 60_000;

export interface AdState {
  total: number; // ads ever watched
  day: string; // the day of `today` (the player's own date, YYYY-MM-DD)
  today: number; // ads watched on that day
  stack: number; // ads available in a row (at `stackAt`)
  stackAt: number; // when the stack had that many (ms); one more comes every REFILL_MS after
}

export const NEW_AD_STATE = (now: number): AdState => ({ total: 0, day: dayOf(now), today: 0, stack: AD_STACK, stackAt: now });

// The player's own date (an ad "today" follows the phone's clock and time zone)
export function dayOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The stack as it is now: refilled by the time that passed, at most AD_STACK
function refilled(s: AdState, now: number): { stack: number; stackAt: number } {
  if (s.stack >= AD_STACK) return { stack: AD_STACK, stackAt: now };
  const gained = Math.floor(Math.max(0, now - s.stackAt) / REFILL_MS);
  const stack = Math.min(AD_STACK, s.stack + gained);
  return { stack, stackAt: stack >= AD_STACK ? now : s.stackAt + gained * REFILL_MS };
}

export interface AdOffer {
  canWatch: boolean;
  reward: number; // coins the next ad pays
  bonus: "welcome" | "daily" | null; // why it pays more than AD_REWARD
  left: number; // ads that can be watched in a row now
  todayLeft: number; // ads still allowed today (AD_DAILY_LIMIT minus the ones watched today)
  nextAt: number | null; // when one more becomes available (null: the stack is full)
  reason: "ready" | "wait" | "daily-limit";
}

// `forHint`: a player who can't pay for a hint on a level may watch one at once, without waiting
// for the stack (but never past the daily limit)
export function offerFor(s: AdState, now: number, forHint = false): AdOffer {
  const today = s.day === dayOf(now) ? s.today : 0;
  const { stack, stackAt } = refilled(s, now);
  const bonus = s.total === 0 ? "welcome" : today === 0 ? "daily" : null;
  const reward = AD_REWARD * (bonus === "welcome" ? AD_WELCOME_MULTIPLIER : bonus === "daily" ? AD_DAILY_MULTIPLIER : 1);
  const limited = today >= AD_DAILY_LIMIT;
  const ready = forHint || stack > 0;
  return {
    canWatch: !limited && ready,
    reward,
    bonus,
    left: limited ? 0 : Math.min(stack, AD_DAILY_LIMIT - today),
    todayLeft: Math.max(0, AD_DAILY_LIMIT - today),
    nextAt: stack >= AD_STACK ? null : stackAt + REFILL_MS,
    reason: limited ? "daily-limit" : ready ? "ready" : "wait",
  };
}

// The state after watching an ad to the end (only when one could be watched). An ad watched for a
// hint with an empty stack leaves the stack at 0, still refilling.
export function watched(s: AdState, now: number): AdState {
  const { stack, stackAt } = refilled(s, now);
  const today = s.day === dayOf(now) ? s.today : 0;
  // (a full stack starts refilling from now)
  return {
    total: s.total + 1, day: dayOf(now), today: today + 1, stack: Math.max(0, stack - 1),
    stackAt: stack >= AD_STACK ? now : stackAt,
  };
}

// --- saved ------------------------------------------------------------------------------------

let state: AdState = NEW_AD_STATE(Date.now());

export async function loadAdRewards() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) state = { ...NEW_AD_STATE(Date.now()), ...JSON.parse(value) };
  } catch {
    // (no saved state: a new player)
  }
}

export const adOffer = (forHint = false, now = Date.now()) => offerFor(state, now, forHint);

// (the debug screen's test tool: today's videos and the stack as new, the welcome bonus kept used)
export function resetAdsToday(now = Date.now()) {
  state = { ...NEW_AD_STATE(now), total: state.total };
  void Preferences.set({ key: KEY, value: JSON.stringify(state) }).catch(() => {});
}

// An ad was watched to the end: its coins, now (returns how many; 0 if none could be watched)
export function recordAdWatched(forHint = false, now = Date.now()): number {
  const offer = offerFor(state, now, forHint);
  if (!offer.canWatch) return 0;
  state = watched(state, now);
  void Preferences.set({ key: KEY, value: JSON.stringify(state) }).catch(() => {});
  earnCoins(offer.reward);
  return offer.reward;
}
