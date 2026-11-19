// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — prompt templates.
//
// Defaults live here; in LIVE mode they are overridden by Firebase Remote
// Config (`prompt_quiz`, `prompt_grading`) so prompts can be tuned WITHOUT
// redeploying the app — exactly the workflow Firebase recommends for AI Logic.
// ─────────────────────────────────────────────────────────────────────────────

import { LANGUAGE_LABELS, type GenerationConfig, type LanguageCode } from "./types";

/** One shared instruction for every generator: write in the requested
 *  language, simply. For English this is a no-op sentence. */
function languageInstruction(code: LanguageCode): string {
  if (code === "en") return "Write everything in clear, simple English.";
  return `Write everything in simple ${LANGUAGE_LABELS[code]} (technical terms may stay English).`;
}

export const QUIZ_SYSTEM_PROMPT = `You are GroundEd, an expert curriculum designer for school teachers.
You turn classroom material into high-quality assessments.
Rules:
- Write questions that are exactly at the requested grade level and Bloom's depth.
- Multiple-choice questions must have exactly 4 options, one clearly correct, distractors plausible but wrong.
- CRITICAL — answer-key check: before responding, re-read every MCQ and verify that its answerIndex points to the objectively, factually correct option — never to a distractor. Vary the position of the correct option across questions.
- Short-answer questions must include a concise reference answer (answerKey).
- Language: clear, age-appropriate, no trick questions, no cultural bias.
- If the material is too thin, ask nothing back — just produce the best quiz you can from what is given.
Respond ONLY with JSON matching the required schema.`;

export const GRADING_SYSTEM_PROMPT = `You are GroundEd's fair grading assistant.
You grade one student's short answer against the teacher's reference answer.
Be generous with partially-correct phrasing, strict on wrong facts.
Respond ONLY with JSON matching the required schema.`;

export const LESSON_PLAN_SYSTEM_PROMPT = `You are GroundEd's lesson-planning assistant for school teachers.
You turn classroom material into a practical, teachable lesson plan.
Rules:
- Sections must be concrete and timed; together they sum to roughly the total duration.
- "teacherDoes" and "studentsDo" are single, doable actions — never abstract.
- Include a warm-up that activates prior knowledge and a closure that checks understanding.
- Differentiation ("support" and "extension") must be specific to THIS material.
Respond ONLY with JSON matching the required schema.`;

export const FLASHCARDS_SYSTEM_PROMPT = `You are GroundEd's study-material assistant.
You turn classroom material into flashcards a student can revise from.
Rules:
- One idea per card. Fronts are terms or short questions; backs are 1-2 sentence answers.
- Cover the whole material, not just its first half.
- Age-appropriate language for the given grade level.
Respond ONLY with JSON matching the required schema.`;

export const EXPLAIN_SYSTEM_PROMPT = `You are GroundEd's patient explainer for a struggling student.
You re-explain one concept from class material in simpler words.
Rules:
- Short sentences, concrete words, zero jargon (or explain the jargon).
- Always give one everyday analogy a child would recognize.
- Never say the student is wrong or behind — encourage.
Respond ONLY with JSON matching the required schema.`;

/** Builds the user prompt for quiz generation. In image mode the image itself
 *  travels as a separate multimodal part (see aiEngine.ts) — the text below
 *  tells the model what to do with it. */
export function buildQuizPrompt(
  config: GenerationConfig,
  sourceDescription: string,
  isImage: boolean,
): string {
  const sourceIntro = isImage
    ? `The attached image is a photo/scan of classroom material (a textbook page or worksheet). Read it carefully and base every question on its actual content.`
    : `The material between <material> tags is the source text. Base every question on its actual content.`;

  const shortRule = config.includeShortAnswers
    ? `Roughly one third of the questions should be short-answer type with an answerKey.`
    : `All questions must be multiple-choice type.`;

  return `Create a quiz for a teacher.

${sourceIntro}

${isImage ? "" : `<material>\n${sourceDescription}\n</material>`}

Requirements:
- Grade level: ${config.gradeLevel} (US grade equivalence)
- Subject: ${config.subject}
- Target Bloom's level: ${config.blooms} — every question should sit at this cognitive depth
- Number of questions: ${config.questionCount}
- ${shortRule}
${config.includeOutline ? "- Also include a lesson outline (4-6 short section headings) a teacher could teach from before giving this quiz." : "- Set outline to an empty array."}
- ${languageInstruction(config.language)}
- title: a short, teacher-friendly quiz title.`;
}

/** Prompt for grading one short answer. */
export function buildGradingPrompt(
  question: string,
  referenceAnswer: string,
  studentAnswer: string,
): string {
  return `Grade this student's short answer.

Question: ${question}
Reference answer (from the teacher's quiz): ${referenceAnswer}
Student's answer: ${studentAnswer}

Verdict rules:
- correct (score 1): the student shows the key understanding, even if worded differently
- partial (score 0.5): right direction, missing the key point
- incorrect (score 0): wrong or off-topic
Write one encouraging sentence of feedback addressed to the student.`;
}

/** Prompt for lesson plan generation. */
export function buildLessonPlanPrompt(
  config: GenerationConfig,
  sourceText: string,
  isImage: boolean,
): string {
  const sourceIntro = isImage
    ? `The attached image is a photo/scan of classroom material. Base the plan on its actual content.`
    : `The material between <material> tags is the source. Base the plan on its actual content.`;
  return `Create a lesson plan for a teacher.

${sourceIntro}

${isImage ? "" : `<material>\n${sourceText}\n</material>`}

Requirements:
- Grade level: ${config.gradeLevel}
- Subject: ${config.subject}
- Total duration: about 40 minutes
- 4-6 timed sections from warm-up to closure
- ${languageInstruction(config.language)}`;
}

/** Prompt for flashcard generation. */
export function buildFlashcardsPrompt(
  config: GenerationConfig,
  sourceText: string,
  isImage: boolean,
): string {
  const sourceIntro = isImage
    ? `The attached image is a photo/scan of classroom material. Cover its key ideas.`
    : `The material between <material> tags is the source. Cover its key ideas.`;
  return `Create a flashcard deck for a student to revise this material.

${sourceIntro}

${isImage ? "" : `<material>\n${sourceText}\n</material>`}

Requirements:
- Grade level: ${config.gradeLevel}
- 8-14 cards, one idea per card
- ${languageInstruction(config.language)}`;
}

/** Prompt for re-explaining one concept at a given reading level. */
export function buildExplainPrompt(
  concept: string,
  context: string,
  readingGrade: number,
): string {
  return `A student did not understand this concept from class:

Concept: ${concept}

Context from the class material:
<context>
${context.slice(0, 4000)}
</context>

Re-explain it for a student reading at grade level ${readingGrade}. Be warm, concrete and encouraging.`;
}
