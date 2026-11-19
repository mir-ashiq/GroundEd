// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — tests for session utilities: CSV export, quiz file share format,
// session summary stats, and join-code shape.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  buildSessionCsv,
  quizToFileContent,
  quizFromFileContent,
  summarizeSession,
  generateSessionCode,
} from "@/lib/grounded/sessions";
import type { Quiz, StudentSubmission } from "@/lib/grounded/types";

const quiz: Quiz = {
  id: "quiz_1",
  title: "Fractions",
  subject: "Mathematics",
  gradeLevel: 5,
  bloomsLevel: "Understand",
  outline: [],
  createdAt: Date.now(),
  sourceKind: "text",
  questions: [
    {
      id: "q_1",
      type: "mcq",
      question: "What is one half of a pizza called?",
      options: ["A slice", "Half", "A crust", "A topping"],
      answerIndex: 1,
      blooms: "Remember",
      points: 10,
    },
    {
      id: "q_2",
      type: "short",
      question: "Explain a denominator.",
      answerKey: "The bottom number of a fraction.",
      blooms: "Understand",
      points: 10,
    },
  ],
};

const subs: StudentSubmission[] = [
  {
    studentId: "student_a",
    name: "Priya",
    answers: [
      { questionId: "q_1", choice: 1 },
      { questionId: "q_2", text: "The bottom number, it shows the parts" },
    ],
    submittedAt: Date.now(),
  },
  {
    studentId: "student_b",
    name: "Arjun",
    answers: [{ questionId: "q_1", choice: 0 }],
    submittedAt: Date.now(),
  },
];

describe("buildSessionCsv", () => {
  it("exports one row per student per question with a header", () => {
    const csv = buildSessionCsv(quiz, subs, {});
    const lines = csv.split("\n");
    expect(lines[0].startsWith("student,question,type")).toBe(true);
    // header + 2 students × 2 questions
    expect(lines).toHaveLength(5);
  });

  it("auto-checks MCQs deterministically", () => {
    const csv = buildSessionCsv(quiz, subs, {});
    const priyaMcq = csv.split("\n")[1];
    const arjunMcq = csv.split("\n")[3];
    expect(priyaMcq).toContain("correct");
    expect(arjunMcq).toContain("incorrect");
  });

  it("shows pending for ungraded short answers and the verdict once graded", () => {
    const pending = buildSessionCsv(quiz, subs, {});
    expect(pending).toContain("pending");
    const graded = buildSessionCsv(quiz, subs, {
      "student_a:q_2": { score: 0.5, verdict: "partial" },
    });
    expect(graded).toContain("partial");
    expect(graded).toContain("5"); // 0.5 × 10 points
  });

  it("escapes commas and quotes per RFC-4180", () => {
    const tricky: StudentSubmission[] = [
      {
        studentId: "s1",
        name: 'Dev, "DD" Kumar',
        answers: [],
        submittedAt: Date.now(),
      },
    ];
    const csv = buildSessionCsv(quiz, tricky, {});
    expect(csv).toContain('"Dev, ""DD"" Kumar"');
  });
});

describe("quiz file share format", () => {
  it("round-trips a quiz through export → import without loss", () => {
    const file = quizToFileContent(quiz);
    const parsed = JSON.parse(file);
    expect(parsed.format).toBe("grounded-quiz");
    const back = quizFromFileContent(file);
    expect(back.title).toBe(quiz.title);
    expect(back.questions).toHaveLength(quiz.questions.length);
    expect(back.questions[0].options).toEqual(quiz.questions[0].options);
  });

  it("rejects files that are not GroundEd quizzes", () => {
    expect(() => quizFromFileContent("not json at all")).toThrow();
    expect(() => quizFromFileContent('{"hello":"world"}')).toThrow();
    expect(() =>
      quizFromFileContent(JSON.stringify({ format: "grounded-quiz", quiz: { title: "x", questions: [] } })),
    ).toThrow();
  });
});

describe("summarizeSession", () => {
  it("computes class MCQ percentage", () => {
    const s = summarizeSession(quiz, subs, 1);
    // 1 correct of 1 MCQ × 2 students = 50%
    expect(s.avgMcqPct).toBe(50);
    expect(s.students).toBe(2);
  });

  it("returns -1 when there are no MCQs", () => {
    const shortOnly: Quiz = {
      ...quiz,
      questions: [quiz.questions[1]],
    };
    const s = summarizeSession(shortOnly, subs, 0);
    expect(s.avgMcqPct).toBe(-1);
  });

  it("v3: records per-question stats for the Insights tab", () => {
    const s = summarizeSession(quiz, subs, 1, {
      source: "live",
      graded: { "student_a:q_2": { score: 1 } },
    });
    expect(s.source).toBe("live");
    expect(s.perQuestion).toHaveLength(2);
    // q_1 (MCQ): Priya correct, Arjun wrong → 50%
    expect(s.perQuestion![0]).toMatchObject({ type: "mcq", pct: 50, answered: 2 });
    // q_2 (short): only the graded answer counts → 100%
    expect(s.perQuestion![1]).toMatchObject({ type: "short", pct: 100, answered: 1 });
  });

  it("v3: paper stacks roll up the same way (source: paper)", () => {
    const s = summarizeSession(quiz, subs, 0, { source: "paper" });
    expect(s.source).toBe("paper");
    expect(s.perQuestion![0].pct).toBe(50);
  });
});

describe("generateSessionCode", () => {
  it("always produces WORD-### codes", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSessionCode()).toMatch(/^[A-Z]+-\d{3,4}$/);
    }
  });
});
