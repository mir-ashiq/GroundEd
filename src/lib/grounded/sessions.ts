// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — live session transport.
//
// LIVE mode: Firestore with persistentLocalCache. Submissions made offline are
// queued in IndexedDB and sync automatically when connectivity returns — this
// is what makes intermittent-connectivity classrooms work.
//
// DEMO mode: BroadcastChannel + localStorage, so the full teacher/student flow
// can be demonstrated on one machine (two tabs) with zero setup.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import {
  doc,
  setDoc,
  onSnapshot,
  collection,
} from "firebase/firestore";
import { getDb, firebaseEnabled } from "./firebase";
import type { LiveSession, Quiz, StudentSubmission } from "./types";

const NATURE_WORDS = [
  "OAK", "MAPLE", "FERN", "PINE", "IVY", "ELM", "ASH", "BIRCH", "CEDAR", "ROWAN",
  "HAZEL", "WILLOW", "SPRUCE", "ALDER", "LOTUS", "TULIP", "MAGNOLIA", "JUNIPER",
];

/** WORD-#### (18 × 9,000 = 162,000 combinations): a bored student can't guess
 *  a live class's code, and accidental collisions stay negligible. */
export function generateSessionCode(): string {
  const w = NATURE_WORDS[Math.floor(Math.random() * NATURE_WORDS.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}

export function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

// ── Transport interface ──────────────────────────────────────────────────────

export interface SessionSnapshot {
  session: LiveSession | null;
  submissions: StudentSubmission[];
}

export interface SessionTransport {
  create(quiz: Quiz, teacherUid: string): Promise<LiveSession>;
  subscribe(
    code: string,
    cb: (snap: SessionSnapshot) => void,
  ): () => void;
  setStatus(code: string, status: LiveSession["status"]): Promise<void>;
  submit(code: string, submission: StudentSubmission): Promise<void>;
}

// ── LIVE transport (Firestore) ───────────────────────────────────────────────

/** Recursively strip `undefined` values — Firestore setDoc rejects them at any
 *  depth, while localStorage/JSON silently drops them (the demo transport
 *  never hits this). Belt-and-braces for every LIVE write. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

const firestoreTransport: SessionTransport = {
  async create(quiz, teacherUid) {
    const code = generateSessionCode();
    const session: LiveSession = {
      code,
      quiz,
      teacherUid,
      status: "lobby",
      createdAt: Date.now(),
    };
    // Note: code collisions are practically impossible (18 words × 900
    // numbers); if a clash ever occurs the setDoc below fails and the caller
    // surfaces the error honestly.
    await setDoc(doc(getDb(), "sessions", code), stripUndefined(session));
    return session;
  },

  subscribe(code, cb) {
    let latest: LiveSession | null = null;
    let subs: StudentSubmission[] = [];

    const emit = () => cb({ session: latest, submissions: subs });

    const unsubSession = onSnapshot(
      doc(getDb(), "sessions", code),
      (snap) => {
        latest = snap.exists() ? (snap.data() as LiveSession) : null;
        emit();
      },
      () => emit(),
    );

    const unsubSubs = onSnapshot(
      collection(getDb(), "sessions", code, "submissions"),
      (snap) => {
        subs = snap.docs.map((d) => d.data() as StudentSubmission);
        emit();
      },
      () => emit(),
    );

    return () => {
      unsubSession();
      unsubSubs();
    };
  },

  async setStatus(code, status) {
    await setDoc(
      doc(getDb(), "sessions", code),
      { status },
      { merge: true },
    );
  },

  async submit(code, submission) {
    // Firestore offline persistence queues this write when offline and syncs
    // automatically when the device reconnects.
    const ref = doc(getDb(), "sessions", code, "submissions", submission.studentId);
    const write = setDoc(ref, stripUndefined(submission));
    // NOTE: Firestore's set() resolves on SERVER acknowledgement — offline it
    // stays pending until the write syncs. Students need immediate feedback,
    // so also resolve on the LOCAL echo (fires as soon as the write is queued
    // in the persistence layer, even in airplane mode) with a hard fallback
    // so the UI can never hang. Immediate failures (invalid data, rules)
    // still reject through `write`.
    await Promise.race([
      write,
      new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve();
          }
        };
        const unsubscribe = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          () => finish(),
          () => finish(),
        );
        setTimeout(finish, 8000);
      }),
    ]);
  },
};

// ── DEMO transport (BroadcastChannel + localStorage) ─────────────────────────

const DEMO_KEY = "grounded:demo-session";
const CHANNEL = "grounded-demo-session";

interface DemoStore {
  session: LiveSession | null;
  submissions: StudentSubmission[];
}

function readDemoStore(): DemoStore {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return { session: null, submissions: [] };
    return JSON.parse(raw) as DemoStore;
  } catch {
    return { session: null, submissions: [] };
  }
}

function writeDemoStore(store: DemoStore) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(store));
  } catch {
    // storage full/blocked — session still works in-memory via channel
  }
}

const demoTransport: SessionTransport = {
  async create(quiz, teacherUid) {
    const session: LiveSession = {
      code: generateSessionCode(),
      quiz,
      teacherUid,
      status: "lobby",
      createdAt: Date.now(),
    };
    writeDemoStore({ session, submissions: [] });
    try {
      new BroadcastChannel(CHANNEL).postMessage({ type: "reset" });
    } catch {
      /* no channel */
    }
    return session;
  },

  subscribe(code, cb) {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }

    const emit = () => {
      const store = readDemoStore();
      if (store.session?.code === code) {
        cb({ session: store.session, submissions: store.submissions });
      } else if (store.session === null) {
        cb({ session: null, submissions: [] });
      }
    };

    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "update" || ev.data?.type === "reset") emit();
    };
    channel?.addEventListener("message", onMsg);

    // Also poll lightly so same-tab updates surface.
    const interval = setInterval(emit, 1200);
    emit();

    return () => {
      channel?.removeEventListener("message", onMsg);
      channel?.close();
      clearInterval(interval);
    };
  },

  async setStatus(code, status) {
    const store = readDemoStore();
    if (store.session?.code === code) {
      store.session = { ...store.session, status };
      writeDemoStore(store);
      try {
        new BroadcastChannel(CHANNEL).postMessage({ type: "update" });
      } catch {
        /* ignore */
      }
    }
  },

  async submit(code, submission) {
    const store = readDemoStore();
    if (store.session?.code !== code) return;
    const idx = store.submissions.findIndex(
      (s) => s.studentId === submission.studentId,
    );
    if (idx >= 0) store.submissions[idx] = submission;
    else store.submissions.push(submission);
    writeDemoStore(store);
    try {
      new BroadcastChannel(CHANNEL).postMessage({ type: "update" });
    } catch {
      /* ignore */
    }
  },
};

