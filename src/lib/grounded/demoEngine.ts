// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — DEMO engine.
//
// Runs ONLY when no Firebase project is configured (local dev / preview).
// It is a deterministic, fully local template generator — NOT a real model.
// Every response it produces is labelled "DEMO" in the UI and routing log,
// so the demo experience is never confused with live inference.
//
// v2: the demo path is often the FIRST thing a reviewer runs (npm install &&
// npm run dev with zero config), so it is held to product quality:
//   • subject-aware distractors (no cross-domain nonsense options)
//   • full lesson-plan + flashcard + explain simulations
//   • rawToQuiz validates and repairs malformed model output (used by LIVE too)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GenerationConfig,
  Quiz,
  QuizQuestion,
} from "./types";
import type {
  RawQuizResponse,
  RawGradingResponse,
  RawLessonPlanResponse,
  RawFlashcardsResponse,
  RawExplainResponse,
} from "./schemas";

// ── tiny seeded RNG so demo output is stable per input ───────────────────────
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPWORDS = new Set(
  `the a an and or but if then than that this these those of in on at to for from by with without into onto about above below over under again further once here there when where why how all any both each few more most other some such no nor not only own same so too very can will just don should now is are was were be been being has have had do does did it its it's their they them he she his her we our you your i as also which who whom whose what while during before after between within upon per via due like unlike each every either neither because although however therefore thus hence since until unless whether across along among around behind beneath beside beyond despite except inside near outside past regarding through throughout toward under until up down out off again still yet even ever never always sometimes often rarely usually`.split(
    /\s+/,
  ),
);

interface Sentence {
  text: string;
  terms: string[];
}

function splitSentences(text: string): Sentence[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  return parts.map((s) => ({
    text: s,
    terms: extractTerms(s),
  }));
}

