// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — structured-output schemas for Firebase AI Logic hybrid inference.
//
// Plain JSON Schema is used (instead of the Schema.* helpers) so the SAME
// schema object can be passed to:
//   • inCloudParams.generationConfig.responseSchema   (cloud models)
//   • onDeviceParams.promptOptions.responseConstraint (Gemini Nano via Prompt API)
// per the official hybrid structured-output guide:
// https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output
// ─────────────────────────────────────────────────────────────────────────────

/** Quiz generation schema — returned by generateContent(), parsed from
 *  response.text() which is guaranteed to be JSON thanks to the constraint. */
export const quizResponseSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short quiz title derived from the material",
    },
    outline: {
      type: "array",
      items: { type: "string" },
      description:
        "Lesson outline as 4-6 short section headings a teacher could teach from",
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["mcq", "short"] },
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Exactly 4 plausible answer options, for mcq only",
          },
          answerIndex: {
            type: "number",
            description: "0-based index of the correct option, for mcq only",
          },
          answerKey: {
            type: "string",
            description:
              "A model reference answer in 1-2 sentences, for short only",
          },
          blooms: {
            type: "string",
            enum: [
              "Remember",
              "Understand",
              "Apply",
              "Analyze",
              "Evaluate",
              "Create",
            ],
          },
        },
        required: ["type", "question", "blooms"],
      },
    },
  },
  required: ["title", "questions"],
} as const;

/** Short-answer grading schema. */
export const gradingResponseSchema = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["correct", "partial", "incorrect"] },
    score: {
      type: "number",
      description: "0 to 1 — 1 for correct, 0.5 for partial, 0 for incorrect",
    },
    feedback: {
      type: "string",
      description:
        "One encouraging sentence to the student explaining the verdict",
    },
  },
  required: ["verdict", "score", "feedback"],
} as const;

/** TypeScript shapes the schemas promise. */

export interface RawQuizQuestion {
  type: "mcq" | "short";
  question: string;
  options?: string[];
  answerIndex?: number;
  answerKey?: string;
  blooms: string;
}

export interface RawQuizResponse {
  title: string;
  outline?: string[];
  questions: RawQuizQuestion[];
}

export interface RawGradingResponse {
  verdict: "correct" | "partial" | "incorrect";
  score: number;
  feedback: string;
}

// ── Lesson plan schema (Teach tab) ───────────────────────────────────────────

export const lessonPlanSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short lesson title" },
    durationMin: {
      type: "number",
      description: "Total lesson duration in minutes (30-60)",
    },
    objectives: {
      type: "array",
      items: { type: "string" },
      description: "3-5 measurable learning objectives",
    },
    materials: {
      type: "array",
      items: { type: "string" },
      description: "Concrete materials needed (board, printouts, objects...)",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          minutes: { type: "number", description: "Minutes for this section" },
          teacherDoes: { type: "string", description: "One concrete teacher action" },
          studentsDo: { type: "string", description: "One concrete student action" },
        },
        required: ["heading", "minutes", "teacherDoes", "studentsDo"],
      },
      description: "4-6 timed sections from warm-up to closure",
    },
    homework: { type: "string", description: "One short homework task" },
    support: {
      type: "string",
      description: "A concrete adjustment for students who struggle",
    },
    extension: {
      type: "string",
      description: "A concrete challenge for students who finish early",
    },
  },
  required: ["title", "durationMin", "objectives", "sections", "homework", "support", "extension"],
} as const;

export interface RawLessonPlanResponse {
  title: string;
  durationMin: number;
  objectives: string[];
  materials?: string[];
  sections: {
    heading: string;
    minutes: number;
    teacherDoes: string;
    studentsDo: string;
  }[];
  homework: string;
  support: string;
  extension: string;
}

// ── Flashcards schema (Study tab) ────────────────────────────────────────────

export const flashcardsSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short deck title" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: {
            type: "string",
            description: "A question or term (one line)",
          },
          back: {
            type: "string",
            description: "The answer or definition (1-2 sentences)",
          },
        },
        required: ["front", "back"],
      },
      description: "8-14 study cards covering the key ideas",
    },
  },
  required: ["title", "cards"],
} as const;

export interface RawFlashcardsResponse {
  title: string;
  cards: { front: string; back: string }[];
}

// ── Explain schema (re-explain a concept at a reading level) ─────────────────

export const explainSchema = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description: "A friendly explanation, 3-5 sentences, no markdown",
    },
    analogy: {
      type: "string",
      description: "One everyday analogy a child would recognize",
    },
  },
  required: ["explanation", "analogy"],
} as const;

export interface RawExplainResponse {
  explanation: string;
  analogy: string;
}
