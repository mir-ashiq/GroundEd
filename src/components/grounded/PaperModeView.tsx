"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Paper mode (v3): grade a whole class of paper worksheets.
//
// The audience's most common medium is paper: print the worksheet, students
// answer on it, then the teacher types the answers here once (MCQ circles
// become A–D taps). MCQs auto-check deterministically; short answers run
// through the same privacy-biased hybrid grading engine as live sessions —
// on-device whenever the model is present, so a stack can be graded with
// zero student devices AND zero connectivity.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  FileStack,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  FileDown,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGrounded } from "@/lib/grounded/store";
import { gradeAnswer } from "@/lib/grounded/aiEngine";
import {
  loadLibrary,
  buildSessionCsv,
  downloadTextFile,
  summarizeSession,
} from "@/lib/grounded/sessions";
import type { GradedAnswer, Quiz, StudentSubmission } from "@/lib/grounded/types";

const LETTERS = ["A", "B", "C", "D", "E"];

/** Stable id per grid row — results survive re-renders and match the CSV. */
const subIdFor = (rowIdx: number) => `paper_${rowIdx}`;

export function PaperModeView() {
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);
  const pushSessionHistory = useGrounded((s) => s.pushSessionHistory);
  const setView = useGrounded((s) => s.setView);
  const currentQuiz = useGrounded((s) => s.quiz);

  const [picked, setPicked] = useState<Quiz | null>(null);
  const [library, setLibrary] = useState<Quiz[]>([]);
  const [names, setNames] = useState<string[]>(["", ""]);
  const [answers, setAnswers] = useState<
    Record<number, Record<string, { choice?: number; text?: string }>>
  >({});
  const [grading, setGrading] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Record<string, GradedAnswer> | null>(null);

  // localStorage loads one frame after mount (SSR-safe).
  useEffect(() => {
    const id = requestAnimationFrame(() => setLibrary(loadLibrary()));
    return () => cancelAnimationFrame(id);
  }, []);

  const quiz = picked ?? currentQuiz;

  const submissions = useMemo<StudentSubmission[]>(() => {
    if (!quiz) return [];
    return names
      .map((name, i) => ({ name, i }))
      .filter(({ name }) => name.trim().length > 0)
      .map(({ name, i }) => ({
        studentId: subIdFor(i),
        name: name.trim(),
        answers: quiz.questions
          .map((q): { questionId: string; choice?: number; text?: string } | null => {
            const a = answers[i]?.[q.id];
            if (!a) return null;
            if (q.type === "mcq" && typeof a.choice === "number")
              return { questionId: q.id, choice: a.choice };
            if (q.type === "short" && (a.text ?? "").trim())
              return { questionId: q.id, text: (a.text ?? "").trim() };
            return null;
          })
          .filter(
            (x): x is { questionId: string; choice?: number; text?: string } =>
              x !== null,
          ),
        submittedAt: Date.now(),
      }));
  }, [quiz, names, answers]);

  const namedWithAnswers = useMemo(
    () => submissions.filter((s) => s.answers.length > 0).length,
    [submissions],
  );

  function startStack(q: Quiz) {
    setPicked(q);
    setNames(["", ""]);
    setAnswers({});
    setResults(null);
  }

  function setAnswer(
    studentIdx: number,
    questionId: string,
    patch: { choice?: number; text?: string },
  ) {
    setAnswers((prev) => ({
      ...prev,
      [studentIdx]: {
        ...(prev[studentIdx] ?? {}),
        [questionId]: {
          ...(prev[studentIdx]?.[questionId] ?? {}),
          ...patch,
        },
      },
    }));
  }

  async function gradeStack() {
    if (!quiz || submissions.length === 0) {
      toast.error("Add at least one student name with answers.");
      return;
    }
    setGrading(true);
    setResults(null);
    const graded: Record<string, GradedAnswer> = {};
    try {
      // 1 · MCQs — deterministic key match, no AI, instant.
      for (const sub of submissions) {
        for (const q of quiz.questions) {
          if (q.type !== "mcq") continue;
          const a = sub.answers.find((x) => x.questionId === q.id);
          if (!a || typeof a.choice !== "number") continue;
          const ok = a.choice === q.answerIndex;
          graded[`${sub.studentId}:${q.id}`] = {
            questionId: q.id,
            studentId: sub.studentId,
            score: ok ? 1 : 0,
            verdict: ok ? "correct" : "incorrect",
            feedback: ok
              ? "Auto-checked (deterministic key match)"
              : "Auto-checked — wrong option",
            autoChecked: true,
            aiGraded: false,
          };
        }
      }
      // 2 · Short answers — the same privacy-biased hybrid grading engine.
      const shorts: {
        sub: StudentSubmission;
        qId: string;
        q: string;
        key: string;
        text: string;
      }[] = [];
      for (const sub of submissions) {
        for (const q of quiz.questions) {
          if (q.type !== "short") continue;
          const a = sub.answers.find((x) => x.questionId === q.id);
          if (a?.text)
            shorts.push({
              sub,
              qId: q.id,
              q: q.question,
              key: q.answerKey ?? "",
              text: a.text,
            });
        }
      }
      let done = 0;
      for (const s of shorts) {
        setProgress(`Grading short answers — ${done + 1}/${shorts.length}…`);
        const r = await gradeAnswer(s.q, s.key, s.text, routingPolicy);
        pushRoutingEvent({
          id: `evt_${Date.now().toString(36)}_${s.qId}`,
          ts: Date.now(),
          feature: "grade-answer",
          source: r.route,
          model: r.model,
          latencyMs: r.latencyMs,
          inputChars: s.q.length + s.key.length + s.text.length,
          outputChars: JSON.stringify(r.data).length,
          simulated: r.simulated,
          offline: r.offline,
          note: "Paper-stack grading (teacher-entered answers).",
        });
        graded[`${s.sub.studentId}:${s.qId}`] = {
          questionId: s.qId,
          studentId: s.sub.studentId,
          score: r.data.score,
          verdict: r.data.verdict,
          feedback: r.data.feedback,
          autoChecked: false,
          aiGraded: true,
          route: r.route,
        };
        done++;
      }
      setResults(graded);
      // 3 · Record into history (feeds the Insights tab).
      pushSessionHistory({
        ...summarizeSession(quiz, submissions, shorts.length, {
          source: "paper",
          graded,
        }),
        code: `PAPER-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      });
      toast.success(
        shorts.length > 0
          ? `Stack graded — ${shorts.length} short answer${shorts.length > 1 ? "s" : ""} by AI, MCQs auto-checked. Saved to history.`
          : "Stack graded — MCQs auto-checked. Saved to history.",
      );
    } catch {
      toast.error(
        "AI grading failed part-way — MCQ results are kept below. Try Auto routing in Settings.",
      );
      setResults(graded);
    } finally {
      setGrading(false);
      setProgress("");
    }
  }

  function exportCsv() {
    if (!quiz) return;
    const csv = buildSessionCsv(quiz, submissions, results ?? {});
    const safe = quiz.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadTextFile(`${safe || "paper"}-stack.csv`, csv, "text/csv");
    toast.success("Paper results exported as CSV.");
  }

  /** Row score chip after grading: earned points / total attempted. */
  function rowScore(rowIdx: number): number | null {
    if (!quiz || !results) return null;
    const subId = subIdFor(rowIdx);
    let score = 0;
    let total = 0;
    for (const q of quiz.questions) {
      const g = results[`${subId}:${q.id}`];
      if (!g) continue;
      total += q.points;
      score += g.score * q.points;
    }
    return total === 0 ? null : Math.round((score / total) * 100);
  }

  // ── Quiz picker (no quiz yet) ──────────────────────────────────────────────
  if (!quiz) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5 text-primary" /> Grade a paper stack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Printed worksheets, answered on paper. Pick the quiz, type each
            student&apos;s answers once — AI grades the stack, offline if needed.
          </p>
          {library.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved quizzes yet — generate one in the Studio first (it saves
              automatically).
            </p>
          ) : (
            <ScrollArea className="max-h-40 rounded-lg border p-2">
              {library.map((q) => (
                <button
                  key={q.id}
                  onClick={() => startStack(q)}
                  className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="truncate">{q.title}</span>
                  <Badge variant="outline">{q.questions.length}q</Badge>
                </button>
              ))}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" /> Paper stack ·{" "}
              <span className="font-normal text-muted-foreground">
                {quiz.title}
              </span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              MCQs auto-check instantly · short answers graded by the same
              privacy-biased engine (on-device when the model is present)
            </p>
          </div>
          {picked && (
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              <BookOpen className="h-3.5 w-3.5" /> Change quiz
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 pb-2 text-left text-xs font-medium text-muted-foreground">
                  Student
                </th>
                {quiz.questions.map((q, qi) => (
                  <th
                    key={q.id}
                    className="px-1.5 pb-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    Q{qi + 1}
                    <span className="block text-[10px] opacity-70">
                      {q.type === "mcq" ? "A–D" : "short"}
                    </span>
                  </th>
                ))}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {names.map((name, i) => {
                const pct = rowScore(i);
                return (
                  <tr key={i} className="align-top">
                    <td className="sticky left-0 z-10 bg-card pr-3 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={name}
                          onChange={(e) => {
                            const next = [...names];
                            next[i] = e.target.value;
                            setNames(next);
                          }}
                          placeholder={`Student ${i + 1}`}
                          className="h-8 w-32 text-sm"
                          aria-label={`Student ${i + 1} name`}
                        />
                        {pct !== null && (
                          <Badge
                            variant="outline"
                            className={
                              pct >= 50
                                ? "border-[color-mix(in_oklab,var(--device)_40%,white)] text-[var(--device)]"
                                : "border-[color-mix(in_oklab,var(--cloud)_40%,white)] text-[var(--cloud)]"
                            }
                          >
                            {pct}%
                          </Badge>
                        )}
                      </div>
                    </td>
                    {quiz.questions.map((q) => {
                      const g = results
                        ? results[`${subIdFor(i)}:${q.id}`]
                        : undefined;
                      return (
                        <td key={q.id} className="px-1.5 pb-2">
                          {q.type === "mcq" ? (
                            <div className="flex justify-center gap-0.5">
                              {(q.options ?? []).map((_, oi) => {
                                const sel =
                                  answers[i]?.[q.id]?.choice === oi;
                                return (
                                  <button
                                    key={oi}
                                    type="button"
                                    disabled={!!results}
                                    onClick={() =>
                                      setAnswer(i, q.id, { choice: oi })
                                    }
                                    className={cellClass(sel, g, oi, q.answerIndex)}
                                    aria-label={`Student ${i + 1}, option ${LETTERS[oi]}`}
                                  >
                                    {LETTERS[oi]}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <Input
                              value={answers[i]?.[q.id]?.text ?? ""}
                              onChange={(e) =>
                                setAnswer(i, q.id, { text: e.target.value })
                              }
                              disabled={!!results}
                              placeholder="answer…"
                              className="h-8 min-w-[110px] text-xs"
                              aria-label={`Student ${i + 1} short answer`}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="pl-1 pb-2">
                      {names.length > 1 && !results && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setNames((ns) => ns.filter((_, ni) => ni !== i));
                            setAnswers((prev) => {
                              const next: typeof prev = {};
                              Object.entries(prev).forEach(([k, v]) => {
                                const ki = Number(k);
                                if (ki < i) next[ki] = v;
                                else if (ki > i) next[ki - 1] = v;
                              });
                              return next;
                            });
                          }}
                          aria-label={`Remove student ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!results && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setNames((ns) => [...ns, ""])}
            >
              <Plus className="h-3.5 w-3.5" /> Add student
            </Button>
            <div className="ml-auto">
              <Button
                className="gap-1.5"
                onClick={gradeStack}
                disabled={grading || namedWithAnswers === 0}
              >
                {grading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />{" "}
                    {progress || "Grading…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Grade the stack
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <span>
                {namedWithAnswers} student
                {namedWithAnswers === 1 ? "" : "s"} graded · results saved to
                session history.
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={exportCsv}
                >
                  <FileDown className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setView("insights")}
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Insights
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setAnswers({});
                    setResults(null);
                    setNames(names.map(() => ""));
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> New stack
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Green cell = the picked option was correct; red = wrong; dashed
              green outline = the option that should have been picked. Short
              answer verdicts and feedback travel in the CSV export, and each
              AI grading call is badged in the Routing inspector.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function cellClass(
  selected: boolean,
  graded: GradedAnswer | undefined,
  optionIndex: number,
  answerIndex: number | undefined,
): string {
  const base =
    "grid h-7 w-7 place-items-center rounded-md border text-xs font-semibold transition-colors";
  if (graded && selected) {
    return graded.score === 1
      ? `${base} border-[var(--device)] bg-[color-mix(in_oklab,var(--device)_15%,white)] text-[var(--device)]`
      : `${base} border-[var(--cloud)] bg-[color-mix(in_oklab,var(--cloud)_15%,white)] text-[var(--cloud)]`;
  }
  if (graded && !selected && optionIndex === answerIndex) {
    return `${base} border-dashed border-[var(--device)] text-[var(--device)]`;
  }
  if (selected) return `${base} border-primary bg-primary/10 text-primary`;
  return `${base} border-border text-muted-foreground hover:border-primary/50`;
}
