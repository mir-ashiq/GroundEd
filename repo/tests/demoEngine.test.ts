// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — tests for the DEMO engine.
//
// The demo path is the zero-config first run many reviewers will see, so its
// output is held to product quality and pinned by tests.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  demoGenerateQuiz,
  demoGenerateLessonPlan,
  demoGenerateFlashcards,
  demoExplain,
  demoGradeAnswer,
  SAMPLE_MATERIALS,
} from "@/lib/grounded/demoEngine";
import type { GenerationConfig } from "@/lib/grounded/types";
import type { RawQuizResponse } from "@/lib/grounded/schemas";

const cfg = (over: Partial<GenerationConfig> = {}): GenerationConfig => ({
  gradeLevel: 7,
  blooms: "Understand",
  questionCount: 6,
  includeShortAnswers: true,
  includeOutline: true,
  subject: "General",
  language: "en",
  ...over,
});

const MATH_TEXT = SAMPLE_MATERIALS[2].text; // fractions
const SCIENCE_TEXT = SAMPLE_MATERIALS[0].text; // photosynthesis

describe("demoGenerateQuiz", () => {
  it("is deterministic — same input, same output", () => {
    const a = demoGenerateQuiz(MATH_TEXT, cfg());
    const b = demoGenerateQuiz(MATH_TEXT, cfg());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("respects the requested question count", () => {
    const quiz = demoGenerateQuiz(MATH_TEXT, cfg({ questionCount: 8 }));
    expect(quiz.questions).toHaveLength(8);
  });

  it("always produces MCQs with exactly 4 options and a valid answerIndex", () => {
    const quiz = demoGenerateQuiz(SCIENCE_TEXT, cfg({ includeShortAnswers: false }));
    for (const q of quiz.questions) {
      expect(q.type).toBe("mcq");
      expect(q.options).toHaveLength(4);
      const idx = q.answerIndex ?? -1;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
      // The correct option must be non-empty and appear exactly once.
      const answer = q.options![idx];
      expect(answer.trim().length).toBeGreaterThan(0);
      expect(q.options!.filter((o) => o === answer)).toHaveLength(1);
    }
  });

  it("never crosses domains: a math quiz gets no science distractors", () => {
    const quiz = demoGenerateQuiz(MATH_TEXT, cfg({ includeShortAnswers: false, subject: "Mathematics" }));
    const forbidden = ["photosynthesis", "chloroplast", "stomata", "chlorophyll"];
    for (const q of quiz.questions) {
      for (const opt of q.options ?? []) {
        for (const f of forbidden) {
          expect(opt.toLowerCase()).not.toContain(f);
        }
      }
    }
  });

  it("produces short-answer questions with reference keys when requested", () => {
    const quiz = demoGenerateQuiz(SCIENCE_TEXT, cfg());
    const shorts = quiz.questions.filter((q) => q.type === "short");
    expect(shorts.length).toBeGreaterThan(0);
    for (const s of shorts) {
      expect((s.answerKey ?? "").length).toBeGreaterThan(10);
    }
  });

  it("grounds MCQs in a verbatim sourceQuote from the material", () => {
    const quiz = demoGenerateQuiz(SCIENCE_TEXT, cfg({ includeShortAnswers: false }));
    expect(quiz.questions.length).toBeGreaterThan(0);
    for (const q of quiz.questions) {
      expect(q.sourceQuote).toBeTruthy();
      // The quote must be copied from the material, not invented.
      expect(SCIENCE_TEXT).toContain(
        (q.sourceQuote ?? "").replace(/…$/, "").trim(),
      );
    }
  });
});

describe("demoGenerateLessonPlan", () => {
  it("builds a structured plan with timed sections and differentiation", () => {
    const plan = demoGenerateLessonPlan(SCIENCE_TEXT, cfg());
    expect(plan.title.length).toBeGreaterThan(3);
    expect(plan.objectives.length).toBeGreaterThanOrEqual(3);
    expect(plan.sections.length).toBeGreaterThanOrEqual(4);
    for (const s of plan.sections) {
      expect(s.heading.length).toBeGreaterThan(0);
      expect(s.minutes).toBeGreaterThan(0);
      expect(s.teacherDoes.length).toBeGreaterThan(5);
      expect(s.studentsDo.length).toBeGreaterThan(5);
    }
    expect(plan.homework.length).toBeGreaterThan(5);
    expect(plan.support.length).toBeGreaterThan(5);
    expect(plan.extension.length).toBeGreaterThan(5);
  });
});

describe("demoGenerateFlashcards", () => {
  it("builds a deck of front/back cards covering the material", () => {
    const deck = demoGenerateFlashcards(SCIENCE_TEXT, cfg());
    expect(deck.cards.length).toBeGreaterThan(3);
    for (const c of deck.cards) {
      expect(c.front.length).toBeGreaterThan(3);
      expect(c.back.length).toBeGreaterThan(3);
    }
  });

  it("never returns an empty deck", () => {
    const deck = demoGenerateFlashcards("", cfg());
    expect(deck.cards.length).toBeGreaterThanOrEqual(1);
  });
});

describe("demoExplain", () => {
  it("explains with an analogy, warmly", () => {
    const out = demoExplain("fraction", MATH_TEXT, 5);
    expect(out.explanation.length).toBeGreaterThan(20);
    expect(out.analogy.length).toBeGreaterThan(10);
  });
});

describe("demoGradeAnswer", () => {
  const ref = "Photosynthesis converts light energy into glucose in chloroplasts.";

  it("marks a keyword-rich answer correct", () => {
    const out = demoGradeAnswer(ref, "Plants use light energy to make glucose in chloroplasts.");
    expect(["correct", "partial"]).toContain(out.verdict);
  });

  it("marks an off-topic answer incorrect", () => {
    const out = demoGradeAnswer(ref, "The Himalayas are very tall mountains.");
    expect(out.verdict).toBe("incorrect");
  });

  it("gives partial credit to a rephrased half-answer", () => {
    const out = demoGradeAnswer(ref, "It is about light energy.");
    expect(["partial", "correct"]).toContain(out.verdict);
  });
});

describe("quiz shape invariants used downstream", () => {
  it("raw demo output type-checks against RawQuizResponse", () => {
    const quiz: RawQuizResponse = demoGenerateQuiz(SCIENCE_TEXT, cfg());
    expect(typeof quiz.title).toBe("string");
    expect(Array.isArray(quiz.questions)).toBe(true);
  });
});