function extractTerms(sentence: string): string[] {
  return Array.from(
    new Set(
      sentence
        .replace(/[^A-Za-z0-9\s'-]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(
          (w) =>
            w.length > 4 &&
            !STOPWORDS.has(w.toLowerCase()) &&
            !/^\d+$/.test(w),
        ),
    ),
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const BLOOMS_LADDER = [
  "Remember",
  "Understand",
  "Understand",
  "Apply",
  "Apply",
  "Analyze",
];

// ── Subject-aware filler pools (v2 fix: distractors must never cross domains) ─

type SubjectKind = "science" | "math" | "history" | "language" | "general";

const SUBJECT_FILLERS: Record<SubjectKind, string[]> = {
  science: ["molecule", "gravity", "enzyme", "ecosystem", "nucleus"],
  math: ["denominator", "quotient", "integer", "polygon", "variable"],
  history: ["empire", "treaty", "dynasty", "colony", "renaissance"],
  language: ["metaphor", "syllable", "noun", "stanza", "synonym"],
  general: ["concept", "method", "example", "process", "detail"],
};

function subjectKind(text: string, subject: string): SubjectKind {
  const s = `${subject} ${text.slice(0, 600)}`.toLowerCase();
  if (/(photosynth|chloroph|cell|molecule|energy|gravity|enzyme|planet|ecosystem|science|react)/.test(s))
    return "science";
  if (/(fraction|number|equation|geometry|multiply|denominator|mathematic|algebra|triangle)/.test(s))
    return "math";
  if (/(dynasty|empire|war|trade|century|history|king|kingdom|treaty|ancient)/.test(s))
    return "history";
  if (/(poem|metaphor|grammar|sentence|paragraph|poetry|literatur)/.test(s))
    return "language";
  return "general";
}

/** Curated sample material — used by the "Try a sample" chips in the UI. */
export const SAMPLE_MATERIALS: { label: string; subject: string; text: string }[] = [
  {
    label: "Photosynthesis (Science, Gr 7)",
    subject: "Science",
    text: `Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy stored in glucose. It happens mainly in the leaves, inside organelles called chloroplasts, which contain the green pigment chlorophyll. Chlorophyll absorbs sunlight, and the plant takes in carbon dioxide through tiny pores called stomata on the underside of leaves. Water is absorbed by the roots and travels up through the xylem. During the light-dependent reactions, sunlight splits water molecules, releasing oxygen as a by-product. In the Calvin cycle, carbon dioxide is fixed into glucose using the energy carried by ATP and NADPH. Photosynthesis is fundamental to life on Earth because it produces the oxygen we breathe and forms the base of nearly every food chain.`,
  },
  {
    label: "The Silk Road (History, Gr 8)",
    subject: "History",
    text: `The Silk Road was an ancient network of trade routes that connected China with the Middle East, India, and Europe. It opened during the Han Dynasty around 130 BCE and remained active for more than 1,500 years. Merchants travelled in caravans, exchanging silk, spices, tea, jade, and paper for horses, glassware, gold, and silver. Beyond goods, the Silk Road carried ideas: Buddhism spread from India to China, while technologies such as papermaking and gunpowder moved westward. Oasis cities like Samarkand and Kashgar grew wealthy as resting points for traders. The route declined after sea trade expanded in the fifteenth century, but it remains a powerful symbol of cultural exchange between East and West.`,
  },
  {
    label: "Fractions in Daily Life (Math, Gr 5)",
    subject: "Mathematics",
    text: `A fraction represents a part of a whole. The bottom number, called the denominator, tells how many equal parts the whole is divided into. The top number, called the numerator, tells how many of those parts we have. When two fractions represent the same amount, like one half and two quarters, they are called equivalent fractions. To add fractions with the same denominator, we add the numerators and keep the denominator the same. When denominators differ, we first rewrite the fractions with a common denominator. Fractions appear everywhere in daily life: cooks measure half a cup of flour, musicians count quarter notes, and carpenters cut boards into thirds. Understanding fractions helps us divide pizza fairly, share supplies equally, and read rulers accurately.`,
  },
];

/** Generate a quiz locally (template-based, deterministic). */
export function demoGenerateQuiz(
  text: string,
  config: GenerationConfig,
): RawQuizResponse {
  const rand = mulberry32(hashString(text + config.gradeLevel + config.blooms));
  const sentences = splitSentences(text);
  const allTerms = Array.from(
    new Set(sentences.flatMap((s) => s.terms)),
  ).sort((a, b) => b.length - a.length);

  const title =
    sentences.length > 0
      ? titleCase(
          sentences[0].text.split(" ").slice(0, 6).join(" ").replace(/[.,]$/, ""),
        )
      : `${config.subject} Quiz`;

  const outline = buildOutline(sentences, config);

  const questions: RawQuizResponse["questions"] = [];
  const mcqCount = config.includeShortAnswers
    ? Math.max(1, Math.round(config.questionCount * 0.66))
    : config.questionCount;
  const shortCount = config.questionCount - mcqCount;

  const usable = sentences.filter((s) => s.terms.length >= 2);
  const fillers = SUBJECT_FILLERS[subjectKind(text, config.subject)];

  // MCQs: cloze questions with distractors from other key terms.
  for (let i = 0; i < mcqCount; i++) {
    const s = usable[i % Math.max(1, usable.length)] ?? { text: text.slice(0, 140), terms: allTerms.slice(0, 4) };
    const answer = s.terms[i % Math.max(1, s.terms.length)] ?? allTerms[0] ?? "concept";
    const seen = new Set([answer.toLowerCase()]);
    const distractors: string[] = [];
    // Distractors first from the SAME material (plausible, same domain)…
    for (const t of allTerms) {
      if (distractors.length >= 3) break;
      if (seen.has(t.toLowerCase())) continue;
      if (t.toLowerCase().includes(answer.toLowerCase())) continue;
      if (answer.toLowerCase().includes(t.toLowerCase())) continue;
      if (rand() > 0.3) {
        distractors.push(t);
        seen.add(t.toLowerCase());
      }
    }
    // …then from the subject-aware pool (v2: never cross-domain nonsense).
    for (const f of fillers) {
      if (distractors.length >= 3) break;
      if (seen.has(f)) continue;
      distractors.push(titleCase(f));
      seen.add(f);
    }
    const options = [answer, ...distractors];
    // shuffle deterministically
    for (let k = options.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [options[k], options[j]] = [options[j], options[k]];
    }
    const answerIndex = options.indexOf(answer);
    const blanked = s.text.replace(
      new RegExp(answer, "i"),
      "________",
    );
    questions.push({
      type: "mcq",
      question: `Fill in the blank: ${blanked}`,
      options,
      answerIndex: answerIndex >= 0 ? answerIndex : 0,
      blooms:
        config.blooms === "Remember" || config.blooms === "Understand"
          ? config.blooms
          : BLOOMS_LADDER[i % BLOOMS_LADDER.length],
    });
  }

  // Short answers: "explain X in your own words".
  for (let i = 0; i < shortCount; i++) {
    const s = usable[(mcqCount + i) % Math.max(1, usable.length)];
    const term = s?.terms[0] ?? allTerms[i % Math.max(1, allTerms.length)] ?? "the main idea";
    questions.push({
      type: "short",
      question: `In your own words, explain the role of ${term.toLowerCase()} in this material.`,
      answerKey: s
        ? s.text
        : `A good answer mentions ${term.toLowerCase()} and its role in the material.`,
      blooms: config.blooms,
    });
  }

  return { title, outline, questions };
}

function buildOutline(sentences: Sentence[], config: GenerationConfig): string[] {
  // Build the outline from the actual opening words of key sentences — real
  // English fragments rather than smashed-together terms.
  const groups = Math.min(6, Math.max(4, Math.ceil(sentences.length / 2)));
  const step = Math.max(1, Math.floor(sentences.length / groups));
  const out: string[] = [];
  for (let i = 0; i < sentences.length && out.length < groups; i += step) {
    const words = sentences[i].text.replace(/^[^A-Za-z0-9]+/, "").split(/\s+/);
    const fragment = words.slice(0, 6).join(" ").replace(/[,;:]$/, "");
    out.push(fragment.length > 8 ? fragment : `Part ${out.length + 1}`);
  }
  while (out.length < 4) {
    out.push(`Review: key ideas in ${config.subject.toLowerCase()}`);
  }
  return out;
}

/** Demo short-answer grading — stemmed keyword-overlap heuristic (v2: a
 *  correctly rephrased answer now scores partial credit at minimum). */
export function demoGradeAnswer(
  reference: string,
  studentAnswer: string,
): RawGradingResponse {
  const stem = (w: string) =>
    w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w;
  const refTerms = new Set(
    reference
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w))
      .map(stem),
  );
  const studentTerms = studentAnswer
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOPWORDS.has(w))
    .map(stem);
  if (studentTerms.length === 0 || refTerms.size === 0) {
    return {
      verdict: "incorrect",
      score: 0,
      feedback: "Try to answer using your own words from the lesson.",
    };
  }
  const hits = studentTerms.filter((w) => refTerms.has(w)).length;
  const ratio = hits / Math.max(3, Math.min(refTerms.size, 6));
  if (ratio >= 0.6) {
    return {
      verdict: "correct",
      score: 1,
      feedback: "Nice work — you captured the key idea clearly.",
    };
  }
  if (ratio >= 0.25) {
    return {
      verdict: "partial",
      score: 0.5,
      feedback: "You are on the right track — add the missing key idea.",
    };
  }
  return {
    verdict: "incorrect",
    score: 0,
    feedback: "Not quite — revisit the reference idea from the lesson.",
  };
}

