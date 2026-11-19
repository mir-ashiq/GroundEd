// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — tests for the quiz repair layer (rawToQuiz).
//
// Model output is untrusted: rawToQuiz must guarantee that every MCQ renders
// with exactly 4 options and a valid key, degrades unrepairable MCQs to short
// answers, and drops near-duplicate questions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { rawToQuiz } from "@/lib/grounded/demoEngine";
import type { GenerationConfig } from "@/lib/grounded/types";
import type { RawQuizResponse } from "@/lib/grounded/schemas";

const cfg: GenerationConfig = {
  gradeLevel: 7,
  blooms: "Understand",
  questionCount: 12,
  includeShortAnswers: true,
  includeOutline: false,
  subject: "Science",
  language: "en",
};

describe("rawToQuiz repair layer", () => {
  it("keeps well-formed MCQs untouched", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        {
          type: "mcq",
          question: "What is H2O?",
          options: ["Water", "Salt", "Sugar", "Air"],
          answerIndex: 0,
          blooms: "Remember",
        },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0].options).toEqual(["Water", "Salt", "Sugar", "Air"]);
    expect(quiz.questions[0].answerIndex).toBe(0);
  });

  it("pads MCQs with fewer than 4 options to exactly 4", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        {
          type: "mcq",
          question: "What is H2O?",
          options: ["Water", "Salt"],
          answerIndex: 1,
          blooms: "Remember",
        },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    const q = quiz.questions[0];
    expect(q.type).toBe("mcq");
    expect(q.options).toHaveLength(4);
    expect(q.answerIndex).toBe(1);
    expect(q.options![1]).toBe("Salt"); // correct answer preserved
  });

  it("keeps the correct option when slicing 5 options down to 4", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        {
          type: "mcq",
          question: "Which planet is red?",
          options: ["Venus", "Mars", "Jupiter", "Saturn", "Neptune"],
          answerIndex: 4, // correct one would be cut by a naive slice(0,4)
          blooms: "Remember",
        },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    const q = quiz.questions[0];
    expect(q.options).toHaveLength(4);
    expect(q.options![q.answerIndex ?? -1]).toBe("Neptune");
  });

  it("degrades an MCQ with no options to a short-answer question", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        { type: "mcq", question: "Explain photosynthesis.", answerIndex: 0, blooms: "Understand" },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(quiz.questions[0].type).toBe("short");
    expect(quiz.questions[0].question).toBe("Explain photosynthesis.");
  });

  it("drops near-duplicate questions", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        { type: "short", question: "Explain the water cycle in nature.", answerKey: "a", blooms: "Understand" },
        { type: "short", question: "In nature, explain the water cycle.", answerKey: "b", blooms: "Understand" },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(quiz.questions).toHaveLength(1);
  });

  it("clamps question count to the configured maximum", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: Array.from({ length: 10 }, (_, i) => ({
        type: "short" as const,
        question: `Question number ${i} about distinct topic ${i}.`,
        answerKey: `a${i}`,
        blooms: "Remember",
      })),
    };
    const quiz = rawToQuiz(raw, { ...cfg, questionCount: 5 }, "text");
    expect(quiz.questions).toHaveLength(5);
  });

  it("never emits undefined at any depth (Firestore-safe)", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        { type: "short", question: "Why?", blooms: "Understand" }, // no answerKey
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    const json = JSON.stringify(quiz);
    expect(json).not.toContain("undefined");
    expect(quiz.questions[0].answerKey).toBe("");
  });

  it("passes a verbatim sourceQuote through to the quiz question", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        {
          type: "mcq",
          question: "What is H2O?",
          options: ["Water", "Salt", "Sugar", "Air"],
          answerIndex: 0,
          sourceQuote: "  Water covers most of Earth's surface.  ",
          blooms: "Remember",
        },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(quiz.questions[0].sourceQuote).toBe(
      "Water covers most of Earth's surface.",
    );
  });

  it("caps overlong sourceQuotes and drops empty ones", () => {
    const long = "word ".repeat(80).trim(); // 400 chars
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        {
          type: "short",
          question: "Explain the water cycle in nature.",
          answerKey: "a",
          sourceQuote: long,
          blooms: "Understand",
        },
        {
          type: "short",
          question: "Why do rivers flow to the sea?",
          answerKey: "b",
          sourceQuote: "   ",
          blooms: "Understand",
        },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(quiz.questions[0].sourceQuote!.length).toBeLessThanOrEqual(220);
    expect(quiz.questions[0].sourceQuote!.endsWith("…")).toBe(true);
    expect("sourceQuote" in quiz.questions[1]).toBe(false);
  });

  it("stays Firestore-safe when the model omits sourceQuote entirely", () => {
    const raw: RawQuizResponse = {
      title: "T",
      questions: [
        { type: "short", question: "Why?", answerKey: "because", blooms: "Understand" },
      ],
    };
    const quiz = rawToQuiz(raw, cfg, "text");
    expect(JSON.stringify(quiz)).not.toContain("undefined");
    expect("sourceQuote" in quiz.questions[0]).toBe(false);
  });
});
