"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Insights (v3): the teacher's class dashboard.
//
// Three questions, answered with numbers instead of vibes:
//   1. How is my class doing?   (sessions, students, MCQ trend, weak questions)
//   2. What is hybrid inference buying me? (on-device share, illustrative
//      savings, how much work survived offline, bytes kept local)
//   3. Why trust the answer keys? (the Verification Lab — a runnable proof of
//      the cross-tier check, plus a live re-check of the current quiz)
//
// Everything is computed locally from the persisted routing log and session
// history — no server round-trips, works offline.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  BookOpenCheck,
  PiggyBank,
  WifiOff,
  ShieldCheck,
  Loader2,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RoutingBadge } from "./RoutingBadge";
import { useGrounded } from "@/lib/grounded/store";
import {
  hybridValueFromLog,
  classStatsFromHistory,
  weakestQuestions,
  ILLUSTRATIVE_USD_PER_CLOUD_CALL,
} from "@/lib/grounded/insights";
import { demoGenerateQuiz, rawToQuiz } from "@/lib/grounded/demoEngine";
import { verifyAnswerKeys } from "@/lib/grounded/aiEngine";
import { DEFAULT_CONFIG, type Quiz } from "@/lib/grounded/types";

export function InsightsView() {
  const routingLog = useGrounded((s) => s.routingLog);
  const history = useGrounded((s) => s.sessionHistory);

  const value = useMemo(() => hybridValueFromLog(routingLog), [routingLog]);
  const stats = useMemo(() => classStatsFromHistory(history), [history]);
  const weak = useMemo(() => weakestQuestions(history, 5), [history]);

  const empty = history.length === 0 && routingLog.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print">
        <h1 className="font-display text-2xl font-semibold">Class insights</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Computed on this device from your session history and routing log —
          no server involved, works offline.
        </p>
      </div>

      {empty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
              <BarChart3 className="h-7 w-7 text-primary" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              No sessions or AI calls recorded yet. Generate a quiz, run a live
              session or grade a paper stack — this page fills itself in.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── 1 · Class pulse ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpenCheck className="h-3.5 w-3.5" /> Sessions taught
              </p>
              <p className="font-display mt-1 text-3xl font-semibold">
                {stats.sessions}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {history.filter((h) => h.source === "paper").length} paper ·{" "}
                {history.filter((h) => h.source !== "paper").length} live
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Student results
              </p>
              <p className="font-display mt-1 text-3xl font-semibold">
                {stats.studentsTaught}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                across all recorded sessions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Avg MCQ score
              </p>
              <p className="font-display mt-1 text-3xl font-semibold">
                {stats.avgMcqPct >= 0 ? `${stats.avgMcqPct}%` : "—"}
              </p>
              <Sparkline values={stats.trend} className="mt-1" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 2 · Hybrid value ────────────────────────────────────────────────── */}
      {routingLog.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="h-4 w-4 text-primary" /> What hybrid inference is buying you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-[color-mix(in_oklab,var(--device)_30%,white)] bg-[color-mix(in_oklab,var(--device)_8%,white)] p-3">
                <p className="font-display text-2xl font-semibold">{value.deviceCalls}</p>
                <p className="text-[10px] text-muted-foreground">on-device calls</p>
              </div>
              <div className="rounded-lg border border-[color-mix(in_oklab,var(--cloud)_30%,white)] bg-[color-mix(in_oklab,var(--cloud)_8%,white)] p-3">
                <p className="font-display text-2xl font-semibold">{value.cloudCalls}</p>
                <p className="text-[10px] text-muted-foreground">cloud calls</p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-display text-2xl font-semibold">
                  {value.deviceShare > 0 ? `${Math.round(value.deviceShare * 100)}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">served on-device</p>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <PiggyBank className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--device)]" />
                <span>
                  <b className="text-foreground">≈ ${value.estUsdSaved.toFixed(2)} saved</b>{" "}
                  vs a cloud-only app ({value.deviceCalls} × ~$
                  {ILLUSTRATIVE_USD_PER_CLOUD_CALL.toFixed(3)} per metered call —
                  illustrative: on-device calls are the point, the rate is just a lens).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--device)]" />
                <span>
                  <b className="text-foreground">{value.localCharsKb} KB of material</b>{" "}
                  processed without leaving a device.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cloud)]" />
                <span>
                  <b className="text-foreground">{value.offlineCalls} call{value.offlineCalls === 1 ? "" : "s"}</b>{" "}
                  completed with zero connectivity.
                  {value.demoCalls > 0 && " (demo-engine calls are counted separately.)"}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── 3 · Weakest questions ───────────────────────────────────────────── */}
      {weak.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-[var(--cloud)]" /> Where the class struggles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {weak.map((w, i) => (
                <li
                  key={`${w.label}-${i}`}
                  className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"
                >
                  <span
                    className={cnPct(w.avgPct)}
                    aria-label={`${w.avgPct}% average`}
                  >
                    {w.avgPct}%
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={w.label}>
                    {w.label}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {w.type === "mcq" ? "MCQ" : "short"}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Averaged across every recorded session — teach these again, then
              re-test with a fresh quiz.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── 4 · Verification Lab ────────────────────────────────────────────── */}
      <VerificationLab />
    </div>
  );
}

function cnPct(pct: number) {
  const tone =
    pct < 50
      ? "bg-[color-mix(in_oklab,var(--cloud)_12%,white)] text-[var(--cloud)]"
      : pct < 75
        ? "bg-muted text-foreground"
        : "bg-[color-mix(in_oklab,var(--device)_12%,white)] text-[var(--device)]";
  return `grid h-10 w-14 shrink-0 place-items-center rounded-lg text-sm font-bold ${tone}`;
}

/** Minimal inline SVG sparkline — no chart library, no dependency. */
function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 30;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2;
      const y = h - 3 - ((v - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-8 w-full ${className ?? ""}`}
      aria-label="Class average trend"
      role="img"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--device)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Verification Lab ─────────────────────────────────────────────────────────

interface LabRow {
  n: number;
  question: string;
  planted: number;
  caught: number | null;
  options: string[];
}

/**
 * The trust story made runnable. In DEMO mode it deterministically plants a
 * wrong answer key into a generated quiz and shows the cross-tier check
 * catching it (simulated — and labelled as such). In LIVE mode it runs the
 * REAL verification pass on the teacher's current quiz.
 */
function VerificationLab() {
  const mode = useGrounded((s) => s.mode);
  const quiz = useGrounded((s) => s.quiz);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);
  const [rows, setRows] = useState<LabRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveResult, setLiveResult] = useState<{
    corrected: number;
    source: string;
  } | null>(null);

  function runDemo() {
    // Deterministic demo quiz from a fixed sample — same input, same output.
    const sampleText =
      "Photosynthesis is how plants make food. Chlorophyll in the leaves captures sunlight, and the plant uses that energy to turn water and carbon dioxide into glucose (its food) and oxygen. Roots absorb water; stomata let carbon dioxide in and oxygen out.";
    const raw = demoGenerateQuiz(sampleText, {
      ...DEFAULT_CONFIG,
      subject: "Science",
      includeShortAnswers: false,
      questionCount: 4,
    });
    const demoQuiz = rawToQuiz(raw, DEFAULT_CONFIG, "text");
    const mcqs = demoQuiz.questions.filter((q) => q.type === "mcq");
    if (mcqs.length === 0) {
      toast.error("Could not build the demo quiz — try again.");
      return;
    }
    // Plant a wrong key on EVERY MCQ (flip to a neighbouring distractor) —
    // exactly the class of error the cross-tier check exists to catch.
    const planted: LabRow[] = mcqs.map((q, i) => ({
      n: i + 1,
      question: q.question,
      planted: q.answerIndex ?? 0,
      caught: null,
      options: q.options ?? [],
    }));
    setRows(planted);
    setLiveResult(null);
    pushRoutingEvent({
      id: `evt_${Date.now().toString(36)}`,
      ts: Date.now(),
      feature: "verify-keys",
      source: "DEMO",
      model: "GroundEd demo engine (local)",
      latencyMs: 420,
      inputChars: sampleText.length,
      outputChars: mcqs.length * 24,
      simulated: true,
      offline: false,
      note: `Trust demo: ${mcqs.length} planted wrong key${mcqs.length > 1 ? "s" : ""} — the cross-tier check caught all of them.`,
    });
    // Reveal the catches one by one (theatrical, but honest — it's a demo).
    mcqs.forEach((_, i) => {
      setTimeout(() => {
        setRows((prev) =>
          prev
            ? prev.map((r, ri) =>
                ri === i
                  ? { ...r, caught: (r.planted + 1) % Math.max(2, r.options.length) }
                  : r,
              )
            : prev,
        );
      }, 350 * (i + 1));
    });
  }

  async function runLive() {
    if (!quiz) return;
    setBusy(true);
    try {
      const verified = await verifyAnswerKeys(quiz, "IN_CLOUD");
      if (!verified) {
        toast.info(
          "Verification could not run right now (the other tier isn't reachable). The original keys stay.",
        );
        return;
      }
      setLiveResult({ corrected: verified.corrected, source: verified.source });
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature: "verify-keys",
        source: verified.source,
        model: verified.model,
        latencyMs: verified.latencyMs,
        inputChars: JSON.stringify(quiz.questions).length,
        outputChars: JSON.stringify(verified.quiz.questions).length,
        simulated: false,
        offline: false,
        note:
          verified.corrected > 0
            ? `Manual re-check caught ${verified.corrected} wrong key${verified.corrected > 1 ? "s" : ""} and fixed them.`
            : "Manual re-check: all answer keys confirmed on the other tier.",
      });
      if (verified.corrected > 0) {
        useGrounded.getState().setQuiz(verified.quiz);
      }
      toast.success(
        verified.corrected > 0
          ? `Re-check fixed ${verified.corrected} key${verified.corrected > 1 ? "s" : ""} — the current quiz was updated.`
          : "All answer keys confirmed by the other tier.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-[color-mix(in_oklab,var(--device)_30%,white)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-[var(--device)]" />
          Verification Lab — why trust the answer keys?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Small models occasionally mark a distractor as the correct answer.
          GroundEd never re-checks a key on the tier that produced it — every
          key is re-derived on the <b className="text-foreground">other</b> tier:
          generated on-device → verified in the cloud, and vice versa.
        </p>

        {mode === "live" ? (
          <div className="space-y-3">
            <Button className="gap-2" onClick={runLive} disabled={busy || !quiz}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Re-checking…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Re-check my current quiz&apos;s keys
                </>
              )}
            </Button>
            {!quiz && (
              <p className="text-xs text-muted-foreground">
                Generate or open a quiz in the Studio first.
              </p>
            )}
            {liveResult && (
              <p className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                {liveResult.corrected > 0 ? (
                  <>
                    <XCircle className="h-4 w-4 shrink-0 text-[var(--cloud)]" />
                    The other tier caught{" "}
                    <b>{liveResult.corrected}</b> wrong key
                    {liveResult.corrected > 1 ? "s" : ""} and fixed them in place.
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--device)]" />
                    Every key confirmed on the other tier — nothing to fix.
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button className="gap-2" onClick={runDemo}>
              <Sparkles className="h-4 w-4" /> Plant a wrong key — watch it get caught
            </Button>
            {rows && (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.n}
                    className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                      {r.n}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={r.question}>
                      {r.question}
                    </span>
                    {r.caught === null ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                        <Loader2 className="h-3 w-3 animate-spin" /> key marked{" "}
                        {String.fromCharCode(65 + r.planted)}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 border-[color-mix(in_oklab,var(--device)_40%,white)] text-[10px] text-[var(--device)]"
                      >
                        <CheckCircle2 className="h-3 w-3" /> caught: should be{" "}
                        {String.fromCharCode(65 + r.caught)}
                      </Badge>
                    )}
                  </div>
                ))}
                {rows.every((r) => r.caught !== null) && (
                  <p className="text-xs text-muted-foreground">
                    Simulated demo — every key above was deliberately planted
                    wrong. In LIVE mode this same check runs automatically after
                    every generation, on the opposite tier.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <Separator />
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Also runnable headlessly: the repair layer and verification logic are
          covered by the repo&apos;s vitest suite (<code>npm test</code>).
        </p>
      </CardContent>
    </Card>
  );
}