// ── Demo lesson plan ──────────────────────────────────────────────────────────

export function demoGenerateLessonPlan(
  text: string,
  config: GenerationConfig,
): RawLessonPlanResponse {
  const sentences = splitSentences(text);
  const usable = sentences.filter((s) => s.terms.length >= 2);
  const key = (i: number) =>
    usable[i]?.terms[0]?.toLowerCase() ??
    sentences[i]?.terms[0]?.toLowerCase() ??
    "the main idea";
  const firstWords = (i: number) => {
    const words = (sentences[i]?.text ?? text)
      .replace(/^[^A-Za-z0-9]+/, "")
      .split(/\s+/)
      .slice(0, 5)
      .join(" ");
    return words.length > 10 ? words : `part ${i + 1}`;
  };
  return {
    title: `${titleCase(config.subject)}: ${titleCase(firstWords(0))}`,
    durationMin: 40,
    objectives: [
      `Students can explain ${key(0)} in their own words.`,
      `Students can give one example of ${key(1) ?? key(0)} from the material.`,
      `Students can describe how ${key(0)} connects to ${key(2) ?? key(0)}.`,
    ],
    materials: [
      "Board and markers",
      "Printed copies of the material",
      "Notebooks and pencils",
    ],
    sections: [
      {
        heading: "Warm-up (5 min)",
        minutes: 5,
        teacherDoes: `Ask students what they already know about ${key(0)}.`,
        studentsDo: "Share one idea from memory with a partner.",
      },
      {
        heading: `Core idea: ${firstWords(0)} (15 min)`,
        minutes: 15,
        teacherDoes: `Explain ${key(0)} using the material, writing key terms on the board.`,
        studentsDo: "Copy the key terms and draw a quick sketch of the idea.",
      },
      {
        heading: `Guided practice (10 min)`,
        minutes: 10,
        teacherDoes: `Work through one example of ${key(1) ?? key(0)} together.`,
        studentsDo: "Solve a similar example in pairs.",
      },
      {
        heading: "Check understanding (5 min)",
        minutes: 5,
        teacherDoes: "Ask two quick oral questions from the material.",
        studentsDo: "Answer on mini-slates or orally.",
      },
      {
        heading: "Closure (5 min)",
        minutes: 5,
        teacherDoes: "Summarise the lesson in three sentences.",
        studentsDo: "Write one sentence: the most surprising thing I learned.",
      },
    ],
    homework: `Draw and label a diagram of ${key(0)} and write three sentences about why it matters.`,
    support: `Give a word bank with the key terms (${key(0)}, ${key(1) ?? key(0)}) and allow answers in point form.`,
    extension: `Ask advanced students to compare ${key(0)} with ${key(2) ?? "a related idea"} and present one difference to the class.`,
  };
}