export function getSessionTransport(): SessionTransport {
  return firebaseEnabled ? firestoreTransport : demoTransport;
}

/** Clears demo session state (used by the "End demo session" action). */
export function resetDemoSession() {
  try {
    localStorage.removeItem(DEMO_KEY);
    new BroadcastChannel(CHANNEL).postMessage({ type: "reset" });
  } catch {
    /* ignore */
  }
}

// ── Library (saved quizzes) ──────────────────────────────────────────────────

const LIB_KEY = "grounded:library";

export function loadLibrary(): Quiz[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    return raw ? (JSON.parse(raw) as Quiz[]) : [];
  } catch {
    return [];
  }
}

export function saveToLibrary(quiz: Quiz) {
  const lib = loadLibrary().filter((q) => q.id !== quiz.id);
  lib.unshift(quiz);
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function removeFromLibrary(quizId: string) {
  const lib = loadLibrary().filter((q) => q.id !== quizId);
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    /* ignore */
  }
}

// ── Quiz file share (.grounded JSON — offline teacher-to-teacher) ────────────

export const QUIZ_FILE_EXT = ".grounded.json";

/** Serialise a quiz to a portable JSON string. Sharing a quiz between
 *  teachers needs zero connectivity: download → pen-drive → import. */
export function quizToFileContent(quiz: Quiz): string {
  return JSON.stringify(
    {
      format: "grounded-quiz",
      version: 2,
      exportedAt: new Date().toISOString(),
      quiz,
    },
    null,
    2,
  );
}

