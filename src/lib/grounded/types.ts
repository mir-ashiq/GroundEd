// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — domain types
// The classroom AI that works when the internet doesn't.
// #BuildHybridAI 2026 · Firebase AI Logic hybrid inference
// ─────────────────────────────────────────────────────────────────────────────

export type ViewId = "studio" | "live" | "student";

/** Where an inference actually ran. ON_DEVICE / IN_CLOUD mirror the official
 *  `response.inferenceSource` values from the Firebase AI Logic SDK. */
export type RouteSource = "ON_DEVICE" | "IN_CLOUD" | "DEMO";

export type AIFeature =
  | "generate-quiz"
  | "generate-outline"
  | "grade-answer"
  | "regenerate-question"
  | "verify-keys"
  | "generate-lesson-plan"
  | "generate-flashcards"
  | "explain-concept";

/** One entry in the routing inspector — every AI call is logged. */
export interface RoutingEvent {
  id: string;
  ts: number;
  feature: AIFeature;
  source: RouteSource;
  model: string;
  latencyMs: number;
  inputChars: number;
  outputChars: number;
  simulated: boolean;
  offline: boolean;
  /** True when the SDK did not report inferenceSource and the source was
   *  inferred from the requested policy (surfaced honestly in the log). */
  inferred?: boolean;
  note?: string;
}

export type BloomsLevel =
  | "Remember"
  | "Understand"
  | "Apply"
  | "Analyze"
  | "Evaluate"
  | "Create";

export const BLOOMS_LEVELS: { value: BloomsLevel; hint: string }[] = [
  { value: "Remember", hint: "Recall facts and terms" },
  { value: "Understand", hint: "Explain ideas and concepts" },
  { value: "Apply", hint: "Use knowledge in new situations" },
  { value: "Analyze", hint: "Connect and compare ideas" },
  { value: "Evaluate", hint: "Judge and justify positions" },
  { value: "Create", hint: "Produce new work from knowledge" },
];

export interface QuizQuestion {
  id: string;
  type: "mcq" | "short";
  question: string;
  options?: string[];
  /** MCQ: index into options */
  answerIndex?: number;
  /** Short answer: reference answer for grading */
  answerKey?: string;
  blooms: string;
  points: number;
}

export interface Quiz {
  id: string;
  title: string;
  subject: string;
  gradeLevel: number;
  bloomsLevel: string;
  questions: QuizQuestion[];
  outline: string[];
  createdAt: number;
  sourceKind: "text" | "image";
}

export interface GenerationConfig {
  gradeLevel: number; // 3..12
  blooms: BloomsLevel;
  questionCount: number; // 3..12
  includeShortAnswers: boolean;
  includeOutline: boolean;
  subject: string;
  /** Output language for generated material (honest: cloud-tier recommended
   *  for non-English; on-device tier is English-biased and falls back). */
  language: "en" | "hi";
}

export const DEFAULT_CONFIG: GenerationConfig = {
  gradeLevel: 7,
  blooms: "Understand",
  questionCount: 6,
  includeShortAnswers: true,
  includeOutline: true,
  subject: "General",
  language: "en",
};

export const LANGUAGE_LABELS: Record<GenerationConfig["language"], string> = {
  en: "English",
  hi: "हिंदी (Hindi)",
};

export interface ImportPayload {
  kind: "text" | "image";
  text?: string;
  imageBase64?: string; // without data: prefix
  imageMime?: string; // "image/png" | "image/jpeg"
  fileName?: string;
}

export type RoutingPolicy = "auto" | "device" | "cloud";

export type ModelPhase =
  | "unknown" // browser not checked yet
  | "unavailable" // no on-device model (non-Chrome / flag off)
  | "downloadable" // model not yet on disk
  | "downloading" // initializeDeviceModel in flight
  | "ready"; // on-device inference good to go

export interface ModelStatus {
  phase: ModelPhase;
  progress: number; // 0..1
  lastChecked: number;
}

// ── Live sessions ────────────────────────────────────────────────────────────

export interface LiveSession {
  code: string; // e.g. "OAK-482"
  quiz: Quiz; // denormalised so students only read one doc
  teacherUid: string;
  status: "lobby" | "active" | "closed";
  createdAt: number;
}

export interface StudentAnswer {
  questionId: string;
  choice?: number; // MCQ
  text?: string; // short answer
}

export interface StudentSubmission {
  studentId: string;
  name: string;
  answers: StudentAnswer[];
  submittedAt: number;
  queuedOffline?: boolean;
}

export type GradedVerdict = "correct" | "partial" | "incorrect";

export interface GradedAnswer {
  questionId: string;
  studentId: string;
  score: number; // 0..1
  verdict: GradedVerdict;
  feedback: string;
  autoChecked: boolean; // deterministic MCQ key match
  aiGraded: boolean; // AI short-answer grading
  route?: RouteSource;
}

export interface LibraryEntry {
  id: string;
  title: string;
  subject: string;
  gradeLevel: number;
  questionCount: number;
  createdAt: number;
  quiz: Quiz;
}

// ── Lesson plans ─────────────────────────────────────────────────────────────

/** One timed section of a lesson plan. */
export interface LessonSection {
  heading: string;
  minutes: number;
  teacherDoes: string;
  studentsDo: string;
}

/** A full teachable lesson plan generated from the same material as quizzes. */
export interface LessonPlan {
  id: string;
  title: string;
  subject: string;
  gradeLevel: number;
  durationMin: number;
  objectives: string[];
  materials: string[];
  sections: LessonSection[];
  homework: string;
  support: string; // differentiation for struggling students
  extension: string; // differentiation for advanced students
  createdAt: number;
}

// ── Flashcards ───────────────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface FlashcardDeck {
  id: string;
  title: string;
  cards: Flashcard[];
  createdAt: number;
}

// ── Differentiated quiz variants ─────────────────────────────────────────────

export type VariantKind = "support" | "onlevel" | "extension";

/** The same material at three difficulty levels. `onlevel` is the main quiz. */
export interface QuizVariants {
  onLevel: Quiz;
  support?: Quiz; // grade − 2
  extension?: Quiz; // grade + 2
}

// ── Session history (local) ──────────────────────────────────────────────────

export interface SessionHistoryEntry {
  code: string;
  title: string;
  endedAt: number;
  students: number;
  avgMcqPct: number; // 0..100, -1 when no MCQs
  shortGraded: number;
}

// ── Mode ─────────────────────────────────────────────────────────────────────

export type AppMode = "live" | "demo";
