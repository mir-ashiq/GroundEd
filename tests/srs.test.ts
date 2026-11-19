// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — tests for the SM-2 spaced-repetition scheduler (Study tab).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  review,
  newSrsState,
  isMastered,
  isDue,
  deckStats,
  DAY_MS,
  type SRSCardState,
} from "@/lib/grounded/srs";

const NOW = 1_700_000_000_000;

describe("SM-2 review", () => {
  it("first Good review schedules +1 day", () => {
    const s = review(newSrsState(NOW), 4, NOW);
    expect(s.reps).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt).toBe(NOW + 1 * DAY_MS);
  });

  it("second Good review schedules +6 days (classic SM-2)", () => {
    let s: SRSCardState = newSrsState(NOW);
    s = review(s, 4, NOW);
    s = review(s, 4, NOW + DAY_MS);
    expect(s.reps).toBe(2);
    expect(s.intervalDays).toBe(6);
  });

  it("subsequent reviews grow by the ease factor", () => {
    let s: SRSCardState = newSrsState(NOW);
    s = review(s, 4, NOW); // 1 day, ease 2.5 → 2.5 (Good: +0)
    s = review(s, 4, NOW + DAY_MS); // 6 days
    s = review(s, 4, NOW + 6 * DAY_MS);
    expect(s.reps).toBe(3);
    // ease stays 2.5 for straight Goods → round(6 × 2.5) = 15
    expect(s.ease).toBeCloseTo(2.5, 5);
    expect(s.intervalDays).toBe(15);
  });

  it("Easy raises the ease factor; Hard lowers it (clamped ≥ 1.3)", () => {
    let s = review(newSrsState(NOW), 5, NOW);
    expect(s.ease).toBeCloseTo(2.6, 5);
    for (let i = 0; i < 12; i++) s = review(s, 3, NOW + i * DAY_MS);
    expect(s.ease).toBeCloseTo(1.3, 5);
  });

  it("Again (q<3) is a lapse: reps reset, card due immediately, lapses grow", () => {
    let s: SRSCardState = newSrsState(NOW);
    s = review(s, 4, NOW);
    s = review(s, 4, NOW + DAY_MS);
    const failed = review(s, 0, NOW + 6 * DAY_MS);
    expect(failed.reps).toBe(0);
    expect(failed.intervalDays).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.dueAt).toBe(NOW + 6 * DAY_MS); // due now
    expect(isDue(failed, NOW + 6 * DAY_MS)).toBe(true);
  });
});

describe("mastery & due", () => {
  it("a card is mastered once its interval reaches 21 days", () => {
    let s: SRSCardState = newSrsState(NOW);
    s = review(s, 4, NOW);
    s = review(s, 4, NOW + DAY_MS);
    s = review(s, 4, NOW + 6 * DAY_MS); // 15 days — not yet
    expect(isMastered(s)).toBe(false);
    s = review(s, 4, NOW + 15 * DAY_MS); // 15 × 2.5 ≈ 38 days
    expect(isMastered(s)).toBe(true);
  });

  it("unseen cards are due; future cards are not", () => {
    expect(isDue(undefined, NOW)).toBe(true);
    const s = review(newSrsState(NOW), 4, NOW);
    expect(isDue(s, NOW + DAY_MS - 1)).toBe(false);
    expect(isDue(s, NOW + DAY_MS)).toBe(true);
  });

  it("deckStats rolls up due / learning / mastered", () => {
    // a: reviewed once → due tomorrow (due at NOW+2d check)
    const a = review(newSrsState(NOW), 4, NOW);
    // b: reviewed a month ago → long due
    const b = review(newSrsState(NOW), 4, NOW - 30 * DAY_MS);
    // c: climbs the ladder to a 38-day interval → mastered, not due
    let c = b; // reps 1 (interval 1)
    c = review(c, 4, NOW - 29 * DAY_MS); // reps 2 → interval 6
    c = review(c, 4, NOW - 23 * DAY_MS); // reps 3 → interval 15
    c = review(c, 4, NOW - 8 * DAY_MS); // reps 4 → interval round(15×2.5)=38
    expect(c.intervalDays).toBe(38);
    expect(isMastered(c)).toBe(true);
    const states = { a: a, b: b, c: c };
    const stats = deckStats(states, ["a", "b", "c", "d"], NOW + 2 * DAY_MS);
    expect(stats.total).toBe(4);
    expect(stats.due).toBe(3); // a (due yesterday), b (long due), d (never seen)
    expect(stats.mastered).toBe(1); // c
    expect(stats.learning).toBe(3); // everyone else
  });
});
