// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Insights math (pure, testable).
//
// Turns the routing log + session history into the concrete numbers the
// Insights tab shows: where AI ran, what hybrid saved, and which questions
// the class keeps getting wrong. Pure functions only — UI stays in the view.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  QuestionStat,
  RoutingEvent,
  SessionHistoryEntry,
} from "./types";

/**
 * Illustrative cost of ONE metered cloud model call (roughly a small
 * structured-output request on a Flash-class model). The point is NOT a
 * precise invoice — it is the structural fact that on-device calls cost ₹0.
 * Surfaced as "illustrative" everywhere it is displayed.
 */
export const ILLUSTRATIVE_USD_PER_CLOUD_CALL = 0.003;

export interface HybridValue {
  deviceCalls: number;
  cloudCalls: number;
  demoCalls: number;
  offlineCalls: number;
  /** Total input characters that travelled through on-device calls. */
  localChars: number;
  localCharsKb: number;
  /** Illustrative USD the on-device tier saved vs a cloud-only app. */
  estUsdSaved: number;
  /** Share of real (non-demo) calls served on-device, 0–1. */
  deviceShare: number;
}

export function hybridValueFromLog(log: RoutingEvent[]): HybridValue {
  let deviceCalls = 0;
  let cloudCalls = 0;
  let demoCalls = 0;
  let offlineCalls = 0;
  let localChars = 0;
  for (const e of log) {
    if (e.source === "ON_DEVICE") {
      deviceCalls++;
      localChars += e.inputChars;
    } else if (e.source === "IN_CLOUD") {
      cloudCalls++;
    } else {
      demoCalls++;
    }
    if (e.offline) offlineCalls++;
  }
  const real = deviceCalls + cloudCalls;
  return {
    deviceCalls,
    cloudCalls,
    demoCalls,
    offlineCalls,
    localChars,
    localCharsKb: Math.round(localChars / 102.4) / 10, // 1 decimal, KB
    estUsdSaved: Math.round(deviceCalls * ILLUSTRATIVE_USD_PER_CLOUD_CALL * 100) / 100,
    deviceShare: real === 0 ? 0 : deviceCalls / real,
  };
}

export interface ClassStats {
  sessions: number;
  studentsTaught: number;
  /** Average class MCQ % across sessions that had MCQs, -1 when none did. */
  avgMcqPct: number;
  /** avgMcqPct per session, oldest → newest (-1 entries skipped). */
  trend: number[];
}

export function classStatsFromHistory(history: SessionHistoryEntry[]): ClassStats {
  const sessions = history.length;
  let studentsTaught = 0;
  const pcts: number[] = [];
  for (const h of history) {
    studentsTaught += h.students;
    if (h.avgMcqPct >= 0) pcts.push(h.avgMcqPct);
  }
  return {
    sessions,
    studentsTaught,
    avgMcqPct:
      pcts.length === 0
        ? -1
        : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    // history is stored newest-first; the trend reads oldest → newest
    trend: [...history]
      .reverse()
      .map((h) => h.avgMcqPct)
      .filter((p) => p >= 0),
  };
}

export interface WeakSpot {
  label: string;
  type: "mcq" | "short";
  /** Average pct across every session that asked this question, 0–100. */
  avgPct: number;
  /** How many sessions contributed (weighted with answered counts). */
  seenIn: number;
}

/**
 * Aggregates per-question stats across session history into the questions
 * the class struggles with most. Matching is by trimmed label — the same
 * generated question re-appearing in a Support/Extension variant counts as
 * the same concept being practised.
 */
export function weakestQuestions(
  history: SessionHistoryEntry[],
  limit = 5,
): WeakSpot[] {
  const acc = new Map<string, { pctSum: number; weight: number; type: "mcq" | "short" }>();
  for (const h of history) {
    for (const q of h.perQuestion ?? []) {
      if (q.pct < 0 || q.answered === 0) continue;
      const key = q.label.trim();
      const prev = acc.get(key) ?? { pctSum: 0, weight: 0, type: q.type };
      acc.set(key, {
        pctSum: prev.pctSum + q.pct * q.answered,
        weight: prev.weight + q.answered,
        type: prev.type,
      });
    }
  }
  return [...acc.entries()]
    .map(([label, { pctSum, weight, type }]) => ({
      label,
      type,
      avgPct: Math.round(pctSum / weight),
      seenIn: weight,
    }))
    .sort((a, b) => a.avgPct - b.avgPct)
    .slice(0, limit);
}

/** Per-question rollup for one session — used when closing live/paper
 *  sessions and by the Verification Lab. MCQs: deterministic key match.
 *  Shorts: graded scores when present, else ignored (honest: ungraded ≠ wrong).
 *  `graded` is keyed `${studentId}:${questionId}` exactly like the app store. */
export function questionStatsForSession(
  questions: { id: string; question: string; type: "mcq" | "short"; answerIndex?: number }[],
  submissions: { studentId: string; answers: { questionId: string; choice?: number; text?: string }[] }[],
  graded: Record<string, { score: number }> = {},
): QuestionStat[] {
  return questions.map((q) => {
    const label = q.question.length > 90 ? q.question.slice(0, 90) + "…" : q.question;
    let scored = 0;
    let total = 0;
    let answered = 0;
    for (const sub of submissions) {
      const a = sub.answers.find((x) => x.questionId === q.id);
      if (!a) continue;
      if (q.type === "mcq") {
        if (typeof a.choice !== "number") continue;
        answered++;
        total++;
        if (a.choice === q.answerIndex) scored++;
      } else {
        if (!a.text) continue;
        answered++;
        const g = graded[`${sub.studentId}:${q.id}`];
        if (g) {
          total++;
          scored += Math.max(0, Math.min(1, g.score));
        }
      }
    }
    return {
      label,
      type: q.type,
      pct: total === 0 ? -1 : Math.round((scored / total) * 100),
      answered,
    };
  });
}