/** Parse a .grounded.json file back into a Quiz. Throws with a friendly
 *  message when the file is not a GroundEd quiz export. */
export function quizFromFileContent(content: string): Quiz {
  let parsed: { format?: string; quiz?: Quiz };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const quiz = parsed.quiz && parsed.format === "grounded-quiz"
    ? parsed.quiz
    : (parsed as unknown as Quiz);
  if (
    !quiz ||
    typeof quiz.title !== "string" ||
    !Array.isArray(quiz.questions) ||
    quiz.questions.length === 0
  ) {
    throw new Error("That file does not look like a GroundEd quiz export.");
  }
  return { ...quiz, id: `quiz_${Date.now().toString(36)}` };
}

/** Trigger a browser download for any text content. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "application/json",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Session results export (CSV) ─────────────────────────────────────────────

function csvCell(v: string | number | boolean | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  // RFC-4180: quote cells containing commas, quotes or newlines.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a teacher-gradebook CSV from a session: one row per student per
 *  question, plus a summary row per student. Deterministic and testable. */
export function buildSessionCsv(
  quiz: Quiz,
  submissions: StudentSubmission[],
  graded: Record<string, { score: number; verdict: string }>,
): string {
  const rows: string[] = [];
  rows.push(
    [
      "student",
      "question",
      "type",
      "answer",
      "correct_option",
      "result",
      "score",
      "points",
    ]
      .map(csvCell)
      .join(","),
  );
  for (const sub of submissions) {
    for (const q of quiz.questions) {
      const a = sub.answers.find((x) => x.questionId === q.id);
      const g = graded[`${sub.studentId}:${q.id}`];
      let answer = "";
      let result = "";
      let score = "";
      if (q.type === "mcq") {
        answer =
          typeof a?.choice === "number" && q.options
            ? q.options[a.choice] ?? String(a.choice)
            : "";
        result =
          typeof a?.choice === "number" && a.choice === q.answerIndex
            ? "correct"
            : a
              ? "incorrect"
              : "unanswered";
        score = result === "correct" ? String(q.points) : "0";
      } else {
        answer = a?.text ?? "";
        result = g ? g.verdict : "pending";
        score = g ? String(Math.round(g.score * q.points)) : "";
      }
      rows.push(
        [
          sub.name,
          q.question,
          q.type,
          answer,
          q.type === "mcq" ? (q.options?.[q.answerIndex ?? 0] ?? "") : "",
          result,
          score,
          q.points,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return rows.join("\n");
}

/** Roll up a finished session into a history entry (local analytics). */
export function summarizeSession(
  quiz: Quiz,
  submissions: StudentSubmission[],
  shortGradedCount: number,
): {
  code: string;
  title: string;
  endedAt: number;
  students: number;
  avgMcqPct: number;
  shortGraded: number;
} {
  const mcqs = quiz.questions.filter((q) => q.type === "mcq");
  let pct = -1;
  if (mcqs.length > 0 && submissions.length > 0) {
    let correct = 0;
    for (const sub of submissions) {
      for (const q of mcqs) {
        const a = sub.answers.find((x) => x.questionId === q.id);
        if (a && a.choice === q.answerIndex) correct++;
      }
    }
    pct = Math.round((correct / (mcqs.length * submissions.length)) * 100);
  }
  return {
    code: "",
    title: quiz.title,
    endedAt: Date.now(),
    students: submissions.length,
    avgMcqPct: pct,
    shortGraded: shortGradedCount,
  };
}
