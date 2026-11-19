// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — tests for the Insights math: hybrid-value meter, class stats,
// weak-question aggregation, and per-question rollups.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  hybridValueFromLog,
  classStatsFromHistory,
  weakestQuestions,
  questionStatsForSession,
  ILLUSTRATIVE_USD_PER_CLOUD_CALL,
} from "@/lib/grounded/insights";
import type { RoutingEvent, SessionHistoryEntry } from "@/lib/grounded/types";

function ev(source: RoutingEvent["source"], inputChars = 100, offline = false): RoutingEvent {
  return {
    id: Math.random().toString(36).slice(2),
    ts: Date.now(),
    feature: "generate-quiz",
    source,
    model: "test",
    latencyMs: 10,
    inputChars,
    outputChars: 50,
    simulated: source === "DEMO",
    offline,
  };
}

describe("hybridValueFromLog", () => {
  it("counts device/cloud/demo/offline calls and computes honest savings", () => {
    const log = [
      ev("ON_DEVICE", 500),
      ev("ON_DEVICE", 300),
      ev("ON_DEVICE", 200, true), // offline on-device call
      ev("IN_CLOUD", 400),
      ev("DEMO", 100),
    ];
    const v = hybridValueFromLog(log);
    expect(v.deviceCalls).toBe(3);
    expect(v.cloudCalls).toBe(1);
    expect(v.demoCalls).toBe(1);
    expect(v.offlineCalls).toBe(1);
    expect(v.localChars).toBe(1000);
    expect(v.localCharsKb).toBeCloseTo(1.0, 1);
    expect(v.estUsdSaved).toBeCloseTo(3 * ILLUSTRATIVE_USD_PER_CLOUD_CALL, 2);
    expect(v.deviceShare).toBeCloseTo(3 / 4, 5);
  });

  it("empty log → zeroed stats, no NaN", () => {
    const v = hybridValueFromLog([]);
    expect(v.deviceShare).toBe(0);
    expect(v.estUsdSaved).toBe(0);
  });
});

const history: SessionHistoryEntry[] = [
  {
    code: "OAK-1111",
    title: "Fractions",
    endedAt: 3000,
    students: 30,
    avgMcqPct: 40,
    shortGraded: 2,
    source: "live",
    perQuestion: [
      { label: "What is a numerator?", type: "mcq", pct: 20, answered: 30 },
      { label: "Explain a denominator.", type: "short", pct: 60, answered: 30 },
    ],
  },
  {
    code: "PAPER-2222",
    title: "Fractions (paper)",
    endedAt: 1000, // older
    students: 10,
    avgMcqPct: 80,
    shortGraded: 4,
    source: "paper",
    perQuestion: [
      { label: "What is a numerator?", type: "mcq", pct: 60, answered: 10 },
    ],
  },
  {
    code: "FERN-3333",
    title: "Short-only quiz",
    endedAt: 500, // oldest
    students: 5,
    avgMcqPct: -1,
    shortGraded: 5,
    source: "live",
  },
];

describe("classStatsFromHistory", () => {
  it("aggregates sessions, students and MCQ average", () => {
    const s = classStatsFromHistory(history);
    expect(s.sessions).toBe(3);
    expect(s.studentsTaught).toBe(45);
    expect(s.avgMcqPct).toBe(60); // (40 + 80) / 2 — the -1 session is skipped
    expect(s.trend).toEqual([80, 40]); // oldest → newest, -1 skipped
  });
});

describe("weakestQuestions", () => {
  it("weights question averages by answered counts across sessions", () => {
    const w = weakestQuestions(history, 5);
    expect(w).toHaveLength(2);
    // numerator: (20×30 + 60×10) / 40 = 30 ; denominator: 60
    expect(w[0].label).toBe("What is a numerator?");
    expect(w[0].avgPct).toBe(30);
    expect(w[0].type).toBe("mcq");
    expect(w[1].avgPct).toBe(60);
  });

  it("ignores unscorable entries (pct -1, answered 0)", () => {
    const w = weakestQuestions(
      [{ code: "x", title: "t", endedAt: 1, students: 1, avgMcqPct: -1, shortGraded: 0,
         perQuestion: [{ label: "q", type: "short", pct: -1, answered: 0 }] }],
      5,
    );
    expect(w).toHaveLength(0);
  });
});

describe("questionStatsForSession", () => {
  const questions = [
    { id: "q1", question: "What is one half?", type: "mcq" as const, answerIndex: 1 },
    { id: "q2", question: "Explain a denominator.", type: "short" as const },
    { id: "q3", question: "A long question ".repeat(10), type: "mcq" as const, answerIndex: 0 },
  ];
  const submissions = [
    {
      studentId: "s1",
      answers: [
        { questionId: "q1", choice: 1 },
        { questionId: "q2", text: "bottom number" },
        { questionId: "q3", choice: 1 },
      ],
    },
    {
      studentId: "s2",
      answers: [
        { questionId: "q1", choice: 0 },
        { questionId: "q3", choice: 0 },
      ],
    },
  ];

  it("MCQs are deterministic; shorts use graded scores; labels truncate", () => {
    const graded = { "s1:q2": { score: 0.5 } };
    const stats = questionStatsForSession(questions, submissions, graded);
    expect(stats[0]).toMatchObject({ pct: 50, answered: 2 }); // 1/2 correct
    expect(stats[1]).toMatchObject({ pct: 50, answered: 1 }); // 0.5/1
    expect(stats[2]).toMatchObject({ pct: 50, answered: 2 });
    expect(stats[2].label.length).toBeLessThanOrEqual(91); // 90 + ellipsis
    expect(stats[2].label.endsWith("…")).toBe(true);
  });

  it("ungraded short answers are ignored, not counted as zero", () => {
    const stats = questionStatsForSession(questions, submissions, {});
    expect(stats[1].pct).toBe(-1); // honest: ungraded ≠ wrong
    expect(stats[1].answered).toBe(1);
  });
});
