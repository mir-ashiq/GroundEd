"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Studio: the teacher's generation flow (v2 "Teach Kit").
//
// Import material → configure → generate (hybrid inference) → then work in
// three spaces, all fed by the SAME material and the SAME hybrid engine:
//   • Quiz  — editable questions, differentiated Support/Extension versions,
//             printable worksheet with answer key, go live, share as a file.
//   • Teach — a full timed lesson plan (objectives, sections, homework,
//             differentiation) — printable.
//   • Study — an AI flashcard deck students can revise from.
//
// The routing badge on every action is the product's signature.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardPaste,
  ImagePlus,
  Sparkles,
  Trash2,
  RefreshCw,
  Printer,
  Radio,
  Save,
  FileText,
  Wand2,
  Check,
  X,
  GraduationCap,
  Layers,
  FileDown,
  FileUp,
  Languages,
  Loader2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Shuffle,
  FileStack,
  Lightbulb,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { RoutingBadge, DevicePerks } from "./RoutingBadge";
import { useGrounded } from "@/lib/grounded/store";
import {
  generateQuiz,
  generateLessonPlan,
  generateFlashcards,
  verifyAnswerKeys,
} from "@/lib/grounded/aiEngine";
import {
  SAMPLE_MATERIALS,
  rawToQuiz,
} from "@/lib/grounded/demoEngine";
import {
  loadLibrary,
  saveToLibrary,
  removeFromLibrary,
  quizToFileContent,
  quizFromFileContent,
  downloadTextFile,
} from "@/lib/grounded/sessions";
import {
  BLOOMS_LEVELS,
  LANGUAGE_LABELS,
  LANGUAGES,
  type AIFeature,
  type Quiz,
  type BloomsLevel,
  type GenerationConfig,
  type LessonPlan,
  type FlashcardDeck,
  type VariantKind,
} from "@/lib/grounded/types";
import { extractPdfText } from "@/lib/grounded/pdf";
import { ExplainDialog } from "./ExplainDialog";
import {
  review as srsReview,
  loadDeckStates,
  saveDeckStates,
  deckStats,
  isDue,
  isMastered,
  SRS_BUTTONS,
  newSrsState,
  type SRSCardState,
} from "@/lib/grounded/srs";
import { speak, stopSpeaking, speechAvailable } from "@/lib/grounded/speech";

type Workspace = "quiz" | "teach" | "study";

/** Human-readable failure explanations. The raw SDK message is logged to the
 *  console for debugging; the teacher sees plain language + next steps. */
function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function humanizeError(err: unknown, offline: boolean, modelReady: boolean): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (offline && !modelReady) {
    return "You're offline and this browser has no on-device model, so nothing can run right now. Reconnect to use the cloud tier — or open GroundEd in Chrome 139+ (Prompt API enabled) and tap \"Prepare offline AI\" in Settings first, so generation keeps working in airplane mode.";
  }
  if (/timeout/i.test(raw)) {
    return "The model took too long to answer. Try again — if it keeps happening, switching routing to Auto in Settings usually helps.";
  }
  if (/failed to fetch|networkerror|fetch failed|offline/i.test(raw)) {
    return "Couldn't reach the AI service. Check your connection and try again — the routing badge will show where the retry landed.";
  }
  if (/app check|attestation/i.test(raw)) {
    return "App Check attestation was rejected. If this persists, the deployment's debug token needs re-registering in the Firebase console.";
  }
  if (/quota|429|resource.?exhausted/i.test(raw)) {
    return "The cloud model is rate-limited right now. Wait a moment and retry — or use the on-device tier (Settings \u2192 Prepare offline AI).";
  }
  if (/permission|403|unauthenticated/i.test(raw)) {
    return "The AI service rejected the request (permissions). A teacher account may need to re-authenticate.";
  }
  if (/on-?device|prompt api|nano/i.test(raw)) {
    return "The on-device model isn't available in this browser. Switch routing to Auto (Settings) so the cloud tier can take over.";
  }
  return "Generation didn't complete. Try again — if it keeps failing, switching routing to Auto in Settings usually helps.";
}

