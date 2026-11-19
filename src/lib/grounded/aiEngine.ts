// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — the hybrid inference engine.
//
// REAL path (LIVE mode): Firebase AI Logic with hybrid inference.
//   getAI(app, { backend: new GoogleAIBackend() })
//   getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams, onDeviceParams })
//   model.generateContent(...) → result.response.inferenceSource === "ON_DEVICE" | "IN_CLOUD"
//
// Verified against the official guides (Nov 2026):
//   • https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
//   • https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
//   • https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output
//
// DEMO path: local deterministic engine (see demoEngine.ts), always badged.
//
// v2 additions:
//   • CROSS-TIER VERIFICATION — answer keys are re-derived on the OTHER tier
//     (generated on-device → verified in the cloud, and vice versa). Two
//     independent brains check every key.
//   • Lesson plans, flashcards and the explain tool — all through the same
//     hybrid engine with the same honest routing badges.
//   • Timeouts + a single cloud retry so one hung call can never freeze the UI.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import type { FirebaseApp } from "firebase/app";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import type {
  GenerativeModel,
  GenerateContentResult,
} from "firebase/ai";
import {
  firebaseEnabled,
  getFirebaseApp,
  getAppCheck,
  rcString,
} from "./firebase";
import {
  quizResponseSchema,
  gradingResponseSchema,
  lessonPlanSchema,
  flashcardsSchema,
  explainSchema,
  type RawQuizResponse,
  type RawGradingResponse,
  type RawLessonPlanResponse,
  type RawFlashcardsResponse,
  type RawExplainResponse,
} from "./schemas";
import {
  QUIZ_SYSTEM_PROMPT,
  GRADING_SYSTEM_PROMPT,
  LESSON_PLAN_SYSTEM_PROMPT,
  FLASHCARDS_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  buildQuizPrompt,
  buildGradingPrompt,
  buildLessonPlanPrompt,
  buildFlashcardsPrompt,
  buildExplainPrompt,
} from "./prompts";
import {
  demoGenerateQuiz,
  demoGenerateLessonPlan,
  demoGenerateFlashcards,
  demoExplain,
  demoGradeAnswer,
  demoDelay,
} from "./demoEngine";
import { hashStringSim } from "./rng";
import { useGrounded } from "./store";
import type {
  GenerationConfig,
  ImportPayload,
  ModelPhase,
  Quiz,
  RoutingPolicy,
  RouteSource,
} from "./types";

// ── Public result type ───────────────────────────────────────────────────────

export interface AIResult<T> {
  data: T;
  route: RouteSource;
  model: string;
  latencyMs: number;
  offline: boolean;
  simulated: boolean;
  /** True when the SDK did not report inferenceSource and we inferred it from
   *  the requested policy — surfaced in the routing log so the badge can never
   *  silently lie. */
  inferred?: boolean;
  note?: string;
}

const CLOUD_MODEL = () =>
  firebaseEnabled ? rcString("cloud_model", "gemini-3.5-flash-lite") : "demo";

/** Hard ceiling for any single model call — a hung request must never freeze
 *  the teacher's screen. Cloud calls get one automatic retry after a transient
 *  failure; the on-device tier is not retried (it either works or falls back). */
const CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("timeout")),
        ms,
      ),
    ),
  ]);
}

function friendlyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "timeout") {
    return new Error(
      "The model took too long to answer. Please try again — or switch routing to Auto in Settings.",
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

// ── Model instances (cached per mode+task+config) ────────────────────────────

const modelCache = new Map<string, GenerativeModel>();

function aiBackend() {
  // App Check is mandatory for Firebase AI Logic — initialize it before the
  // first AI call (no-op after the first time).
  if (firebaseEnabled) getAppCheck();
  return getAI(getFirebaseApp() as FirebaseApp, {
    backend: new GoogleAIBackend(),
  });
}

function modeFor(policy: RoutingPolicy) {
  switch (policy) {
    case "device":
      return InferenceMode.ONLY_ON_DEVICE;
    case "cloud":
      return InferenceMode.PREFER_IN_CLOUD;
    default:
      return InferenceMode.PREFER_ON_DEVICE;
  }
}

interface TaskSpec {
  task: "quiz" | "grading" | "lesson" | "flashcards" | "explain" | "verify";
  systemPrompt: string;
  schema: Record<string, unknown>;
  /** Multimodal tasks declare image input on the on-device session. */
  multimodal: boolean;
}

function taskSpec(
  task: TaskSpec["task"],
  systemPrompt: string,
  schema: Record<string, unknown>,
  multimodal: boolean,
): TaskSpec {
  return { task, systemPrompt, schema, multimodal };
}

const TASKS: Record<TaskSpec["task"], () => TaskSpec> = {
  quiz: () =>
    taskSpec(
      "quiz",
      rcString("prompt_quiz_system", QUIZ_SYSTEM_PROMPT),
      quizResponseSchema as Record<string, unknown>,
      true, // teachers photograph textbook pages
    ),
  grading: () =>
    taskSpec(
      "grading",
      rcString("prompt_grading_system", GRADING_SYSTEM_PROMPT),
      gradingResponseSchema as Record<string, unknown>,
      false,
    ),
  lesson: () =>
    taskSpec(
      "lesson",
      rcString("prompt_lesson_system", LESSON_PLAN_SYSTEM_PROMPT),
      lessonPlanSchema as Record<string, unknown>,
      true,
    ),
  flashcards: () =>
    taskSpec(
      "flashcards",
      rcString("prompt_flashcards_system", FLASHCARDS_SYSTEM_PROMPT),
      flashcardsSchema as Record<string, unknown>,
      true,
    ),
  explain: () =>
    taskSpec(
      "explain",
      rcString("prompt_explain_system", EXPLAIN_SYSTEM_PROMPT),
      explainSchema as Record<string, unknown>,
      false,
    ),
  verify: () =>
    taskSpec(
      "verify",
      "You are a meticulous exam reviewer. You verify answer keys against the facts.",
      {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                n: { type: "number", description: "The question number as given" },
                answerIndex: {
                  type: "number",
                  description: "0-based index of the objectively correct option",
                },
              },
              required: ["n", "answerIndex"],
            },
          },
        },
        required: ["answers"],
      } as Record<string, unknown>,
      false,
    ),
};

/**
 * Builds a hybrid GenerativeModel. The SAME structured-output schema is passed
 * to both tiers — responseSchema for the cloud model, responseConstraint for
 * the on-device model — exactly as the official structured-output guide shows.
 *
 * The cache key includes the Remote-Config-resolved system prompt and cloud
 * model id, so hot-updating those in the Firebase console takes effect on the
 * next call instead of being stuck in a stale cached model.
 */
function getHybridModel(policy: RoutingPolicy, task: TaskSpec["task"]): GenerativeModel {
  const spec = TASKS[task]();
  const cloudModel = CLOUD_MODEL();
  const key = `${policy}:${task}:${cloudModel}:${spec.systemPrompt.length}`;
  const cached = modelCache.get(key);
  if (cached) return cached;

  const model = getGenerativeModel(aiBackend(), {
    mode: modeFor(policy),
    inCloudParams: {
      model: cloudModel,
      // The cloud tier receives the same system prompt the on-device tier
      // gets via initialPrompts, so behavior stays consistent across tiers.
      systemInstruction: spec.systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: spec.schema,
        temperature: task === "verify" ? 0 : 0.6,
      },
    },
    onDeviceParams: {
      createOptions: {
        // Multimodal tasks (quiz/lesson/flashcards) may receive photographed
        // pages; text-only sessions reject image parts, so capability must
        // match the payload.
        expectedInputs: spec.multimodal
          ? [{ type: "text", languages: ["en"] }, { type: "image" }]
          : [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [
          {
            role: "system",
            content: [{ type: "text", value: spec.systemPrompt }],
          },
        ],
      },
      promptOptions: {
        responseConstraint: spec.schema,
      },
    },
  });
  // Keep the cache small: Remote Config changes create new keys naturally.
  if (modelCache.size > 24) modelCache.clear();
  modelCache.set(key, model);
  return model;
}

