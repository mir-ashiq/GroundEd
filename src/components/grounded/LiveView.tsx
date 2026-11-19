"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Live session (teacher side).
//
// One quiz, a join code, and a classroom. Submissions flow through Firestore
// when connectivity exists and queue in IndexedDB when it doesn't (LIVE mode),
// or over BroadcastChannel in DEMO mode. MCQs are auto-checked deterministically;
// short answers are graded by AI with a privacy bias to the device tier.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Radio,
  Copy,
  ExternalLink,
  Play,
  Square,
  Users,
  FileDown,
  Sparkles,
  Loader2,
  BookOpen,
  UserRound,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { RoutingBadge } from "./RoutingBadge";
import { useGrounded } from "@/lib/grounded/store";
import {
  getSessionTransport,
  loadLibrary,
  resetDemoSession,
  buildSessionCsv,
  downloadTextFile,
  summarizeSession,
} from "@/lib/grounded/sessions";
import { gradeAnswer } from "@/lib/grounded/aiEngine";
import { firebaseEnabled, currentUid, studentSignIn, teacherSignIn } from "@/lib/grounded/firebase";
import type { GradedAnswer, Quiz, StudentSubmission } from "@/lib/grounded/types";
import { History, FileSpreadsheet } from "lucide-react";

export function LiveView() {
  const quiz = useGrounded((s) => s.quiz);
  const session = useGrounded((s) => s.session);
  const setSession = useGrounded((s) => s.setSession);
  const submissions = useGrounded((s) => s.submissions);
  const setSubmissions = useGrounded((s) => s.setSubmissions);
  const graded = useGrounded((s) => s.graded);
  const setGraded = useGrounded((s) => s.setGraded);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);
  const pushSessionHistory = useGrounded((s) => s.pushSessionHistory);
  const sessionHistory = useGrounded((s) => s.sessionHistory);
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const setView = useGrounded((s) => s.setView);
  const [library, setLibrary] = useState<Quiz[]>([]);
  const [creating, setCreating] = useState(false);
  const [teacherUid, setTeacherUid] = useState<string | null>(null);
  const [gradingBusy, setGradingBusy] = useState<string | null>(null);

  // localStorage is not available during SSR — load the library one frame
  // after mount (past hydration).
  useEffect(() => {
    const id = requestAnimationFrame(() => setLibrary(loadLibrary()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Resolve a teacher identity (anonymous is fine — still Firebase Auth).
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!firebaseEnabled) {
        setTeacherUid("demo-teacher");
        return;
      }
      const existing = currentUid();
      if (existing) {
        setTeacherUid(existing);
        return;
      }
      const uid = await studentSignIn();
      if (!cancelled) setTeacherUid(uid ?? "anonymous");
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to the active session (deps intentionally only the code —
  // snapshot objects get fresh identities on every emit, so comparing them
  // by reference here would re-subscribe forever).
  const sessionCode = session?.code;
  useEffect(() => {
    if (!sessionCode) return;
    const transport = getSessionTransport();
    const unsub = transport.subscribe(sessionCode, (snap) => {
      if (!snap.session) return;
      const cur = useGrounded.getState().session;
      const next = snap.session;
      const sessionChanged =
        !cur || cur.code !== next.code || cur.status !== next.status;
      if (sessionChanged) setSession(next);
      const curSubs = useGrounded.getState().submissions;
      if (JSON.stringify(curSubs) !== JSON.stringify(snap.submissions)) {
        setSubmissions(snap.submissions);
      }
    });
    return unsub;
  }, [sessionCode, setSession, setSubmissions]);

  async function createSession() {
    if (!quiz || !teacherUid) return;
    setCreating(true);
    try {
      const transport = getSessionTransport();
      const s = await transport.create(quiz, teacherUid);
      setSession(s);
      toast.success("Session created — share the code with your class.");
    } catch (err) {
      toast.error(
        err instanceof Error ? `Could not create session: ${err.message}` : "Could not create session",
      );
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(status: "active" | "closed") {
    if (!session) return;
    const transport = getSessionTransport();
    // Record the session into local history BEFORE closing (v2 — teachers can
    // look back at how their classes did).
    if (status === "closed") {
      const gradedCount = Object.values(graded).length;
      pushSessionHistory({
        ...summarizeSession(session.quiz, submissions, gradedCount),
        code: session.code,
      });
    }
    await transport.setStatus(session.code, status);
    if (status === "closed") {
      setSession(null);
      setSubmissions([]);
      if (!firebaseEnabled) resetDemoSession();
      toast.success("Session closed. Results saved to history.");
    }
  }

  /** Teacher-gradebook CSV: one row per student per question. */
  function exportCsv() {
    if (!session) return;
    const csv = buildSessionCsv(session.quiz, submissions, graded);
    const safe = session.quiz.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadTextFile(`${safe || "session"}-${session.code}.csv`, csv, "text/csv");
    toast.success("Results exported as CSV — open it in any spreadsheet.");
  }

  function shareLink() {
    if (!session) return;
    const url = `${window.location.origin}${window.location.pathname}#join=${session.code}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Join link copied"),
      () => toast.error("Copy failed — share the code instead"),
    );
  }

  function openStudentTab() {
    if (!session) return;
    window.open(
      `${window.location.origin}${window.location.pathname}#join=${session.code}`,
      "_blank",
    );
  }

  // ── Grading ────────────────────────────────────────────────────────────────
  const gradeSubmission = useCallback(
    async (sub: StudentSubmission, q: Quiz) => {
      const key = `${sub.studentId}:${"all"}`;
      setGradingBusy(key);
      try {
        for (const question of q.questions) {
          if (question.type !== "short") continue;
          const answer = sub.answers.find((a) => a.questionId === question.id);
          if (!answer?.text) continue;
          const result = await gradeAnswer(
            question.question,
            question.answerKey ?? "",
            answer.text,
            routingPolicy,
          );
          pushRoutingEvent({
            id: `evt_${Date.now().toString(36)}_${question.id}`,
            ts: Date.now(),
            feature: "grade-answer",
            source: result.route,
            model: result.model,
            latencyMs: result.latencyMs,
            inputChars: question.question.length + (question.answerKey?.length ?? 0) + answer.text.length,
            outputChars: JSON.stringify(result.data).length,
            simulated: result.simulated,
            offline: result.offline,
          });
          const g: GradedAnswer = {
            questionId: question.id,
            studentId: sub.studentId,
            score: result.data.score,
            verdict: result.data.verdict,
            feedback: result.data.feedback,
            autoChecked: false,
            aiGraded: true,
            route: result.route,
          };
          setGraded(g);
        }
        toast.success("Short answers graded by AI.");
      } catch {
        toast.error("AI grading failed — try Auto routing in Settings.");
      } finally {
        setGradingBusy(null);
      }
    },
    [pushRoutingEvent, routingPolicy, setGraded],
  );

  // ── Derived stats ──────────────────────────────────────────────────────────
  const mcqStats = useMemo(() => {
    if (!session) return [];
    return session.quiz.questions
      .filter((q) => q.type === "mcq")
      .map((q) => {
        const counts = [0, 0, 0, 0];
        let answered = 0;
        let correct = 0;
        for (const sub of submissions) {
          const a = sub.answers.find((x) => x.questionId === q.id);
          if (a && typeof a.choice === "number") {
            counts[a.choice] += 1;
            answered += 1;
            if (a.choice === q.answerIndex) correct += 1;
          }
        }
        return { question: q, counts, answered, correct };
      });
  }, [session, submissions]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="space-y-4">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" /> Start a live session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run the current quiz as a live class activity. Students join on
            their phones with a code; answers sync when connectivity allows and
            auto-check the moment they land.
          </p>

          {quiz ? (
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current quiz
              </p>
              <p className="font-display text-lg font-semibold">{quiz.title}</p>
              <p className="text-xs text-muted-foreground">
                Grade {quiz.gradeLevel} · {quiz.questions.length} questions ·{" "}
                {quiz.questions.filter((q) => q.type === "short").length} short-answer
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                No quiz yet — pick one from your library or create one in the
                Studio:
              </p>
              <ScrollArea className="max-h-40 rounded-lg border p-2">
                {library.length === 0 ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">
                    Library is empty.
                  </p>
                ) : (
                  library.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => useGrounded.getState().setQuiz(q)}
                      className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="truncate">{q.title}</span>
                      <Badge variant="outline">{q.questions.length}q</Badge>
                    </button>
                  ))
                )}
              </ScrollArea>
              <Button variant="outline" className="w-full gap-2" onClick={() => setView("studio")}>
                <BookOpen className="h-4 w-4" /> Open Studio
              </Button>
            </div>
          )}

          {firebaseEnabled && (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <LogIn className="h-3.5 w-3.5" /> Teacher sign-in (optional)
              </p>
              <p className="mt-1">
                You are signed in anonymously via Firebase Authentication. Use
                Google sign-in if you want sessions tied to your account.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  const uid = await teacherSignIn();
                  if (uid) {
                    setTeacherUid(uid);
                    toast.success("Signed in with Google");
                  } else {
                    toast.error(
                      "Google sign-in is not available for this project — continuing anonymously.",
                    );
                  }
                }}
              >
                Sign in with Google
              </Button>
            </div>
          )}

          <Button
            size="lg"
            className="w-full gap-2"
            disabled={!quiz || !teacherUid || creating}
            onClick={createSession}
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Create session
          </Button>
        </CardContent>
      </Card>

      {sessionHistory.length > 0 && (
        <Card className="mx-auto max-w-xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" /> Past sessions
              <span className="text-xs font-normal text-muted-foreground">
                (on this device)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <ul className="space-y-2">
                {sessionHistory.map((h) => (
                  <li
                    key={`${h.code}-${h.endedAt}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{h.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.code} ·{" "}
                        {new Date(h.endedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {h.students} student{h.students === 1 ? "" : "s"}
                        {h.shortGraded > 0 && ` · ${h.shortGraded} AI-graded`}
                      </p>
                    </div>
                    {h.avgMcqPct >= 0 && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0",
                          h.avgMcqPct >= 60
                            ? "border-[color-mix(in_oklab,var(--device)_40%,white)] text-[var(--device)]"
                            : "text-muted-foreground",
                        )}
                      >
                        {h.avgMcqPct}% MCQ
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session header card */}
      <Card className="overflow-hidden">
        <div className="bg-primary p-6 text-primary-foreground">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest opacity-80">
                <Radio className="h-3.5 w-3.5" />
                {session.status === "lobby" ? "Lobby · join now" : "Live"}
              </p>
              <p className="font-display mt-1 text-4xl font-bold tracking-wide">
                {session.code}
              </p>
              <p className="mt-1 text-sm opacity-90">{session.quiz.title}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard?.writeText(session.code);
                  toast.success("Code copied");
                }}
              >
                <Copy className="h-4 w-4" /> Copy code
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                onClick={shareLink}
              >
                <FileDown className="h-4 w-4" /> Copy link
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                onClick={openStudentTab}
              >
                <ExternalLink className="h-4 w-4" /> Open student view
              </Button>
            </div>
          </div>
        </div>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {submissions.length} submission{submissions.length === 1 ? "" : "s"}
            {session.status === "lobby" && " · waiting for students…"}
          </p>
          <div className="flex flex-wrap gap-2">
            {submissions.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
            {session.status === "lobby" ? (
              <Button size="sm" className="gap-1.5" onClick={() => setStatus("active")}>
                <Play className="h-3.5 w-3.5" /> Activate quiz
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setStatus("closed")}
              >
                <Square className="h-3.5 w-3.5" /> End session
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submissions + stats */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <UserRound className="h-8 w-8 text-muted-foreground/40" />
                Waiting for the first student to join with code{" "}
                <span className="font-mono font-semibold text-foreground">
                  {session.code}
                </span>
                .
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <ul className="space-y-2">
                  <AnimatePresence>
                    {submissions.map((sub) => {
                      const mcqScore = mcqScoreFor(sub, session.quiz);
                      const shortCount = session.quiz.questions.filter(
                        (q) => q.type === "short",
                      ).length;
                      const gradedShorts = Object.values(graded).filter(
                        (g) => g.studentId === sub.studentId,
                      );
                      const hasShorts = shortCount > 0;
                      const allGraded =
                        !hasShorts || gradedShorts.length >= shortCount;
                      const busy = gradingBusy === `${sub.studentId}:all`;
                      return (
                        <motion.li
                          key={sub.studentId}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="rounded-xl border p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{sub.name}</p>
                              <p className="text-xs text-muted-foreground">
                                MCQ {mcqScore.earned}/{mcqScore.total} ·{" "}
                                auto-checked
                                {sub.queuedOffline && " · synced after offline"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {allGraded ? (
                                <Badge className="gap-1 bg-[color-mix(in_oklab,var(--device)_15%,white)] text-[var(--device)]">
                                  <ShieldCheck className="h-3 w-3" /> Graded
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  disabled={busy}
                                  onClick={() => gradeSubmission(sub, session.quiz)}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  AI grade
                                </Button>
                              )}
                            </div>
                          </div>
                          {gradedShorts.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t pt-2">
                              {gradedShorts.map((g) => {
                                const q = session.quiz.questions.find(
                                  (x) => x.id === g.questionId,
                                );
                                return (
                                  <div
                                    key={g.questionId}
                                    className="rounded-lg bg-muted/50 p-2 text-xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate font-medium">
                                        Q{q ? session.quiz.questions.indexOf(q) + 1 : "?"}{" "}
                                        {g.verdict}
                                      </span>
                                      <RoutingBadge
                                        source={g.route ?? null}
                                        size="sm"
                                      />
                                    </div>
                                    <p className="mt-1 text-muted-foreground">
                                      {g.feedback}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Question breakdown · MCQ auto-checked
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mcqStats.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No multiple-choice questions in this quiz.
              </p>
            ) : (
              <div className="space-y-4">
                {mcqStats.map(({ question, counts, answered, correct }, qi) => {
                  const max = Math.max(1, ...counts);
                  return (
                    <div key={question.id}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          Q{session.quiz.questions.indexOf(question) + 1}.{" "}
                          <span className="text-muted-foreground">
                            {question.question.slice(0, 72)}
                            {question.question.length > 72 ? "…" : ""}
                          </span>
                        </p>
                        <Badge variant="outline" className="shrink-0">
                          {correct}/{answered} correct
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {counts.map((c, i) => {
                          const isAnswer = i === question.answerIndex;
                          return (
                            <div key={i} className="text-center">
                              <div
                                className={cn(
                                  "mx-auto rounded-t-md transition-all",
                                  isAnswer
                                    ? "bg-[var(--device)]"
                                    : "bg-muted-foreground/30",
                                )}
                                style={{
                                  height: `${8 + (c / max) * 44}px`,
                                  opacity: c > 0 ? 1 : 0.35,
                                }}
                              />
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {String.fromCharCode(65 + i)} ({c})
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      {qi < mcqStats.length - 1 && <Separator className="mt-4" />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function mcqScoreFor(sub: StudentSubmission, quiz: Quiz) {
  const mcqs = quiz.questions.filter((q) => q.type === "mcq");
  let earned = 0;
  for (const q of mcqs) {
    const a = sub.answers.find((x) => x.questionId === q.id);
    if (a && a.choice === q.answerIndex) earned += 1;
  }
  return { earned, total: mcqs.length };
}