export function StudioView() {
  const importPayload = useGrounded((s) => s.importPayload);
  const setImportPayload = useGrounded((s) => s.setImportPayload);
  const config = useGrounded((s) => s.config);
  const setConfig = useGrounded((s) => s.setConfig);
  const quiz = useGrounded((s) => s.quiz);
  const setQuiz = useGrounded((s) => s.setQuiz);
  const generating = useGrounded((s) => s.generating);
  const setGenerating = useGrounded((s) => s.setGenerating);
  const lastRoute = useGrounded((s) => s.lastRoute);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);
  const setView = useGrounded((s) => s.setView);
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const variants = useGrounded((s) => s.variants);
  const variantsBusy = useGrounded((s) => s.variantsBusy);

  // v2 workspaces
  const [workspace, setWorkspace] = useState<Workspace>("quiz");
  // v3 — explain tool: which question is being re-explained
  const [explainQ, setExplainQ] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const activeVariant: VariantKind = useMemo(() => {
    if (!variants) return "onlevel";
    if (variants.support?.id === quiz?.id) return "support";
    if (variants.extension?.id === quiz?.id) return "extension";
    return "onlevel";
  }, [quiz, variants]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [library, setLibrary] = useState<Quiz[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quizFileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // localStorage is not available during SSR — load the library one frame
  // after mount (past hydration).
  useEffect(() => {
    const id = requestAnimationFrame(() => setLibrary(loadLibrary()));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasMaterial =
    (importPayload?.kind === "text" && (importPayload.text?.length ?? 0) > 80) ||
    (importPayload?.kind === "image" && !!importPayload.imageBase64);

  // ── Image handling with client-side downscale (on-device models cap at
  //    9216 tokens — keep images compact so Nano can serve them). Canvas
  //    re-encoding also normalizes EXIF orientation from phone cameras. ──────
  async function handleImage(file: File) {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      toast.error("Please choose a PNG or JPEG photo of the material.");
      return;
    }
    const { dataUrl, base64, mime } = await downscaleImage(file, 1280);
    setImagePreview(dataUrl);
    setImportPayload({
      kind: "image",
      imageBase64: base64,
      imageMime: mime,
      fileName: file.name,
      text: "",
    });
    toast.success("Photo attached — it will be read by the AI when you generate.");
  }

  function clearImage() {
    setImagePreview(null);
    setImportPayload(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function loadSample(idx: number) {
    const sample = SAMPLE_MATERIALS[idx];
    setImportPayload({ kind: "text", text: sample.text });
    setConfig({ subject: sample.subject });
    setActiveTab("paste");
    toast.success(`Loaded sample: ${sample.label}`);
  }

  /** Import a PDF — the text layer is extracted in the browser (pdf.js),
   *  so it feeds the SAME path as pasted text and works on-device/offline.
   *  Scanned PDFs (no text layer) are redirected to the Photo tab honestly. */
  async function handlePdf(file: File) {
    if (file.size > 15_000_000) {
      toast.error("That PDF is too large — keep it under 15 MB.");
      return;
    }
    setPdfBusy(true);
    try {
      const r = await extractPdfText(file);
      if (!r.ok) {
        toast.error(r.text, { duration: 7000 });
        return;
      }
      setImportPayload({ kind: "text", text: r.text, fileName: file.name });
      setConfig({ subject: inferSubject(file.name) });
      setActiveTab("paste");
      toast.success(
        `Extracted ${r.pages} page${r.pages > 1 ? "s" : ""} locally — no upload, works offline.`,
      );
    } finally {
      setPdfBusy(false);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = "";
    }
  }

  /** Import a .txt / .md file as source material (works fully offline). */
  function handleTextFile(file: File) {
    if (file.size > 2_000_000) {
      toast.error("That file is too large — keep source material under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (text.trim().length < 80) {
        toast.error("That file has too little text to build from.");
        return;
      }
      setImportPayload({ kind: "text", text, fileName: file.name });
      setConfig({ subject: inferSubject(file.name) });
      setActiveTab("paste");
      toast.success(`Imported ${file.name}`);
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
  }

  /** Import a .grounded.json quiz shared by another teacher. */
  function handleQuizFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = quizFromFileContent(String(reader.result ?? ""));
        saveToLibrary(imported);
        setQuiz(imported);
        setLibrary(loadLibrary());
        toast.success(`Loaded "${imported.title}" from file.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not import that quiz file.");
      }
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
  }

  function exportQuizFile() {
    if (!quiz) return;
    const safe = quiz.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadTextFile(`${safe || "quiz"}.grounded.json`, quizToFileContent(quiz));
    toast.success("Quiz exported — share it by pen-drive or chat, no server needed.");
  }

  // ── Generation ────────────────────────────────────────────────────────────
  async function onGenerate(feature: AIFeature = "generate-quiz", replaceIndex?: number) {
    if (!importPayload) return;
    setGenerating(true);
    if (replaceIndex === undefined) setQuiz(null);
    try {
      const result = await generateQuiz(importPayload, config, routingPolicy);
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature,
        source: result.route,
        model: result.model,
        latencyMs: result.latencyMs,
        inputChars:
          (importPayload.text?.length ?? 0) + (importPayload.imageBase64?.length ?? 0),
        outputChars: JSON.stringify(result.data).length,
        simulated: result.simulated,
        offline: result.offline,
        inferred: result.inferred,
        note: result.note,
      });
      const fresh = rawToQuiz(result.data, config, importPayload.kind);
      if (replaceIndex !== undefined && quiz) {
        const questions = [...quiz.questions];
        if (fresh.questions[replaceIndex]) {
          questions[replaceIndex] = {
            ...fresh.questions[replaceIndex],
            id: questions[replaceIndex].id,
          };
        }
        setQuiz({ ...quiz, questions });
        toast.success("Question regenerated.");
      } else {
        setQuiz(fresh);
        useGrounded.getState().setVariants({ onLevel: fresh });
        setWorkspace("quiz");
        toast.success(
          result.route === "ON_DEVICE"
            ? "Quiz generated fully on-device — private and free."
            : result.route === "IN_CLOUD"
              ? "Quiz generated via cloud fallback."
              : "Quiz generated by the local demo engine.",
        );
        // Async CROSS-TIER answer-key verification — a second hybrid pass on
        // the OTHER tier re-derives every MCQ key and updates the quiz in
        // place. It never blocks the teacher; the routing inspector logs it.
        if (!result.simulated) {
          void verifyAnswerKeys(fresh, result.route).then((verified) => {
            if (!verified) return;
            // Only apply if the teacher hasn't replaced the quiz meanwhile.
            const current = useGrounded.getState().quiz;
            if (!current || current.id !== fresh.id) return;
            setQuiz(verified.quiz);
            const v = useGrounded.getState().variants;
            if (v?.onLevel?.id === fresh.id) {
              useGrounded.getState().setVariants({
                ...v,
                onLevel: verified.quiz,
              });
            }
            pushRoutingEvent({
              id: `evt_${Date.now().toString(36)}`,
              ts: Date.now(),
              feature: "verify-keys",
              source: verified.source,
              model: verified.model,
              latencyMs: verified.latencyMs,
              inputChars: JSON.stringify(fresh.questions).length,
              outputChars: JSON.stringify(verified.quiz.questions).length,
              simulated: false,
              offline: result.offline,
              note: verified.crossTier
                ? verified.corrected > 0
                  ? `Cross-tier check caught ${verified.corrected} wrong key${verified.corrected > 1 ? "s" : ""} and fixed them.`
                  : "Cross-tier check: all answer keys confirmed on the other tier."
                : "Answer keys re-derived by a second pass.",
            });
            if (verified.crossTier && verified.corrected > 0) {
              toast.success(
                `Cross-tier check fixed ${verified.corrected} answer key${verified.corrected > 1 ? "s" : ""} — the other tier caught it.`,
              );
            }
          });
        }
      }
    } catch (err) {
      console.error("[GroundEd] generation failed:", err);
      const modelReady = useGrounded.getState().modelStatus.phase === "ready";
      toast.error(humanizeError(err, isOfflineNow(), modelReady));
    } finally {
      setGenerating(false);
    }
  }

  // ── Differentiation: same material at another grade band ──────────────────
  async function generateVariant(kind: "support" | "extension") {
    if (!importPayload) return;
    const delta = kind === "support" ? -2 : 2;
    const targetGrade = Math.min(12, Math.max(3, config.gradeLevel + delta));
    const variants = useGrounded.getState().variants;
    if (variants?.[kind]) {
      setQuiz(variants[kind]);
      return;
    }
    useGrounded.getState().setVariantsBusy(kind);
    try {
      const variantConfig: GenerationConfig = {
        ...config,
        gradeLevel: targetGrade,
        blooms: kind === "support" ? "Remember" : "Analyze",
      };
      const result = await generateQuiz(importPayload, variantConfig, routingPolicy);
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature: "generate-quiz",
        source: result.route,
        model: result.model,
        latencyMs: result.latencyMs,
        inputChars: (importPayload.text?.length ?? 0),
        outputChars: JSON.stringify(result.data).length,
        simulated: result.simulated,
        offline: result.offline,
        inferred: result.inferred,
        note: `Differentiated ${kind} version (grade ${targetGrade}).`,
      });
      const variantQuiz = rawToQuiz(result.data, variantConfig, importPayload.kind);
      const v = useGrounded.getState().variants;
      useGrounded.getState().setVariants({
        ...(v ?? { onLevel: quiz ?? undefined }),
        [kind]: variantQuiz,
      } as typeof v);
      setQuiz(variantQuiz);
      toast.success(
        `${kind === "support" ? "Support" : "Extension"} version ready — grade ${targetGrade} version of the same material.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? `Could not build the ${kind} version: ${err.message}` : "Could not build that version.",
      );
    } finally {
      useGrounded.getState().setVariantsBusy(null);
    }
  }

  function switchVariant(kind: VariantKind) {
    const v = useGrounded.getState().variants;
    if (!v) return;
    if (kind === "onlevel") {
      if (v.onLevel) setQuiz(v.onLevel);
      return;
    }
    if (v[kind]) setQuiz(v[kind]);
    else void generateVariant(kind);
  }

  // ── Local UI state for the left import tabs ────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>("paste");

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* ── Left: import + configuration ─────────────────────────────────── */}
      <div className="no-print space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardPaste className="h-4 w-4 text-primary" />
              1 · Bring your material
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="paste" className="text-xs gap-1">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Text
                </TabsTrigger>
                <TabsTrigger value="photo" className="text-xs gap-1">
                  <ImagePlus className="h-3.5 w-3.5" /> Photo
                </TabsTrigger>
                <TabsTrigger value="file" className="text-xs gap-1">
                  <FileUp className="h-3.5 w-3.5" /> File
                </TabsTrigger>
                <TabsTrigger value="sample" className="text-xs gap-1">
                  <Wand2 className="h-3.5 w-3.5" /> Samples
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3">
                <Textarea
                  value={importPayload?.kind === "text" ? (importPayload.text ?? "") : ""}
                  onChange={(e) =>
                    setImportPayload({ kind: "text", text: e.target.value })
                  }
                  placeholder="Paste a passage, textbook section, or lesson notes (min. 80 characters)…"
                  className="min-h-[180px] resize-y text-sm"
                  aria-label="Source material"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {importPayload?.kind === "text"
                    ? `${importPayload.text?.length ?? 0} chars`
                    : "0 chars"}
                </p>
              </TabsContent>

              <TabsContent value="photo" className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImage(f);
                  }}
                />
                {imagePreview ? (
                  <div className="space-y-2">
                    <img
                      src={imagePreview}
                      alt="Uploaded classroom material"
                      className="max-h-52 w-full rounded-lg border object-contain bg-muted/30"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {importPayload?.fileName} · read as multimodal input
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={clearImage}
                      >
                        <X className="h-3 w-3" /> Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    <ImagePlus className="h-8 w-8 text-muted-foreground/60" />
                    <span className="font-medium">Photograph a textbook page</span>
                    <span className="text-xs">PNG or JPEG · read on-device when possible</span>
                  </button>
                )}
              </TabsContent>

              <TabsContent value="file" className="mt-3 space-y-3">
                <input
                  ref={textFileInputRef}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleTextFile(f);
                    if (textFileInputRef.current) textFileInputRef.current.value = "";
                  }}
                />
                <button
                  onClick={() => textFileInputRef.current?.click()}
                  className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <FileUp className="h-7 w-7 text-muted-foreground/60" />
                  <span className="font-medium">Import a .txt or .md file</span>
                  <span className="text-xs">Notes, chapters, syllabus text — read locally</span>
                </button>
                <input
                  ref={pdfFileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePdf(f);
                  }}
                />
                <button
                  onClick={() => pdfFileInputRef.current?.click()}
                  disabled={pdfBusy}
                  className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
                >
                  {pdfBusy ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="font-medium">Extracting text in your browser…</span>
                    </>
                  ) : (
                    <>
                      <FileStack className="h-5 w-5 text-muted-foreground/60" />
                      <span className="font-medium">Import a PDF</span>
                      <span className="text-xs">Text extracted on-device — nothing uploaded</span>
                    </>
                  )}
                </button>
                <Separator />
                <input
                  ref={quizFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleQuizFile(f);
                    if (quizFileInputRef.current) quizFileInputRef.current.value = "";
                  }}
                />
                <button
                  onClick={() => quizFileInputRef.current?.click()}
                  className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Layers className="h-6 w-6 text-muted-foreground/60" />
                  <span className="font-medium">Open a shared quiz file</span>
                  <span className="text-xs">.grounded.json from another teacher — works offline</span>
                </button>
              </TabsContent>

              <TabsContent value="sample" className="mt-3 space-y-2">
                {SAMPLE_MATERIALS.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => loadSample(i)}
                    className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    {s.label}
                  </button>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              2 · Shape the material
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Subject</Label>
                <Input
                  value={config.subject}
                  onChange={(e) => setConfig({ subject: e.target.value })}
                  className="mt-1"
                  placeholder="Science"
                />
              </div>
              <div>
                <Label className="text-xs">Bloom&apos;s depth</Label>
                <Select
                  value={config.blooms}
                  onValueChange={(v) => setConfig({ blooms: v as BloomsLevel })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOMS_LEVELS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {BLOOMS_LEVELS.find((b) => b.value === config.blooms)?.hint}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Grade level</Label>
                  <span className="text-sm font-semibold">
                    Grade {config.gradeLevel}
                  </span>
                </div>
                <Slider
                  value={[config.gradeLevel]}
                  min={3}
                  max={12}
                  step={1}
                  onValueChange={([v]) => setConfig({ gradeLevel: v })}
                  className="mt-2"
                  aria-label="Grade level"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Questions</Label>
                  <span className="text-sm font-semibold">
                    {config.questionCount}
                  </span>
                </div>
                <Slider
                  value={[config.questionCount]}
                  min={3}
                  max={12}
                  step={1}
                  onValueChange={([v]) => setConfig({ questionCount: v })}
                  className="mt-2"
                  aria-label="Question count"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5" /> Output language
              </Label>
              <Select
                value={config.language}
                onValueChange={(v) =>
                  setConfig({ language: v as GenerationConfig["language"] })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {config.language !== "en" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Non-English output leans on the cloud tier — the on-device model is
                  English-biased and will fall back honestly.
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Include short-answer questions</Label>
                <p className="text-xs text-muted-foreground">
                  Graded on-device by AI for privacy
                </p>
              </div>
              <Switch
                checked={config.includeShortAnswers}
                onCheckedChange={(v) => setConfig({ includeShortAnswers: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Include lesson outline</Label>
                <p className="text-xs text-muted-foreground">
                  4–6 teachable sections
                </p>
              </div>
              <Switch
                checked={config.includeOutline}
                onCheckedChange={(v) => setConfig({ includeOutline: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full gap-2 text-base"
          disabled={!hasMaterial || generating}
          onClick={() => onGenerate()}
        >
          {generating ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.span>
              Asking the model…
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Generate quiz
            </>
          )}
        </Button>

        <div className="flex items-center justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={lastRoute?.id ?? "routing-idle"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <RoutingBadge
                source={generating ? null : (lastRoute?.source ?? null)}
                size="lg"
                showSub
              />
            </motion.div>
          </AnimatePresence>
        </div>
        {lastRoute?.source === "ON_DEVICE" && <DevicePerks className="justify-center" />}
        {lastRoute?.offline && (
          <p className="text-center text-xs text-[var(--device)]">
            That call completed with no internet connection.
          </p>
        )}
      </div>

      {/* ── Right: workspaces ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        {generating && workspace === "quiz" ? (
          <QuizSkeleton />
        ) : (
          <Tabs value={workspace} onValueChange={(v) => setWorkspace(v as Workspace)}>
            <TabsList className="no-print grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="quiz" className="gap-1.5 text-xs">
                <Layers className="h-3.5 w-3.5" /> Quiz
              </TabsTrigger>
              <TabsTrigger value="teach" className="gap-1.5 text-xs">
                <GraduationCap className="h-3.5 w-3.5" /> Teach
              </TabsTrigger>
              <TabsTrigger value="study" className="gap-1.5 text-xs">
                <Wand2 className="h-3.5 w-3.5" /> Study
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quiz" className="mt-4 space-y-4">
              {quiz && (
                <>
                  <DifferentiationBar
                    active={activeVariant}
                    variants={variants}
                    busy={variantsBusy}
                    gradeLevel={config.gradeLevel}
                    onSwitch={switchVariant}
                  />
                  <QuizEditor
                    quiz={quiz}
                    onQuizChange={setQuiz}
                    onRegenerate={(i) => onGenerate("regenerate-question", i)}
                    busy={generating}
                    onPrint={() => window.print()}
                    onExport={exportQuizFile}
                    onExplain={(question) => {
                      setExplainQ(question);
                      setExplainOpen(true);
                    }}
                    onGoLive={() => {
                      saveToLibrary(quiz);
                      setLibrary(loadLibrary());
                      setView("live");
                    }}
                    onSave={() => {
                      saveToLibrary(quiz);
                      setLibrary(loadLibrary());
                      toast.success("Saved to library");
                    }}
                  />
                </>
              )}
              {!quiz && <EmptyStudio hasMaterial={hasMaterial} />}
            </TabsContent>

            <TabsContent value="teach" className="mt-4">
              <TeachWorkspace />
            </TabsContent>

            <TabsContent value="study" className="mt-4">
              <StudyWorkspace />
            </TabsContent>
          </Tabs>
        )}

        {library.length > 0 && (
          <Card className="no-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Library · saved quizzes (offline on this device)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-56">
                <ul className="space-y-1.5">
                  {library.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <button
                        className="flex-1 truncate text-left hover:underline"
                        onClick={() => setQuiz(q)}
                      >
                        {q.title}
                      </button>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        G{q.gradeLevel} · {q.questions.length}q
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Delete ${q.title}`}
                        onClick={() => {
                          removeFromLibrary(q.id);
                          setLibrary(loadLibrary());
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Print artifact — visible only when printing */}
      {quiz && <PrintWorksheet quiz={quiz} />}
      <LessonPlanPrint />

      {/* v3 — explain-it-differently dialog (grounds on the source material).
   *       Keyed per question so each explanation starts fresh. */}
      <ExplainDialog
        key={explainQ ?? "none"}
        question={explainQ ?? ""}
        context={importPayload?.text ?? ""}
        open={explainOpen}
        onOpenChange={setExplainOpen}
      />
    </div>
  );
}

// ── Differentiation bar ──────────────────────────────────────────────────────

function DifferentiationBar({
  active,
  variants,
  busy,
  gradeLevel,
  onSwitch,
}: {
  active: VariantKind;
  variants: { onLevel?: Quiz; support?: Quiz; extension?: Quiz } | null;
  busy: "support" | "extension" | null;
  gradeLevel: number;
  onSwitch: (kind: VariantKind) => void;
}) {
  const canSupport = gradeLevel - 2 >= 3;
  const canExtend = gradeLevel + 2 <= 12;
  const chip = (kind: VariantKind, label: string, hint: string, enabled: boolean) => {
    const isActive = active === kind;
    const exists = kind === "onlevel" ? !!variants?.onLevel : !!variants?.[kind];
    const isBusy = busy === kind;
    return (
      <button
        key={kind}
        disabled={!enabled || isBusy}
        onClick={() => onSwitch(kind)}
        className={cn(
          "no-print flex-1 rounded-xl border px-3 py-2 text-left transition-colors",
          isActive
            ? "border-primary bg-primary/10"
            : "hover:bg-muted/60 disabled:opacity-40",
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {label}
          {exists && !isActive && <Check className="h-3 w-3 text-[var(--device)]" />}
        </span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </button>
    );
  };
  return (
    <div className="no-print flex flex-wrap gap-2">
      {chip("onlevel", `On-level · G${gradeLevel}`, "the version you configured", true)}
      {chip(
        "support",
        `Support · G${Math.max(3, gradeLevel - 2)}`,
        canSupport ? "simpler language, recall focus" : "grade is already at the floor",
        canSupport,
      )}
      {chip(
        "extension",
        `Extension · G${Math.min(12, gradeLevel + 2)}`,
        canExtend ? "deeper reasoning, analysis focus" : "grade is already at the ceiling",
        canExtend,
      )}
    </div>
  );
}

// ── Teach workspace (lesson plans) ───────────────────────────────────────────

function TeachWorkspace() {
  const importPayload = useGrounded((s) => s.importPayload);
  const config = useGrounded((s) => s.config);
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const lessonPlan = useGrounded((s) => s.lessonPlan);
  const setLessonPlan = useGrounded((s) => s.setLessonPlan);
  const planGenerating = useGrounded((s) => s.planGenerating);
  const setPlanGenerating = useGrounded((s) => s.setPlanGenerating);
  const lastRoute = useGrounded((s) => s.lastRoute);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);

  const hasMaterial =
    (importPayload?.kind === "text" && (importPayload.text?.length ?? 0) > 80) ||
    (importPayload?.kind === "image" && !!importPayload.imageBase64);

  async function onGeneratePlan() {
    if (!importPayload) return;
    setPlanGenerating(true);
    try {
      const result = await generateLessonPlan(importPayload, config, routingPolicy);
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature: "generate-lesson-plan",
        source: result.route,
        model: result.model,
        latencyMs: result.latencyMs,
        inputChars: importPayload.text?.length ?? 0,
        outputChars: JSON.stringify(result.data).length,
        simulated: result.simulated,
        offline: result.offline,
        inferred: result.inferred,
      });
      const plan: LessonPlan = {
        id: `plan_${Date.now().toString(36)}`,
        title: result.data.title || `${config.subject} lesson`,
        subject: config.subject,
        gradeLevel: config.gradeLevel,
        durationMin: Number(result.data.durationMin) || 40,
        objectives: (result.data.objectives ?? []).slice(0, 6),
        materials: (result.data.materials ?? []).slice(0, 8),
        sections: (result.data.sections ?? [])
          .filter((s) => s && s.heading)
          .slice(0, 8)
          .map((s) => ({
            heading: s.heading,
            minutes: Number(s.minutes) || 5,
            teacherDoes: s.teacherDoes ?? "",
            studentsDo: s.studentsDo ?? "",
          })),
        homework: result.data.homework ?? "",
        support: result.data.support ?? "",
        extension: result.data.extension ?? "",
        createdAt: Date.now(),
      };
      setLessonPlan(plan);
      toast.success(
        result.route === "ON_DEVICE"
          ? "Lesson plan generated fully on-device."
          : "Lesson plan ready.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? `Could not build the plan: ${err.message}` : "Could not build the plan.",
      );
    } finally {
      setPlanGenerating(false);
    }
  }

  if (!lessonPlan && !planGenerating) {
    return (
      <Card className="no-print border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <GraduationCap className="h-7 w-7 text-primary" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              {hasMaterial ? "Turn the material into a lesson plan" : "Bring material first"}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {hasMaterial
                ? "Objectives, timed sections (what you do / what students do), homework, and support & extension notes — printable, from the same material as the quiz."
                : "Paste or photograph material on the left — then generate a full 40-minute plan through hybrid inference."}
            </p>
          </div>
          {hasMaterial && (
            <Button className="gap-2" onClick={onGeneratePlan}>
              <Sparkles className="h-4 w-4" /> Generate lesson plan
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {planGenerating && !lessonPlan && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </CardContent>
        </Card>
      )}
      {lessonPlan && (
        <>
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <RoutingBadge source={planGenerating ? null : (lastRoute?.feature === "generate-lesson-plan" ? lastRoute.source : null)} size="sm" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print plan
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={planGenerating || !hasMaterial} onClick={onGeneratePlan}>
                {planGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Regenerate
              </Button>
            </div>
          </div>
          <LessonPlanCard plan={lessonPlan} />
        </>
      )}
    </div>
  );
}

function LessonPlanCard({ plan }: { plan: LessonPlan }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-xl">{plan.title}</CardTitle>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">Grade {plan.gradeLevel}</Badge>
          <Badge variant="secondary">{plan.subject}</Badge>
          <Badge variant="secondary">{plan.durationMin} min</Badge>
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {plan.objectives.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Learning objectives</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground marker:text-primary">
              {plan.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        {plan.materials.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Materials</h3>
            <p className="text-sm text-muted-foreground">{plan.materials.join(" · ")}</p>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold">Lesson flow</h3>
          <div className="space-y-3">
            {plan.sections.map((s, i) => (
              <div key={i} className="rounded-xl border p-4 print-avoid-break">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-medium">
                    {i + 1}. {s.heading}
                  </h4>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {s.minutes} min
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-lg bg-muted/50 p-2.5">
                    <span className="font-medium">You:</span>{" "}
                    <span className="text-muted-foreground">{s.teacherDoes}</span>
                  </p>
                  <p className="rounded-lg bg-muted/50 p-2.5">
                    <span className="font-medium">Students:</span>{" "}
                    <span className="text-muted-foreground">{s.studentsDo}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {plan.homework && (
            <div className="rounded-xl border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Homework</h4>
              <p className="mt-1 text-sm">{plan.homework}</p>
            </div>
          )}
          {plan.support && (
            <div className="rounded-xl border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Support</h4>
              <p className="mt-1 text-sm">{plan.support}</p>
            </div>
          )}
          {plan.extension && (
            <div className="rounded-xl border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extension</h4>
              <p className="mt-1 text-sm">{plan.extension}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Print-only lesson plan (rendered only when printing). */
function LessonPlanPrint() {
  const plan = useGrounded((s) => s.lessonPlan);
  if (!plan) return null;
  return (
    <div className="print-only worksheet-paper">
      <div className="print-page">
        <h1>{plan.title}</h1>
        <p style={{ fontSize: "10pt" }}>
          {plan.subject} · Grade {plan.gradeLevel} · {plan.durationMin} minutes
        </p>
        <hr />
        {plan.objectives.length > 0 && (
          <div style={{ marginTop: "10pt" }}>
            <p style={{ fontWeight: 600 }}>Objectives</p>
            <ul style={{ margin: "4pt 0 0 14pt" }}>
              {plan.objectives.map((o, i) => (
                <li key={i} style={{ fontSize: "10pt" }}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: "12pt" }}>
          <p style={{ fontWeight: 600 }}>Lesson flow</p>
          {plan.sections.map((s, i) => (
            <div key={i} className="print-avoid-break" style={{ marginTop: "10pt" }}>
              <p style={{ fontWeight: 600 }}>
                {i + 1}. {s.heading} ({s.minutes} min)
              </p>
              <p style={{ margin: 0, fontSize: "10pt" }}>You: {s.teacherDoes}</p>
              <p style={{ margin: 0, fontSize: "10pt" }}>Students: {s.studentsDo}</p>
            </div>
          ))}
        </div>
        {plan.homework && (
          <p style={{ marginTop: "12pt", fontSize: "10pt" }}>
            <strong>Homework:</strong> {plan.homework}
          </p>
        )}
        {plan.support && (
          <p style={{ fontSize: "10pt" }}>
            <strong>Support:</strong> {plan.support}
          </p>
        )}
        {plan.extension && (
          <p style={{ fontSize: "10pt" }}>
            <strong>Extension:</strong> {plan.extension}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Study workspace (flashcards) ────────────────────────────────────────────

function StudyWorkspace() {
  const importPayload = useGrounded((s) => s.importPayload);
  const config = useGrounded((s) => s.config);
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const deck = useGrounded((s) => s.deck);
  const setDeck = useGrounded((s) => s.setDeck);
  const deckGenerating = useGrounded((s) => s.deckGenerating);
  const setDeckGenerating = useGrounded((s) => s.setDeckGenerating);
  const pushRoutingEvent = useGrounded((s) => s.pushRoutingEvent);

  const [flipped, setFlipped] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [srs, setSrs] = useState<Record<string, SRSCardState>>({});
  const [reviewedCount, setReviewedCount] = useState(0);

  const hasMaterial =
    (importPayload?.kind === "text" && (importPayload.text?.length ?? 0) > 80) ||
    (importPayload?.kind === "image" && !!importPayload.imageBase64);

  // Load persisted scheduling state + build the study queue (due first).
  useEffect(() => {
    if (!deck) return;
    const id = requestAnimationFrame(() => {
      const states = loadDeckStates(deck.id);
      setSrs(states);
      setQueue(
        deck.cards
          .map((c, i) => ({ i, dueAt: states[c.id]?.dueAt ?? 0 }))
          .sort((a, b) => a.dueAt - b.dueAt)
          .map((x) => x.i),
      );
      setIndex(0);
      setFlipped(false);
      setReviewedCount(0);
    });
    return () => cancelAnimationFrame(id);
  }, [deck]);

  // Stop any read-aloud when leaving the workspace.
  useEffect(() => () => stopSpeaking(), []);

  async function onGenerateDeck() {
    if (!importPayload) return;
    setDeckGenerating(true);
    try {
      const result = await generateFlashcards(importPayload, config, routingPolicy);
      pushRoutingEvent({
        id: `evt_${Date.now().toString(36)}`,
        ts: Date.now(),
        feature: "generate-flashcards",
        source: result.route,
        model: result.model,
        latencyMs: result.latencyMs,
        inputChars: importPayload.text?.length ?? 0,
        outputChars: JSON.stringify(result.data).length,
        simulated: result.simulated,
        offline: result.offline,
        inferred: result.inferred,
      });
      const cards = (result.data.cards ?? [])
        .filter((c) => c && c.front && c.back)
        .slice(0, 16);
      const d: FlashcardDeck = {
        id: `deck_${Date.now().toString(36)}`,
        title: result.data.title || `${config.subject} revision`,
        cards: cards.map((c, i) => ({ id: `c_${i + 1}`, front: c.front, back: c.back })),
        createdAt: Date.now(),
      };
      if (d.cards.length === 0) throw new Error("The model returned no usable cards — try again.");
      setDeck(d);
      toast.success(
        result.route === "ON_DEVICE"
          ? "Deck generated fully on-device — study it in airplane mode."
          : "Deck ready.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not build the deck.",
      );
    } finally {
      setDeckGenerating(false);
    }
  }

  /** One SM-2 review step: update state, persist, advance (lapsed cards come
   *  back to the end of today's queue — that's how relearning works). */
  function answer(quality: 0 | 3 | 4 | 5) {
    if (!deck) return;
    const cardIdx = queue[index];
    if (cardIdx === undefined) return;
    const card = deck.cards[cardIdx];
    const next = srsReview(srs[card.id] ?? newSrsState(), quality);
    const states = { ...srs, [card.id]: next };
    setSrs(states);
    saveDeckStates(deck.id, states);
    setReviewedCount((n) => n + 1);
    setFlipped(false);
    setQueue((q) => (quality < 3 ? [...q, cardIdx] : q));
    setIndex((i) => i + 1);
  }

  if (!deck && !deckGenerating) {
    return (
      <Card className="no-print border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <Wand2 className="h-7 w-7 text-primary" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              {hasMaterial ? "Build a revision deck" : "Bring material first"}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {hasMaterial
                ? "Flashcards from the same material — one idea per card, with spaced-repetition scheduling (SM-2) so revision plans itself. Cards can be read aloud for younger readers."
                : "Paste or photograph material on the left — then generate a study deck."}
            </p>
          </div>
          {hasMaterial && (
            <Button className="gap-2" onClick={onGenerateDeck}>
              <Sparkles className="h-4 w-4" /> Generate flashcards
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (deckGenerating && !deck) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Building the deck…</p>
        </CardContent>
      </Card>
    );
  }

  if (!deck) return null;
  const stats = deckStats(
    srs,
    deck.cards.map((c) => c.id),
  );
  const cardIdx = queue[index];
  const card = cardIdx !== undefined ? deck.cards[cardIdx] : undefined;
  const sessionDone = cardIdx === undefined;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {deck.title}{" "}
          <span className="text-muted-foreground">
            · {Math.min(index, queue.length)}/{queue.length}
          </span>
        </p>
        <div className="flex gap-1.5">
          <Badge variant="outline" className="gap-1 text-[10px]">
            {stats.due} due
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            {stats.learning} learning
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-[color-mix(in_oklab,var(--device)_40%,white)] text-[10px] text-[var(--device)]"
          >
            {stats.mastered} mastered
          </Badge>
        </div>
      </div>

      {sessionDone ? (
        <Card className="border-[color-mix(in_oklab,var(--device)_30%,white)]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--device)_10%,white)]">
              <Check className="h-7 w-7 text-[var(--device)]" />
            </span>
            <h2 className="font-display text-xl font-semibold">
              Deck finished — {reviewedCount} review{reviewedCount === 1 ? "" : "s"} today
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              SM-2 scheduled the rest: failed cards come back tomorrow, easy
              cards in weeks. Your progress is saved on this device — open the
              deck again any day and only the due cards queue up.
            </p>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setQueue((q) => [...q]);
                setIndex(0);
                setFlipped(false);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Study again from the top
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="no-print flex justify-end">
            {speechAvailable() && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() =>
                  speak(flipped ? card!.back : card!.front, config.language === "en" ? "en" : config.language)
                }
              >
                <Volume2 className="h-3.5 w-3.5" /> Listen
              </Button>
            )}
          </div>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="block w-full text-left"
            aria-label={flipped ? "Show question" : "Reveal answer"}
          >
            <motion.div
              key={`${card!.id}-${flipped}`}
              initial={{ rotateX: flipped ? -70 : 70, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className={cn(
                "flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 p-8 text-center shadow-sm",
                flipped
                  ? "border-[color-mix(in_oklab,var(--device)_45%,white)] bg-[color-mix(in_oklab,var(--device)_6%,white)]"
                  : "border-border bg-card",
              )}
            >
              <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                {flipped ? "Answer" : "Question"}
              </Badge>
              <p className={cn("font-display leading-snug", flipped ? "text-lg" : "text-xl font-semibold")}>
                {flipped ? card!.back : card!.front}
              </p>
              <p className="text-[11px] text-muted-foreground">tap to flip</p>
            </motion.div>
          </button>

          {flipped ? (
            <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SRS_BUTTONS.map((b) => (
                <Button
                  key={b.label}
                  variant={b.tone === "again" ? "destructive" : b.tone === "good" ? "default" : "outline"}
                  className="flex-col gap-0.5 py-2"
                  onClick={() => answer(b.quality)}
                >
                  <span className="text-sm font-semibold">{b.label}</span>
                  <span className="text-[10px] font-normal opacity-80">{b.hint}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="no-print flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={index === 0}
                onClick={() => {
                  setFlipped(false);
                  setIndex((i) => i - 1);
                }}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setQueue((q) => [...q].sort(() => Math.random() - 0.5));
                  setIndex(0);
                  setFlipped(false);
                }}
              >
                <Shuffle className="h-4 w-4" /> Shuffle
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={() => setFlipped(true)}
              >
                Show answer <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <div className="no-print flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Spaced repetition (SM-2) schedules each card from how well you rated
          it — progress stays on this device, offline.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs text-muted-foreground"
          disabled={deckGenerating || !hasMaterial}
          onClick={onGenerateDeck}
        >
          {deckGenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          New deck
        </Button>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyStudio({ hasMaterial }: { hasMaterial: boolean }) {
  return (
    <Card className="no-print border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <Sparkles className="h-7 w-7 text-primary" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">
            {hasMaterial
              ? "Ready when you are"
              : "Bring material, get a teaching kit"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {hasMaterial
              ? "Press Generate — the routing badge will show exactly where the AI ran."
              : "Paste a passage, photograph a textbook page, import a file or load a sample. One material becomes a quiz, a lesson plan, and a flashcard deck — generation prefers Gemini Nano on-device: private, free, and it works in airplane mode."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuizSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-5">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="space-y-2 pt-2">
              {[0, 1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="h-8 animate-pulse rounded bg-muted"
                  style={{ animationDelay: `${j * 120}ms` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Quiz editor ──────────────────────────────────────────────────────────────

function QuizEditor({
  quiz,
  onQuizChange,
  onRegenerate,
  onPrint,
  onGoLive,
  onSave,
  onExport,
  onExplain,
  busy,
}: {
  quiz: Quiz;
  onQuizChange: (q: Quiz) => void;
  onRegenerate: (index: number) => void;
  onPrint: () => void;
  onGoLive: () => void;
  onSave: () => void;
  onExport: () => void;
  onExplain: (question: string) => void;
  busy: boolean;
}) {
  const bloomsHint = useMemo(
    () => BLOOMS_LEVELS.find((b) => b.value === quiz.bloomsLevel)?.hint,
    [quiz.bloomsLevel],
  );

  function updateQuestion(idx: number, patch: Partial<Quiz["questions"][number]>) {
    const questions = quiz.questions.map((q, i) =>
      i === idx ? { ...q, ...patch } : q,
    );
    onQuizChange({ ...quiz, questions });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Input
              value={quiz.title}
              onChange={(e) => onQuizChange({ ...quiz, title: e.target.value })}
              className="border-none px-0 font-display text-xl font-semibold shadow-none focus-visible:ring-0"
              aria-label="Quiz title"
            />
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">Grade {quiz.gradeLevel}</Badge>
              <Badge variant="secondary">{quiz.subject}</Badge>
              <Badge variant="secondary">{quiz.bloomsLevel}</Badge>
              <span className="hidden sm:inline">· {bloomsHint}</span>
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onSave}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
              <FileDown className="h-3.5 w-3.5" /> Share file
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onPrint}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onGoLive}>
              <Radio className="h-3.5 w-3.5" /> Go live
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {quiz.outline.length > 0 && (
          <div className="no-print rounded-xl border bg-muted/40 p-4">
            <h3 className="mb-2 text-sm font-semibold">Lesson outline</h3>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground marker:text-primary">
              {quiz.outline.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="space-y-3">
          {quiz.questions.map((q, idx) => (
            <div
              key={q.id}
              className="no-print rounded-xl border p-4 print-avoid-break"
            >
              <div className="flex items-start gap-2">
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <Textarea
                  value={q.question}
                  onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                  className="min-h-[52px] flex-1 resize-none border-none px-1 text-sm shadow-none focus-visible:ring-1"
                  aria-label={`Question ${idx + 1}`}
                />
                <div className="flex shrink-0 flex-col gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      q.type === "mcq"
                        ? "border-primary/30 text-primary"
                        : "border-[var(--cloud)]/40 text-[var(--cloud)]",
                    )}
                  >
                    {q.type === "mcq" ? "MCQ" : "Short"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {q.blooms}
                  </Badge>
                </div>
              </div>

              {q.type === "mcq" && q.options && (
                <div className="mt-3 space-y-1.5 pl-8">
                  {q.options.map((opt, oi) => (
                    <label
                      key={oi}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                        q.answerIndex === oi
                          ? "border-[color-mix(in_oklab,var(--device)_40%,white)] bg-[color-mix(in_oklab,var(--device)_7%,white)]"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => updateQuestion(idx, { answerIndex: oi })}
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                          q.answerIndex === oi
                            ? "border-[var(--device)] bg-[var(--device)] text-white"
                            : "border-muted-foreground/40",
                        )}
                        aria-label={`Mark option ${String.fromCharCode(65 + oi)} correct`}
                      >
                        {q.answerIndex === oi && <Check className="h-3 w-3" />}
                      </button>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const options = [...q.options!];
                          options[oi] = e.target.value;
                          updateQuestion(idx, { options });
                        }}
                        className="h-7 flex-1 border-none px-1 shadow-none focus-visible:ring-0"
                        aria-label={`Option ${String.fromCharCode(65 + oi)}`}
                      />
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {String.fromCharCode(65 + oi)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === "short" && (
                <div className="mt-2 pl-8">
                  <p className="text-xs text-muted-foreground">
                    Reference answer (used for private on-device grading):
                  </p>
                  <Textarea
                    value={q.answerKey ?? ""}
                    onChange={(e) => updateQuestion(idx, { answerKey: e.target.value })}
                    className="mt-1 min-h-[46px] resize-none text-xs"
                    aria-label="Reference answer"
                  />
                </div>
              )}

              <div className="mt-2 flex justify-end gap-1 pl-8">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => onExplain(q.question)}
                >
                  <Lightbulb className="h-3 w-3" /> Explain
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={busy}
                  onClick={() => onRegenerate(idx)}
                >
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() =>
                    onQuizChange({
                      ...quiz,
                      questions: quiz.questions.filter((_, i) => i !== idx),
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Print worksheet (rendered only in print media) ───────────────────────────

export function PrintWorksheet({ quiz }: { quiz: Quiz }) {
  return (
    <div className="print-only worksheet-paper">
      <div className="print-page">
        <h1>{quiz.title}</h1>
        <p className="mt-1" style={{ fontSize: "10pt" }}>
          {quiz.subject} · Grade {quiz.gradeLevel} · Name: ______________________
          Date: ____________
        </p>
        <hr />
        <ol style={{ margin: "14pt 0 0 0", padding: 0, listStyle: "decimal" }}>
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="print-avoid-break" style={{ marginBottom: "12pt" }}>
              <p style={{ fontWeight: 600 }}>{q.question}</p>
              {q.type === "mcq" && q.options ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4pt 12pt", marginLeft: "14pt", marginTop: "4pt" }}>
                  {q.options.map((opt, oi) => (
                    <p key={oi} style={{ margin: 0 }}>
                      <strong>{String.fromCharCode(65 + oi)}.</strong> {opt}
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <div className="answer-lines" style={{ marginTop: "6pt" }} />
                  <div className="answer-lines" style={{ marginTop: "6pt" }} />
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h1>Answer Key — {quiz.title}</h1>
        <ol style={{ listStyle: "decimal", marginLeft: "14pt" }}>
          {quiz.questions.map((q, i) => (
            <li key={q.id} style={{ marginBottom: "8pt" }}>
              {q.type === "mcq" && q.options
                ? `${String.fromCharCode(65 + (q.answerIndex ?? 0))}. ${q.options[q.answerIndex ?? 0]}`
                : (q.answerKey ?? "—")}
              <span style={{ fontStyle: "italic", fontSize: "9pt" }}> ({q.blooms})</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferSubject(fileName: string): string {
  const n = fileName.toLowerCase();
  if (/(sci|bio|phys|chem)/.test(n)) return "Science";
  if (/(math|alg|geom)/.test(n)) return "Mathematics";
  if (/(hist|civ|soc)/.test(n)) return "History";
  if (/(eng|lang|gram|lit)/.test(n)) return "English";
  return "General";
}

// ── Image downscale util ─────────────────────────────────────────────────────

async function downscaleImage(
  file: File,
  maxEdge: number,
): Promise<{ dataUrl: string; base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 1_200_000) {
    return {
      dataUrl,
      base64: dataUrl.split(",")[1] ?? "",
      mime: file.type,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, base64: dataUrl.split(",")[1] ?? "", mime: file.type };
  // DrawImage on a decoded <img> applies EXIF orientation automatically in
  // modern browsers, so re-encoding here also normalizes rotated photos.
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  return { dataUrl: out, base64: out.split(",")[1] ?? "", mime: "image/jpeg" };
}