// ── Robust JSON extraction (models occasionally wrap JSON) ───────────────────

function parseModelJson(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

/**
 * Normalizes the SDK-reported inference source. The Firebase AI Logic SDK
 * returns the enum VALUES of InferenceSource — "on_device" / "in_cloud"
 * (lowercase) — NOT the enum KEYS. If the field is absent (older SDK), we
 * infer conservatively from the requested policy AND flag the event as
 * inferred so the routing log can say so — the badge never silently guesses.
 */
function normalizeSource(
  raw: unknown,
  policy: RoutingPolicy,
): { source: RouteSource; inferred: boolean } {
  if (raw === InferenceSource.ON_DEVICE) return { source: "ON_DEVICE", inferred: false };
  if (raw === InferenceSource.IN_CLOUD) return { source: "IN_CLOUD", inferred: false };
  return {
    source: policy === "device" ? "ON_DEVICE" : "IN_CLOUD",
    inferred: true,
  };
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** One generateContent call with timeout + (cloud tier) a single retry. */
async function callModel(
  policy: RoutingPolicy,
  task: TaskSpec["task"],
  parts: Array<Record<string, unknown>>,
): Promise<GenerateContentResult> {
  const model = getHybridModel(policy, task);
  try {
    return await withTimeout(model.generateContent(parts as never));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const transient =
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("503") ||
      msg.includes("429") ||
      msg.includes("UNAVAILABLE") ||
      msg === "timeout";
    // One retry — and only when the effective tier can be the cloud.
    if (transient && policy !== "device") {
      return await withTimeout(
        getHybridModel(policy, task).generateContent(parts as never),
      );
    }
    throw friendlyError(err);
  }
}

function modelName(source: RouteSource): string {
  return source === "ON_DEVICE"
    ? "Gemini Nano (on-device)"
    : `${CLOUD_MODEL()} (cloud)`;
}

// ── Quiz generation ──────────────────────────────────────────────────────────

export async function generateQuiz(
  payload: ImportPayload,
  config: GenerationConfig,
  policy: RoutingPolicy,
): Promise<AIResult<RawQuizResponse>> {
  const offline = isOffline();
  const started = performance.now();

  // DEMO path — local, honest, badged.
  if (!firebaseEnabled) {
    const rand = hashStringSim((payload.text ?? payload.fileName ?? "img") + config.subject);
    await demoDelay(rand);
    const data = demoGenerateQuiz(payload.text ?? "", config);
    return {
      data,
      route: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: Math.round(performance.now() - started),
      offline,
      simulated: true,
      note: "No Firebase project configured — responses are simulated locally.",
    };
  }

  // REAL path — Firebase AI Logic hybrid inference.
  const isImage = payload.kind === "image" && !!payload.imageBase64;
  const prompt = buildQuizPrompt(config, payload.text ?? "", isImage);

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (isImage) {
    parts.push({
      inlineData: {
        mimeType: payload.imageMime ?? "image/png",
        data: payload.imageBase64,
      },
    });
  }

  const result = await callModel(policy, "quiz", parts);
  const latencyMs = Math.round(performance.now() - started);
  const data = parseModelJson(result.response.text()) as RawQuizResponse;
  const { source, inferred } = normalizeSource(
    result.response.inferenceSource,
    policy,
  );

  return {
    data,
    route: source,
    model: modelName(source),
    latencyMs,
    offline,
    simulated: false,
    inferred,
    note: "Answer keys get a second pass on the OTHER tier — see the routing log.",
  };
}

// ── Cross-tier answer-key verification (v2 flagship) ─────────────────────────

/**
 * Re-derives every MCQ answer key on the OPPOSITE tier from the one that
 * generated the quiz: generated on-device → verified in the cloud, generated
 * in the cloud → verified on-device (falling back to auto when no local model
 * is present). Two independent brains, by design — a systematic mistake on one
 * tier gets caught by the other.
 *
 * Runs ASYNCHRONOUSLY after the quiz is shown; it never blocks the teacher.
 */
export async function verifyAnswerKeys(
  quiz: Quiz,
  generatedOn: RouteSource,
): Promise<{
  quiz: Quiz;
  source: RouteSource;
  model: string;
  latencyMs: number;
  corrected: number;
  crossTier: boolean;
} | null> {
  if (generatedOn === "DEMO") return null;
  const started = performance.now();
  const mcqs = quiz.questions
    .map((q) => ({ q }))
    .filter(({ q }) => q.type === "mcq" && (q.options?.length ?? 0) === 4);
  if (mcqs.length === 0) return null;

  const modelReady = useGrounded.getState().modelStatus.phase === "ready";
  // Cross-tier by design: the OTHER tier double-checks the keys. If the other
  // tier genuinely isn't available (no local model when we'd want on-device,
  // offline when we'd want cloud), fall back to auto and say so.
  let policy: RoutingPolicy;
  let crossTier = true;
  if (generatedOn === "ON_DEVICE") {
    policy = "cloud";
    if (isOffline()) {
      policy = "auto";
      crossTier = false;
    }
  } else {
    policy = "device";
    if (!modelReady) {
      policy = "auto";
      crossTier = false;
    }
  }

  const list = mcqs
    .map(
      ({ q }, n) =>
        `Q${n + 1}: ${q.question}\n${(q.options ?? [])
          .map((o, i) => `  ${i}. ${o}`)
          .join("\n")}`,
    )
    .join("\n\n");
  const prompt = `A quiz was generated for a teacher. For EVERY question below, independently determine the objectively correct option, then return its 0-based index. Do NOT copy any existing answer key — derive the correct answer yourself from the question and the options alone.

${list}

Return one answer per question, numbered exactly as given.`;

  try {
    const result = await callModel(policy, "verify", [{ text: prompt }]);
    const parsed = parseModelJson(result.response.text()) as {
      answers?: { n?: number; answerIndex?: number }[];
    };
    let corrected = 0;
    const questions = [...quiz.questions];
    for (const a of parsed.answers ?? []) {
      const n = Math.trunc(Number(a.n));
      const idx = Math.trunc(Number(a.answerIndex));
      if (!Number.isFinite(n) || n < 1 || n > mcqs.length) continue;
      if (!Number.isFinite(idx) || idx < 0 || idx > 3) continue;
      const target = mcqs[n - 1].q;
      const qi = questions.indexOf(target);
      if (qi >= 0) {
        if (questions[qi].answerIndex !== idx) corrected++;
        questions[qi] = { ...target, answerIndex: idx };
      }
    }
    const { source } = normalizeSource(result.response.inferenceSource, policy);
    return {
      quiz: { ...quiz, questions },
      source,
      model: modelName(source),
      latencyMs: Math.round(performance.now() - started),
      corrected,
      crossTier,
    };
  } catch {
    // Verification is best-effort — the original keys stay.
    return null;
  }
}

// ── Short-answer grading (privacy-critical → device-preferred) ───────────────

export async function gradeAnswer(
  question: string,
  referenceAnswer: string,
  studentAnswer: string,
  policy: RoutingPolicy,
): Promise<AIResult<RawGradingResponse>> {
  const offline = isOffline();
  const started = performance.now();

  if (!firebaseEnabled) {
    const rand = hashStringSim(studentAnswer);
    await demoDelay(rand);
    const data = demoGradeAnswer(referenceAnswer, studentAnswer);
    return {
      data,
      route: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: Math.round(performance.now() - started),
      offline,
      simulated: true,
    };
  }

  // Student answers are privacy-sensitive: when the on-device model is ready
  // we go device-ONLY so answers never leave the classroom. If the model
  // isn't ready (judge's browser, fresh device), we still try the device tier
  // first via PREFER_ON_DEVICE — the badge shows honestly where it ran.
  const modelReady = useGrounded.getState().modelStatus.phase === "ready";
  const effectivePolicy: RoutingPolicy =
    policy === "cloud" ? "cloud" : modelReady ? "device" : "auto";
  const prompt = buildGradingPrompt(question, referenceAnswer, studentAnswer);

  let result: GenerateContentResult;
  let usedPolicy = effectivePolicy;
  try {
    result = await callModel(effectivePolicy, "grading", [{ text: prompt }]);
  } catch (err) {
    // ONLY_ON_DEVICE failed (model vanished mid-session?) — retry with the
    // hybrid fallback instead of surfacing an error to the teacher.
    if (effectivePolicy === "device") {
      usedPolicy = "auto";
      result = await callModel("auto", "grading", [{ text: prompt }]);
    } else {
      throw friendlyError(err);
    }
  }
  const latencyMs = Math.round(performance.now() - started);
  const data = parseModelJson(result.response.text()) as RawGradingResponse;
  const { source, inferred } = normalizeSource(
    result.response.inferenceSource,
    usedPolicy,
  );

  return {
    data,
    route: source,
    model: modelName(source),
    latencyMs,
    offline,
    simulated: false,
    inferred,
  };
}

// ── Lesson plan generation (Teach tab) ───────────────────────────────────────

export async function generateLessonPlan(
  payload: ImportPayload,
  config: GenerationConfig,
  policy: RoutingPolicy,
): Promise<AIResult<RawLessonPlanResponse>> {
  const offline = isOffline();
  const started = performance.now();

  if (!firebaseEnabled) {
    const rand = hashStringSim((payload.text ?? "img") + "lesson");
    await demoDelay(rand);
    const data = demoGenerateLessonPlan(payload.text ?? "", config);
    return {
      data,
      route: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: Math.round(performance.now() - started),
      offline,
      simulated: true,
      note: "No Firebase project configured — responses are simulated locally.",
    };
  }

  const isImage = payload.kind === "image" && !!payload.imageBase64;
  const prompt = buildLessonPlanPrompt(config, payload.text ?? "", isImage);
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (isImage) {
    parts.push({
      inlineData: {
        mimeType: payload.imageMime ?? "image/png",
        data: payload.imageBase64,
      },
    });
  }
  const result = await callModel(policy, "lesson", parts);
  const data = parseModelJson(result.response.text()) as RawLessonPlanResponse;
  const { source, inferred } = normalizeSource(
    result.response.inferenceSource,
    policy,
  );
  return {
    data,
    route: source,
    model: modelName(source),
    latencyMs: Math.round(performance.now() - started),
    offline,
    simulated: false,
    inferred,
  };
}

// ── Flashcards generation (Study tab) ────────────────────────────────────────

export async function generateFlashcards(
  payload: ImportPayload,
  config: GenerationConfig,
  policy: RoutingPolicy,
): Promise<AIResult<RawFlashcardsResponse>> {
  const offline = isOffline();
  const started = performance.now();

  if (!firebaseEnabled) {
    const rand = hashStringSim((payload.text ?? "img") + "cards");
    await demoDelay(rand);
    const data = demoGenerateFlashcards(payload.text ?? "", config);
    return {
      data,
      route: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: Math.round(performance.now() - started),
      offline,
      simulated: true,
      note: "No Firebase project configured — responses are simulated locally.",
    };
  }

  const isImage = payload.kind === "image" && !!payload.imageBase64;
  const prompt = buildFlashcardsPrompt(config, payload.text ?? "", isImage);
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (isImage) {
    parts.push({
      inlineData: {
        mimeType: payload.imageMime ?? "image/png",
        data: payload.imageBase64,
      },
    });
  }
  const result = await callModel(policy, "flashcards", parts);
  const data = parseModelJson(result.response.text()) as RawFlashcardsResponse;
  const { source, inferred } = normalizeSource(
    result.response.inferenceSource,
    policy,
  );
  return {
    data,
    route: source,
    model: modelName(source),
    latencyMs: Math.round(performance.now() - started),
    offline,
    simulated: false,
    inferred,
  };
}

// ── Explain tool (device-first, for privacy) ─────────────────────────────────

export async function explainConcept(
  concept: string,
  context: string,
  readingGrade: number,
  policy: RoutingPolicy,
): Promise<AIResult<RawExplainResponse>> {
  const offline = isOffline();
  const started = performance.now();

  if (!firebaseEnabled) {
    const rand = hashStringSim(concept);
    await demoDelay(rand);
    const data = demoExplain(concept, context, readingGrade);
    return {
      data,
      route: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: Math.round(performance.now() - started),
      offline,
      simulated: true,
    };
  }

  // Explanations are student-facing: prefer the device tier when possible.
  const modelReady = useGrounded.getState().modelStatus.phase === "ready";
  const effectivePolicy: RoutingPolicy =
    policy === "cloud" ? "cloud" : modelReady ? "device" : "auto";
  const prompt = buildExplainPrompt(concept, context, readingGrade);
  let result: GenerateContentResult;
  let usedPolicy = effectivePolicy;
  try {
    result = await callModel(effectivePolicy, "explain", [{ text: prompt }]);
  } catch (err) {
    if (effectivePolicy === "device") {
      usedPolicy = "auto";
      result = await callModel("auto", "explain", [{ text: prompt }]);
    } else {
      throw friendlyError(err);
    }
  }
  const data = parseModelJson(result.response.text()) as RawExplainResponse;
  const { source, inferred } = normalizeSource(
    result.response.inferenceSource,
    usedPolicy,
  );
  return {
    data,
    route: source,
    model: modelName(source),
    latencyMs: Math.round(performance.now() - started),
    offline,
    simulated: false,
    inferred,
  };
}

// ── On-device model preparation (MUST be user-gesture initiated) ─────────────

/**
 * Triggers the Gemini Nano download via model.initializeDeviceModel().
 * Chrome requires this to happen on an end-user interaction (a button click),
 * and it must complete before on-device queries are served.
 */
export async function prepareDeviceModel(
  policy: RoutingPolicy,
  onProgress: (p: number) => void,
): Promise<boolean> {
  if (!firebaseEnabled) return false;
  try {
    const model = getHybridModel(policy, "quiz");
    await model.initializeDeviceModel(onProgress);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks Chrome's Prompt API availability for the on-device model.
 * Values: 'available' | 'downloading' | 'downloadable' | 'unavailable'.
 */
export async function checkDeviceAvailability(): Promise<{
  phase: ModelPhase;
  raw?: string;
}> {
  if (typeof window === "undefined") return { phase: "unknown" };
  const w = window as unknown as Record<string, unknown>;
  const lm =
    (w.LanguageModel as
      | { availability: () => Promise<string> }
      | undefined) ??
    ((w.ai as { languageModel?: { availability: () => Promise<string> } } | undefined)
      ?.languageModel);
  if (!lm || typeof lm.availability !== "function") {
    return { phase: "unavailable", raw: "no-api" };
  }
  try {
    const raw = await lm.availability();
    const phase: ModelPhase =
      raw === "available"
        ? "ready"
        : raw === "downloading"
          ? "downloading"
          : raw === "downloadable"
            ? "downloadable"
            : "unavailable";
    return { phase, raw };
  } catch {
    return { phase: "unavailable" };
  }
}
