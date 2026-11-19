"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Explain dialog (v3).
//
// When half the class fails Q3, the teacher needs an "explain this differently"
// button, not a blank stare. One question → a warm re-explanation at a chosen
// reading level, with an everyday analogy — generated through the same hybrid
// engine (device-preferred: explanations are student-facing), badged with where
// it ran, and readable aloud with the browser's on-device speech synthesis.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  Lightbulb,
  Loader2,
  Sparkles,
  Volume2,
  BookOpenCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RoutingBadge } from "./RoutingBadge";
import { useGrounded } from "@/lib/grounded/store";
import { explainConcept } from "@/lib/grounded/aiEngine";
import { speak, stopSpeaking, speechAvailable } from "@/lib/grounded/speech";
import type { RouteSource } from "@/lib/grounded/types";
import type { RawExplainResponse } from "@/lib/grounded/schemas";

interface ExplainResult extends RawExplainResponse {
  route: RouteSource;
  model: string;
}

export function ExplainDialog({
  question,
  context,
  open,
  onOpenChange,
}: {
  question: string;
  /** Source material the quiz was built from — grounds the explanation. */
  context: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const config = useGrounded((s) => s.config);
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);
  // Initialized at mount; the parent remounts this dialog per question
  // (keyed on the question text), so state resets naturally — no effect
  // resetting state needed.
  const [readingGrade, setReadingGrade] = useState(config.gradeLevel);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);

  // Stop any read-aloud when the dialog goes away.
  useEffect(() => () => stopSpeaking(), []);

  async function generate() {
    setBusy(true);
    try {
      const r = await explainConcept(question, context, readingGrade, routingPolicy);
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature: "explain-concept",
        source: r.route,
        model: r.model,
        latencyMs: r.latencyMs,
        inputChars: question.length + context.length,
        outputChars: JSON.stringify(r.data).length,
        simulated: r.simulated,
        offline: r.offline,
        inferred: r.inferred,
        note: `Explained at grade-${readingGrade} reading level.`,
      });
      setResult({ ...r.data, route: r.route, model: r.model });
    } catch {
      toast.error(
        "The explainer could not run. Try again — or switch routing to Auto in Settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Explain it differently
          </DialogTitle>
          <DialogDescription className="text-left">
            A warm, simpler re-explanation of this question&apos;s concept — for the
            student who didn&apos;t get it the first time.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {question}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Explain for reading level</Label>
            <span className="text-sm font-semibold">Grade {readingGrade}</span>
          </div>
          <Slider
            value={[readingGrade]}
            min={3}
            max={12}
            step={1}
            onValueChange={([v]) => setReadingGrade(v)}
            className="mt-2"
            aria-label="Reading level"
          />
        </div>

        <Button className="w-full gap-2" onClick={generate} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Rephrasing…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {result ? "Explain again" : "Explain for this student"}
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <RoutingBadge source={result.route} size="sm" />
              {speechAvailable() && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() =>
                    speak(
                      `${result.explanation} Here is an easy way to think about it: ${result.analogy}`,
                      "en",
                    )
                  }
                >
                  <Volume2 className="h-3.5 w-3.5" /> Listen
                </Button>
              )}
            </div>
            <div className="rounded-lg border p-3 text-sm leading-relaxed">
              {result.explanation}
            </div>
            <div className="rounded-lg border border-dashed bg-[color-mix(in_oklab,var(--device)_6%,white)] p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--device)]">
                <BookOpenCheck className="h-3.5 w-3.5" /> An everyday analogy
              </p>
              {result.analogy}
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Explanations prefer the on-device tier — student-facing, private.
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