// ── Demo flashcards ───────────────────────────────────────────────────────────

export function demoGenerateFlashcards(
  text: string,
  config: GenerationConfig,
): RawFlashcardsResponse {
  const sentences = splitSentences(text);
  const usable = sentences.filter((s) => s.terms.length >= 1);
  const cards = usable.slice(0, 12).map((s, i) => {
    const term = s.terms[0] ?? `idea ${i + 1}`;
    return {
      front: `What is ${term.toLowerCase()}?`,
      back: s.text.length > 160 ? `${s.text.slice(0, 157)}…` : s.text,
    };
  });
  return {
    title: `${config.subject} revision deck`,
    cards:
      cards.length > 0
        ? cards
        : [
            {
              front: "What is this material about?",
              back: text.slice(0, 160) || "Paste some material to build a deck.",
            },
          ],
  };
}

// ── Demo explain ──────────────────────────────────────────────────────────────

export function demoExplain(
  concept: string,
  context: string,
  readingGrade: number,
): RawExplainResponse {
  const sentences = splitSentences(context);
  const hit = sentences.find((s) =>
    s.text.toLowerCase().includes(concept.toLowerCase().split(" ")[0] ?? ""),
  );
  const base = hit?.text ?? sentences[0]?.text ?? context.slice(0, 200);
  return {
    explanation: `Think of it like this: ${base.replace(/^./, (c) => c.toUpperCase())} In short, ${concept} is the part of this lesson that the other ideas depend on — once it clicks, the rest gets easier.`,
    analogy:
      readingGrade <= 5
        ? `It is a bit like the rule of a game: once you know the rule, every move afterwards makes sense.`
        : `It is like the foundation of a building — you do not always see it, but everything above it stands on it.`,
  };
}

/** Demo latency so the UX mirrors a real inference round-trip. */
export function demoDelay(rand: () => number): Promise<void> {
  return new Promise((r) => setTimeout(r, 700 + Math.floor(rand() * 900)));
}

// ── Quiz repair layer (used by BOTH demo and live paths) ─────────────────────

