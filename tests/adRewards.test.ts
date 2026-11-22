// How watching ads pays (src/adRewards.ts, numbers in src/monetization.ts): the rules as pure
// functions of the saved state and the time, so no waiting is needed
import { describe, expect, it } from "vitest";
import { NEW_AD_STATE, offerFor, watched } from "../src/adRewards";
import {
  AD_DAILY_LIMIT, AD_DAILY_MULTIPLIER, AD_REFILL_MINUTES, AD_REWARD, AD_STACK, AD_WELCOME_MULTIPLIER, HINT_COST,
} from "../src/monetization";

const MIN = 60_000;
const t0 = new Date(2026, 10, 22, 9, 0).getTime(); // 9:00 local time

describe("ads", () => {
  it("pay exactly one hint, with a welcome bonus on the very first and a daily bonus on each day's first", () => {
    expect(AD_REWARD).toBe(HINT_COST);
    let s = NEW_AD_STATE(t0);
    expect(offerFor(s, t0)).toMatchObject({ canWatch: true, reward: AD_REWARD * AD_WELCOME_MULTIPLIER, bonus: "welcome" });
    s = watched(s, t0);
    expect(offerFor(s, t0)).toMatchObject({ reward: AD_REWARD, bonus: null });
    // (the next day: the daily bonus)
    const tomorrow = t0 + 24 * 60 * MIN;
    expect(offerFor(s, tomorrow)).toMatchObject({ reward: AD_REWARD * AD_DAILY_MULTIPLIER, bonus: "daily" });
  });

  it("come in a stack of AD_STACK that refills one every AD_REFILL_MINUTES", () => {
    let s = NEW_AD_STATE(t0);
    for (let i = 0; i < AD_STACK; i++) {
      expect(offerFor(s, t0).left).toBe(AD_STACK - i);
      s = watched(s, t0);
    }
    const empty = offerFor(s, t0);
    expect(empty).toMatchObject({ canWatch: false, left: 0, reason: "wait" });
    expect(empty.nextAt).toBe(t0 + AD_REFILL_MINUTES * MIN);
    expect(offerFor(s, t0 + AD_REFILL_MINUTES * MIN - 1).canWatch).toBe(false);
    expect(offerFor(s, t0 + AD_REFILL_MINUTES * MIN)).toMatchObject({ canWatch: true, left: 1 });
    // (never more than the stack, however long it waits)
    expect(offerFor(s, t0 + 1000 * AD_REFILL_MINUTES * MIN)).toMatchObject({ left: AD_STACK, nextAt: null });
  });

  it("for a hint the player can't pay for: at once, with the stack empty, but never past the daily limit", () => {
    let s = NEW_AD_STATE(t0);
    for (let i = 0; i < AD_STACK; i++) s = watched(s, t0);
    expect(offerFor(s, t0).canWatch).toBe(false); // (the stack is empty: wait)
    expect(offerFor(s, t0, true)).toMatchObject({ canWatch: true, reason: "ready" });
    s = watched(s, t0);
    expect(s.stack).toBe(0); // (stays empty, still refilling)
    expect(offerFor(s, t0 + AD_REFILL_MINUTES * MIN).left).toBe(1);
    for (let i = AD_STACK + 1; i < AD_DAILY_LIMIT; i++) s = watched(s, t0);
    expect(offerFor(s, t0, true)).toMatchObject({ canWatch: false, reason: "daily-limit", todayLeft: 0 });
  });

  it("stop at AD_DAILY_LIMIT a day, and start again the next day", () => {
    let s = NEW_AD_STATE(t0);
    let now = t0;
    for (let i = 0; i < AD_DAILY_LIMIT; i++) {
      expect(offerFor(s, now).canWatch).toBe(true);
      s = watched(s, now);
      now += AD_REFILL_MINUTES * MIN; // (waits for the stack each time)
    }
    expect(offerFor(s, now)).toMatchObject({ canWatch: false, reason: "daily-limit" });
    const nextMorning = new Date(2026, 10, 23, 8, 0).getTime();
    expect(offerFor(s, nextMorning)).toMatchObject({ canWatch: true, bonus: "daily" });
  });
});
