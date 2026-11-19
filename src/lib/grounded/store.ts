// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — global client state (Zustand).
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { create } from "zustand";
import type {
  AppMode,
  FlashcardDeck,
  GenerationConfig,
  GradedAnswer,
  ImportPayload,
  KeyVerification,
  LessonPlan,
  LiveSession,
  ModelStatus,
  Quiz,
  QuizVariants,
  RoutingEvent,
  RoutingPolicy,
  SessionHistoryEntry,
  SessionStudent,
  StudentSubmission,
  ViewId,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

const ROUTING_LOG_KEY = "grounded:routing-log";
const HISTORY_KEY = "grounded:history";

/** localStorage helpers — SSR-safe and quota-safe. */
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota/blocked — state still works in-memory for this session */
  }
}

interface GroundedState {
  // navigation
  view: ViewId;
  setView: (v: ViewId) => void;
  joinCodePrefill: string;
  setJoinCodePrefill: (code: string) => void;

  // generation
  importPayload: ImportPayload | null;
  setImportPayload: (p: ImportPayload | null) => void;
  config: GenerationConfig;
  setConfig: (patch: Partial<GenerationConfig>) => void;
  quiz: Quiz | null;
  setQuiz: (q: Quiz | null) => void;
  generating: boolean;
  setGenerating: (v: boolean) => void;
  lastRoute: RoutingEvent | null;
  /** Cross-tier verification state of the current quiz (chip in Studio). */
  keyVerification: KeyVerification | null;
  setKeyVerification: (v: KeyVerification | null) => void;

  // v2 — lesson plan / flashcards / differentiated variants
  lessonPlan: LessonPlan | null;
  setLessonPlan: (p: LessonPlan | null) => void;
  planGenerating: boolean;
  setPlanGenerating: (v: boolean) => void;
  deck: FlashcardDeck | null;
  setDeck: (d: FlashcardDeck | null) => void;
  deckGenerating: boolean;
  setDeckGenerating: (v: boolean) => void;
  /** Differentiated versions of the current material. onLevel mirrors `quiz`
   *  at generation time so teachers can switch levels losslessly. */
  variants: QuizVariants | null;
  setVariants: (v: QuizVariants | null) => void;
  variantsBusy: "support" | "extension" | null;
  setVariantsBusy: (v: "support" | "extension" | null) => void;

  // routing log (inspector) — persisted so refresh keeps the evidence
  routingLog: RoutingEvent[];
  pushRoutingEvent: (e: RoutingEvent) => void;
  clearRoutingLog: () => void;
  /** Re-read persisted state from localStorage AFTER mount. Persisted slices
   *  must start empty and rehydrate post-hydration — loading them during store
   *  creation makes the first client render diverge from the prerendered HTML
   *  (React hydration error #418 on every reload with saved data). */
  rehydratePersisted: () => void;

  // model status
  modelStatus: ModelStatus;
  setModelStatus: (patch: Partial<ModelStatus>) => void;

  // live session
  session: LiveSession | null;
  setSession: (s: LiveSession | null) => void;
  submissions: StudentSubmission[];
  setSubmissions: (subs: StudentSubmission[]) => void;
  /** Students present in the active session (roster, before submissions). */
  roster: SessionStudent[];
  setRoster: (students: SessionStudent[]) => void;
  graded: Record<string, GradedAnswer>;
  setGraded: (g: GradedAnswer) => void;
  sessionHistory: SessionHistoryEntry[];
  pushSessionHistory: (e: SessionHistoryEntry) => void;

  // settings
  routingPolicy: RoutingPolicy;
  setRoutingPolicy: (p: RoutingPolicy) => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  showDemoBanner: boolean;
  dismissDemoBanner: () => void;
}

function loadRoutingLog(): RoutingEvent[] {
  if (typeof window === "undefined") return [];
  return loadJson<RoutingEvent[]>(ROUTING_LOG_KEY, []);
}
function loadHistory(): SessionHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return loadJson<SessionHistoryEntry[]>(HISTORY_KEY, []);
}

export const useGrounded = create<GroundedState>((set) => ({
  view: "studio",
  setView: (v) => set({ view: v }),
  joinCodePrefill: "",
  setJoinCodePrefill: (code) => set({ joinCodePrefill: code }),

  importPayload: null,
  setImportPayload: (p) => set({ importPayload: p }),
  config: DEFAULT_CONFIG,
  setConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch } })),
  quiz: null,
  setQuiz: (q) => set({ quiz: q }),
  generating: false,
  setGenerating: (v) => set({ generating: v }),
  lastRoute: null,
  keyVerification: null,
  setKeyVerification: (v) => set({ keyVerification: v }),

  lessonPlan: null,
  setLessonPlan: (p) => set({ lessonPlan: p }),
  planGenerating: false,
  setPlanGenerating: (v) => set({ planGenerating: v }),
  deck: null,
  setDeck: (d) => set({ deck: d }),
  deckGenerating: false,
  setDeckGenerating: (v) => set({ deckGenerating: v }),
  variants: null,
  setVariants: (v) => set({ variants: v }),
  variantsBusy: null,
  setVariantsBusy: (v) => set({ variantsBusy: v }),

  routingLog: [],
  pushRoutingEvent: (e) =>
    set((s) => {
      const log = [e, ...s.routingLog].slice(0, 200);
      if (typeof window !== "undefined") saveJson(ROUTING_LOG_KEY, log);
      return { routingLog: log, lastRoute: e };
    }),
  clearRoutingLog: () => {
    if (typeof window !== "undefined") saveJson(ROUTING_LOG_KEY, []);
    set({ routingLog: [], lastRoute: null });
  },

  modelStatus: { phase: "unknown", progress: 0, lastChecked: 0 },
  setModelStatus: (patch) =>
    set((s) => ({ modelStatus: { ...s.modelStatus, ...patch } })),

  session: null,
  setSession: (s) => set({ session: s }),
  submissions: [],
  setSubmissions: (subs) => set({ submissions: subs }),
  roster: [],
  setRoster: (students) => set({ roster: students }),
  graded: {},
  setGraded: (g) =>
    set((s) => ({ graded: { ...s.graded, [`${g.studentId}:${g.questionId}`]: g } })),
  sessionHistory: [],
  pushSessionHistory: (e) =>
    set((s) => {
      const history = [e, ...s.sessionHistory].slice(0, 50);
      if (typeof window !== "undefined") saveJson(HISTORY_KEY, history);
      return { sessionHistory: history };
    }),

  routingPolicy: "auto",
  setRoutingPolicy: (p) => set({ routingPolicy: p }),
  mode: "demo",
  setMode: (m) => set({ mode: m }),
  showDemoBanner: true,
  dismissDemoBanner: () => set({ showDemoBanner: false }),

  rehydratePersisted: () =>
    set({
      routingLog: loadRoutingLog(),
      sessionHistory: loadHistory(),
    }),
}));

/** Non-hook accessor for use inside event handlers. */
export const groundedStore = useGrounded;