/** Normalize a model-generated MCQ so it is always student-renderable:
 *  exactly 4 options, a valid answerIndex pointing at a real option, and
 *  options containing the correct answer. Unrepairable MCQs degrade to
 *  short-answer questions instead of rendering empty buttons. */
function repairMcq(q: {
  question: string;
  options?: string[];
  answerIndex?: number;
  blooms?: string;
}): { ok: true; options: string[]; answerIndex: number } | { ok: false } {
  let options = (q.options ?? [])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o.length > 0);
  let answerIndex =
    typeof q.answerIndex === "number" &&
    Number.isInteger(q.answerIndex) &&
    q.answerIndex >= 0 &&
    q.answerIndex < options.length
      ? q.answerIndex
      : 0;

  if (options.length === 0) return { ok: false };

  if (options.length > 4) {
    // Keep the correct option + the first three others.
    const correct = options[answerIndex];
    const rest = options.filter((_, i) => i !== answerIndex).slice(0, 3);
    options = [correct, ...rest];
    answerIndex = 0;
  }
  while (options.length < 4) {
    // Pad with clearly-labelled neutral options rather than nonsense.
    options.push(
      ["None of these", "All of these", "Cannot say"][options.length % 3],
    );
  }
  return { ok: true, options, answerIndex };
}

/** Near-duplicate detection — model output occasionally repeats a question.
 *  Numeral tokens are KEPT (unlike stopword stripping) so "What is 3 + 4?"
 *  and "What is 5 + 6?" never collapse into one. */
function isDuplicate(question: string, seen: string[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 || /^\d+$/.test(w))
      .sort()
      .join(" ");
  const n = norm(question);
  return seen.some((s) => {
    const a = norm(s);
    if (a === n) return true;
    if (a.length < 12 || n.length < 12) return false;
    // 80% token overlap counts as a duplicate.
    const at = new Set(a.split(" "));
    const nt = n.split(" ");
    const overlap = nt.filter((t) => at.has(t)).length / nt.length;
    return overlap >= 0.8;
  });
}

/** Convert raw model/demo response to a Quiz domain object.
 *
 *  v2: every question passes the repair layer — MCQs always render exactly 4
 *  options with a valid key; malformed MCQs degrade to short answers;
 *  near-duplicates are dropped. Firestore-safe (no undefined at any depth).
 */
export function rawToQuiz(
  raw: RawQuizResponse,
  config: GenerationConfig,
  sourceKind: "text" | "image",
): Quiz {
  const seen: string[] = [];
  const questions: QuizQuestion[] = [];
  for (const q of (raw.questions ?? []).slice(0, config.questionCount)) {
    const text = typeof q.question === "string" ? q.question.trim() : "";
    if (!text) continue;
    if (isDuplicate(text, seen)) continue;
    seen.push(text);

    const base = {
      id: `q_${questions.length + 1}`,
      blooms: q.blooms || config.blooms,
      points: 10,
    };
    if (q.type === "mcq") {
      const repaired = repairMcq(q);
      if (repaired.ok) {
        questions.push({
          ...base,
          type: "mcq",
          question: text,
          options: repaired.options,
          answerIndex: repaired.answerIndex,
        });
        continue;
      }
      // Degrade gracefully: unrepairable MCQ becomes a short answer whose
      // reference is the originally-marked option (or empty).
      const fallbackKey =
        (q.options ?? [])[typeof q.answerIndex === "number" ? q.answerIndex : 0] ?? "";
      questions.push({
        ...base,
        type: "short",
        question: text,
        answerKey: fallbackKey,
      });
    } else {
      questions.push({
        ...base,
        type: "short",
        question: text,
        answerKey: q.answerKey ?? "",
      });
    }
  }
  return {
    id: `quiz_${Date.now().toString(36)}`,
    title: raw.title || `${config.subject} Quiz`,
    subject: config.subject,
    gradeLevel: config.gradeLevel,
    bloomsLevel: config.blooms,
    outline: raw.outline ?? [],
    sourceKind,
    createdAt: Date.now(),
    questions,
  };
}
