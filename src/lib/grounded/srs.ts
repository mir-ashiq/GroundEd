// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — spaced repetition (SM-2, the algorithm behind Anki).
//
// Pure, deterministic, testable: given a card's scheduling state and the
// student's self-assessment quality, produce the next state. The Study tab
// persists one state per card (localStorage) and surfaces "due now" queues —
// so revision survives offline and across sessions with zero infrastructure.
//
// Classic SM-2 (Woźniak):
//   q < 3  → lapse: reps reset, card comes back in-session
//   q >= 3 → ease' = ease + (0.1 − (5−q)(0.08 + (5−q)0.02)), clamped [1.3, 2.8]
//            rep 1 → 1 day, rep 2 → 6 days, rep n → round(interval × ease)
// ─────────────────────────────────────────────────────────────────────────────

export interface SRSCardState {
  /** Successful consecutive reviews. */
  reps: number;
  /** Ease factor (1.3–2.8, starts 2.5). */
  ease: number;
  /** Current inter-review gap in days (0 while learning). */
  intervalDays: number;
  /** Total times the card was failed (q < 3). */
  lapses: number;
  /** Epoch ms when the card is due again. 0 = new card / relearn now. */
  dueAt: number;
}

export type SRSQuality = 0 | 3 | 4 | 5;

/** Answer buttons, mapped to SM-2 quality scores. */
export const SRS_BUTTONS: {
  quality: SRSQuality;
  label: string;
  hint: string;
  tone: "again" | "hard" | "good" | "easy";
}[] = [
  { quality: 0, label: "Again", hint: "I couldn't recall it", tone: "again" },
  { quality: 3, label: "Hard", hint: "recalled with effort", tone: "hard" },
  { quality: 4, label: "Good", hint: "recalled comfortably", tone: "good" },
  { quality: 5, label: "Easy", hint: "recalled instantly", tone: "easy" },
];

export const DAY_MS = 86_400_000;

/** A card that has never been reviewed gets this pristine state. */
export function newSrsState(now = Date.now()): SRSCardState {
  return { reps: 0, ease: 2.5, intervalDays: 0, lapses: 0, dueAt: now };
}

/** One SM-2 review step. Deterministic given `now` — trivially unit-testable. */
export function review(
  state: SRSCardState,
  quality: SRSQuality,
  now = Date.now(),
): SRSCardState {
  if (quality < 3) {
    // Lapse: the card returns to the front of the queue this session.
    return {
      ...state,
      reps: 0,
      intervalDays: 0,
      lapses: state.lapses + 1,
      dueAt: now,
    };
  }
  const q = quality;
  const ease = Math.min(
    2.8,
    Math.max(1.3, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))),
  );
  const reps = state.reps + 1;
  const intervalDays =
    reps === 1 ? 1 : reps === 2 ? 6 : Math.round(state.intervalDays * ease);
  return { ...state, reps, ease, intervalDays, dueAt: now + intervalDays * DAY_MS };
}

/** Cards with a ≥3-week gap are considered "mastered" for this deck. */
export function isMastered(state: SRSCardState): boolean {
  return state.intervalDays >= 21;
}

/** Due = never seen, lapsed, or the scheduled time has arrived. */
export function isDue(state: SRSCardState | undefined, now = Date.now()): boolean {
  if (!state) return true; // never reviewed → due
  return state.dueAt <= now;
}

/** Deck-level rollup for the study header chips. */
export function deckStats(
  states: Record<string, SRSCardState>,
  cardIds: string[],
  now = Date.now(),
): { total: number; due: number; learning: number; mastered: number } {
  let due = 0;
  let mastered = 0;
  for (const id of cardIds) {
    const s = states[id];
    if (isDue(s, now)) due++;
    if (s && isMastered(s)) mastered++;
  }
  return { total: cardIds.length, due, learning: cardIds.length - mastered, mastered };
}

// ── Persistence (localStorage, one key per deck) ─────────────────────────────

const keyFor = (deckId: string) => `grounded:srs:${deckId}`;

export function loadDeckStates(deckId: string): Record<string, SRSCardState> {
  try {
    const raw = localStorage.getItem(keyFor(deckId));
    return raw ? (JSON.parse(raw) as Record<string, SRSCardState>) : {};
  } catch {
    return {};
  }
}

export function saveDeckStates(
  deckId: string,
  states: Record<string, SRSCardState>,
): void {
  try {
    localStorage.setItem(keyFor(deckId), JSON.stringify(states));
  } catch {
    /* quota/blocked — scheduling still works in-memory for this session */
  }
}
