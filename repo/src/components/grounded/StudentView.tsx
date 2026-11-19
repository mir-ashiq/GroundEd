"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Student join (mobile-first).
//
// Join with a code → name → answer → submit. When offline, the submission is
// kept locally and syncs the moment connectivity returns (Firestore offline
// persistence in LIVE mode; instant local hand-off in DEMO mode).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Send,
  Users,
  Volume2,
  WifiOff,
  XCircle,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useGrounded } from "@/lib/grounded/store";
import {
  getSessionTransport,
  randomId,
  type SessionSnapshot,
} from "@/lib/grounded/sessions";
import { currentUid, studentSignIn } from "@/lib/grounded/firebase";
import { speak, speechAvailable } from "@/lib/grounded/speech";
import type { LiveSession, Quiz, StudentAnswer } from "@/lib/grounded/types";

type Step = "code" | "name" | "quiz" | "done";

export function StudentView() {
  const joinCodePrefill = useGrounded((s) => s.joinCodePrefill);
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(joinCodePrefill);
  const [name, setName] = useState("");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [qIndex, setQIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOffline, setSubmittedOffline] = useState(false);
  const [joining, setJoining] = useState(false);
  const [mcqResult, setMcqResult] = useState<{ earned: number; total: number } | null>(null);
  // v3.1 — persistent inline join errors (a toast alone vanishes too fast for
  // a 10-year-old with a mistyped code) + presence identity.
  const [joinError, setJoinError] = useState<string | null>(null);
  const [myStudentId, setMyStudentId] = useState<string>("");

/** Tracks which sessions this device already submitted to, so a student who
 *  re-joins the same session can't accidentally create a duplicate row on the
 *  teacher's dashboard. */
function submittedAlready(code: string): boolean {
  try {
    return localStorage.getItem(`grounded:submitted:${code}`) === "1";
  } catch {
    return false;
  }
}
function markSubmitted(code: string) {
  try {
    localStorage.setItem(`grounded:submitted:${code}`, "1");
  } catch {
    /* storage blocked — the guard is best-effort */
  }
}

/** Stable per-device id for ONE session — presence and submission share it,
 *  so re-joining on the same phone never duplicates a roster row. */
function stableStudentId(code: string): string {
  try {
    const key = `grounded:student-id:${code}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = randomId("student");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return randomId("student");
  }
}

  // Prefill from #join=CODE hash (opened via teacher's "Open student view").
  useEffect(() => {
    const m = window.location.hash.match(/join=([A-Za-z]+-\d{3,4})/);
    if (!m) return;
    const id = requestAnimationFrame(() => setCode(m[1].toUpperCase()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Subscribe once we have a session to validate against (deps: code only).
  const sessionCode = session?.code;
  useEffect(() => {
    if (!sessionCode) return;
    const transport = getSessionTransport();
    const unsub = transport.subscribe(sessionCode, (snap: SessionSnapshot) => {
      const next = snap.session;
      if (!next || next.status === "closed") return;
      const cur = useGrounded.getState().session;
      if (!cur || cur.code !== next.code || cur.status !== next.status) {
        setSession(next);
      }
    });
    return unsub;
  }, [sessionCode]);

  const quiz: Quiz | null = session?.quiz ?? null;
  const questions = useMemo(() => quiz?.questions ?? [], [quiz]);
  const question = questions[qIndex];

  // How many questions are answered so far (drives the live presence row).
  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.id];
        return a && (typeof a.choice === "number" || (a.text ?? "").trim().length > 0);
      }).length,
    [questions, answers],
  );

  // Publish progress to the teacher's roster (best-effort — never blocks).
  useEffect(() => {
    if (step !== "quiz" || !session || !myStudentId) return;
    getSessionTransport()
      .updatePresence(session.code, myStudentId, { progress: answeredCount })
      .catch(() => {});
  }, [answeredCount, step, session, myStudentId]);

  const join = useCallback(async () => {
    const normalized = code.trim().toUpperCase();
    setJoinError(null);
    if (!/^[A-Z]+-\d{3,4}$/.test(normalized)) {
      setJoinError("Enter the code your teacher shows (e.g. OAK-482).");
      toast.error("Enter the code your teacher shows (e.g. OAK-482).");
      return;
    }
    setJoining(true);
    try {
      // Subscribe and wait for the FIRST snapshot to arrive (with a generous
      // timeout for slow connections) — never a fixed-delay race.
      const transport = getSessionTransport();
      const firstSnap = await new Promise<SessionSnapshot>((resolve, reject) => {
        let settled = false;
        // Declare `stop` BEFORE `done` — the transport calls back synchronously
        // on the very first emit, and calling an uninitialized `const` (TDZ)
        // would throw and reject the join for every student.
        let stop: () => void = () => {};
        const done = (snap: SessionSnapshot) => {
          if (!settled) {
            settled = true;
            stop();
            resolve(snap);
          }
        };
        stop = transport.subscribe(normalized, done);
        setTimeout(() => {
          if (!settled) {
            settled = true;
            stop();
            reject(new Error("timeout"));
          }
        }, 12000);
      });
      if (!firstSnap.session || firstSnap.session.status === "closed") {
        setJoinError("No active session with that code — check the board and try again.");
        toast.error("No active session with that code. Check with your teacher.", {
          duration: 6000,
        });
        return;
      }
      setSession(firstSnap.session);
      // Guarantee an anonymous uid BEFORE the quiz can start: submit() must
      // never need the network (offline submits stay valid — Firestore rules
      // require auth at sync time). Auth completes while "Joining…" shows.
      if (useGrounded.getState().mode === "live") {
        await studentSignIn();
      }
      setStep("name");
      toast.success("Joined! Enter your name.");
    } catch {
      setJoinError(
        "Couldn't reach the session — check the code and your connection, then try again.",
      );
      toast.error("Couldn't reach the session. Check the code and connection.", {
        duration: 6000,
      });
    } finally {
      setJoining(false);
    }
  }, [code]);

  /** Lobby gating: the teacher starts the quiz for everyone. Until then the
   *  student waits ON this screen — “Start quiz” unlocks the moment the
   *  session flips to active (the subscription updates `session` live). */
  const lobbyWait = session?.status === "lobby";

  async function startQuiz() {
    if (!session) return;
    const id = stableStudentId(session.code);
    setMyStudentId(id);
    setStep("quiz");
    // Presence: the teacher sees who is in the room from this moment on.
    // ownerUid binds the row to this device's (anonymous) auth identity —
    // the Firestore rules only let the original writer update it.
    try {
      await getSessionTransport().join(session.code, {
        studentId: id,
        name: name.trim().slice(0, 40) || "Student",
        joinedAt: Date.now(),
        ownerUid: currentUid() ?? "",
        progress: 0,
      });
    } catch {
      /* presence is best-effort — the submission itself still works */
    }
  }

  async function submit() {
    if (!session) return;
    setSubmitting(true);
    try {
      // Anonymous auth normally happens at join time (while online). If we
      // got here without a uid, give auth a SHORT window — never block the
      // offline-capable Firestore write on an unbounded network call.
      if (useGrounded.getState().mode === "live" && !currentUid()) {
        await Promise.race([
          studentSignIn(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      // Build answers WITHOUT `undefined` fields — Firestore rejects undefined
      // at any depth (e.g. a short answer must not carry `choice: undefined`).
      const answerRows = questions.map((q) => {
        const a = answers[q.id];
        const entry: { questionId: string; choice?: number; text?: string } = {
          questionId: q.id,
        };
        if (typeof a?.choice === "number") entry.choice = a.choice;
        if (a?.text && a.text.trim().length > 0) entry.text = a.text.trim();
        return entry;
      });
      await getSessionTransport().submit(session.code, {
        studentId: myStudentId || stableStudentId(session.code),
        name: name.trim().slice(0, 40) || "Student", // rules cap names at 40 chars
        answers: answerRows,
        submittedAt: Date.now(),
        queuedOffline: offline,
      });
      // Roster flips to “done” (best-effort, may still be offline).
      getSessionTransport()
        .updatePresence(session.code, myStudentId, {
          finished: true,
          progress: questions.length,
          updatedOffline: offline,
        })
        .catch(() => {});
      markSubmitted(session.code);
      setSubmittedOffline(offline);
      // Instant, local MCQ feedback — deterministic key match, no AI, no
      // network. Short answers stay for the teacher's private AI grading.
      if (session) {
        const mcqs = session.quiz.questions.filter((q) => q.type === "mcq");
        if (mcqs.length > 0) {
          let earned = 0;
          for (const q of mcqs) {
            const a = answers[q.id];
            if (a && a.choice === q.answerIndex) earned += 1;
          }
          setMcqResult({ earned, total: mcqs.length });
        }
      }
      setStep("done");
    } catch {
      toast.error("Could not submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step: code ─────────────────────────────────────────────────────────────
  if (step === "code") {
    return (
      <Card className="mx-auto max-w-sm">
        <CardContent className="space-y-5 py-8">
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </span>
            <h2 className="font-display mt-3 text-2xl font-semibold">
              Join your class
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the code on the board.
            </p>
          </div>
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setJoinError(null);
            }}
            placeholder="OAK-482"
            className="h-14 text-center font-display text-2xl font-semibold tracking-widest"
            aria-label="Session code"
            aria-invalid={!!joinError}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          {joinError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive"
            >
              {joinError}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={join} disabled={joining}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {joining ? "Joining…" : "Join"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Step: name ─────────────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <Card className="mx-auto max-w-sm">
        <CardContent className="space-y-5 py-8">
          <h2 className="font-display text-center text-2xl font-semibold">
            Your name
          </h2>
          <p className="text-center text-sm text-muted-foreground">
            {session?.quiz.title}
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya"
            className="h-12 text-center text-lg"
            aria-label="Your name"
            onKeyDown={(e) => e.key === "Enter" && name.trim() && !lobbyWait && startQuiz()}
          />
          {lobbyWait ? (
            <div
              className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <Hourglass className="h-4 w-4 shrink-0 animate-pulse text-primary" />
              <span>
                Waiting for your teacher to start the quiz — the button below
                unlocks the second they do.
              </span>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              {questions.length} questions · works on any phone
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={!name.trim() || lobbyWait}
            onClick={startQuiz}
          >
            {lobbyWait ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for teacher…
              </>
            ) : (
              "Start quiz"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Step: done ─────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <Card className="mx-auto max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-[var(--device)]" />
          <h2 className="font-display text-2xl font-semibold">Answers in!</h2>
          {mcqResult && (
            <div className="w-full rounded-xl border bg-muted/40 p-4">
              <p className="font-display text-3xl font-bold text-primary">
                {mcqResult.earned}/{mcqResult.total}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                multiple-choice questions correct (auto-checked instantly)
              </p>
            </div>
          )}
          {/* Per-question review — a score with no questions is a stamp, not
              learning. MCQs show the right answer; written answers stay
              private for the teacher to read. */}
          {session && (
            <div className="w-full space-y-1.5 text-left">
              {session.quiz.questions.map((q, i) => {
                const a = answers[q.id];
                if (q.type === "mcq") {
                  const correct = a?.choice === q.answerIndex;
                  return (
                    <div
                      key={q.id}
                      className="flex items-start gap-2 rounded-lg border p-2 text-xs"
                    >
                      {correct ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--device)]" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cloud)]" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">Q{i + 1}.</span> {q.question}
                        <span className="mt-0.5 block text-muted-foreground">
                          Your answer: {q.options?.[a?.choice ?? -1] ?? "—"}
                          {!correct && (
                            <>
                              {" "}· Correct: {q.options?.[q.answerIndex ?? 0] ?? "—"}
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                  );
                }
                return (
                  <div
                    key={q.id}
                    className="flex items-start gap-2 rounded-lg border p-2 text-xs"
                  >
                    <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">Q{i + 1}.</span> {q.question}
                      <span className="mt-0.5 block text-muted-foreground">
                        Your written answer is saved — your teacher will read it soon.
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {session?.quiz.questions.some((q) => q.type === "short") && (
            <p className="text-xs text-muted-foreground">
              Written answers get graded privately by your teacher.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {submittedOffline ? (
              <span className="flex items-center gap-1.5">
                <WifiOff className="h-4 w-4" />
                You were offline — your answers are saved and will sync when
                you reconnect.
              </span>
            ) : (
              "Your teacher can see your results now."
            )}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setStep("code");
              setAnswers({});
              setQIndex(0);
              setSession(null);
              setMcqResult(null);
              setJoinError(null);
              setMyStudentId("");
            }}
          >
            Join another session
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Step: quiz (one question per screen) ────────────────────────────────────
  if (!quiz || !question) return null;
  const answered = (a?: StudentAnswer) =>
    a && (typeof a.choice === "number" || (a.text ?? "").trim().length > 0);
  const canNext = answered(answers[question.id]);
  const isLast = qIndex === questions.length - 1;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5" aria-label="Progress">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setQIndex(i)}
            aria-label={`Go to question ${i + 1}`}
            className={cn(
              "h-2 rounded-full transition-all",
              i === qIndex
                ? "w-6 bg-primary"
                : answered(answers[q.id])
                  ? "w-2 bg-[var(--device)]"
                  : "w-2 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>

      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <Card>
          <CardContent className="space-y-5 py-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Question {qIndex + 1} of {questions.length}
              {question.type === "short" && " · short answer"}
            </p>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-xl font-semibold leading-snug">
                {question.question}
              </h2>
              {speechAvailable() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1 rounded-full px-3 text-xs"
                  onClick={() =>
                    speak(
                      question.type === "mcq" && question.options
                        ? `${question.question} The options are: ${question.options
                            .map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`)
                            .join(". ")}`
                        : question.question,
                      "en",
                    )
                  }
                  aria-label="Read this question aloud"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Listen
                </Button>
              )}
            </div>

            {question.type === "mcq" && question.options ? (
              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setAnswers((a) => ({
                        ...a,
                        [question.id]: { questionId: question.id, choice: i },
                      }))
                    }
                    className={cn(
                      "flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all active:scale-[0.99]",
                      answers[question.id]?.choice === i
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                        answers[question.id]?.choice === i
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Write your answer
                </Label>
                <Textarea
                  value={answers[question.id]?.text ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      [question.id]: {
                        questionId: question.id,
                        text: e.target.value,
                      },
                    }))
                  }
                  placeholder="Answer in one or two sentences…"
                  className="mt-1.5 min-h-[110px] text-base"
                  aria-label="Your answer"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="flex-1 gap-1.5"
          disabled={qIndex === 0}
          onClick={() => setQIndex((i) => i - 1)}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {isLast ? (
          <Button size="lg" className="flex-[2] gap-1.5" disabled={submitting} onClick={submit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-[2] gap-1.5"
            disabled={!canNext}
            onClick={() => setQIndex((i) => i + 1)}
          >
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Works offline — answers sync when you&apos;re back online.
      </p>
    </div>
  );
}
