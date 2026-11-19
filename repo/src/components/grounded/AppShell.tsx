"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — AppShell: header, navigation, routing inspector, settings.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Sprout,
  Activity,
  Settings2,
  WifiOff,
  Wifi,
  Cpu,
  Cloud,
  FlaskConical,
  Download,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  BookOpen,
  Radio,
  Users,
  ExternalLink,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ModeChip, RoutingBadge } from "./RoutingBadge";
import { useGrounded } from "@/lib/grounded/store";
import { firebaseEnabled, activateRemoteConfig, getAppCheck, getDb, getAuthInstance } from "@/lib/grounded/firebase";
import { checkDeviceAvailability, prepareDeviceModel } from "@/lib/grounded/aiEngine";
import type { ModelPhase, ViewId } from "@/lib/grounded/types";
import { resetDemoSession } from "@/lib/grounded/sessions";
import { doc, onSnapshot } from "firebase/firestore";

const NAV: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "studio", label: "Studio", icon: BookOpen },
  { id: "live", label: "Live session", icon: Radio },
  { id: "student", label: "Student join", icon: Users },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useGrounded((s) => s.view);
  const setView = useGrounded((s) => s.setView);
  const mode = useGrounded((s) => s.mode);
  const setMode = useGrounded((s) => s.setMode);
  const modelStatus = useGrounded((s) => s.modelStatus);
  const setModelStatus = useGrounded((s) => s.setModelStatus);
  const routingLog = useGrounded((s) => s.routingLog);
  const showDemoBanner = useGrounded((s) => s.showDemoBanner);
  const dismissDemoBanner = useGrounded((s) => s.dismissDemoBanner);
  const [online, setOnline] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Resolve mode + kick off Remote Config + availability probe.
  useEffect(() => {
    // Rehydrate persisted slices AFTER mount (hydration-safe — see store.ts).
    useGrounded.getState().rehydratePersisted();
    setMode(firebaseEnabled ? "live" : "demo");
    if (firebaseEnabled) {
      getAppCheck(); // initialize App Check before any AI Logic call
      activateRemoteConfig();
      checkDeviceAvailability().then(({ phase }) =>
        setModelStatus({ phase, lastChecked: Date.now() }),
      );
      // WARM-UP (v3.1): Firestore's first listener after a cold load can take
      // several seconds (IndexedDB cache + App Check + connection) — exactly
      // the latency a student hits when tapping “Join”. Pay it at boot instead
      // with a throwaway listener on a doc that will never exist.
      try {
        const stop = onSnapshot(
          doc(getDb(), "sessions", "WARMUP-000"),
          () => stop(),
          () => stop(),
        );
      } catch {
        /* warm-up is best-effort */
      }
      getAuthInstance(); // start session restore early too
    }
    // Deep link: /studio/#join=CODE jumps STRAIGHT to the student join flow
    // (a student opening a shared link should never land in the teacher Studio).
    if (typeof window !== "undefined") {
      const m = window.location.hash.match(/join=([A-Za-z]+-\d{3,4})/);
      if (m) {
        useGrounded.getState().setJoinCodePrefill(m[1].toUpperCase());
        useGrounded.getState().setView("student");
      }
    }
    // Register the offline app-shell service worker (production builds only).
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline shell is an enhancement; ignore failures */
      });
    }
  }, [setMode, setModelStatus]);

  // Offline indicator.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const onPrepareModel = useCallback(async () => {
    setModelStatus({ phase: "downloading", progress: 0 });
    const policy = useGrounded.getState().routingPolicy;
    const ok = await prepareDeviceModel(policy, (p) =>
      setModelStatus({ phase: "downloading", progress: p }),
    );
    setModelStatus({
      phase: ok ? "ready" : "unavailable",
      progress: ok ? 1 : 0,
      lastChecked: Date.now(),
    });
  }, [setModelStatus]);

  const modelPill = useMemo(() => {
    if (mode === "demo") {
      return {
        text: "Demo engine",
        icon: FlaskConical,
        cls: "text-muted-foreground border-dashed",
      };
    }
    const phase: ModelPhase = modelStatus.phase;
    if (phase === "ready")
      return {
        text: "Nano ready",
        icon: CheckCircle2,
        cls: "text-[var(--device)] border-[color-mix(in_oklab,var(--device)_35%,white)]",
      };
    if (phase === "downloading")
      return {
        text: `Downloading ${Math.round(modelStatus.progress * 100)}%`,
        icon: Loader2,
        cls: "text-[var(--cloud)] border-[color-mix(in_oklab,var(--cloud)_35%,white)]",
      };
    if (phase === "downloadable")
      return {
        text: "Prepare offline AI",
        icon: Download,
        cls: "text-[var(--cloud)] border-[color-mix(in_oklab,var(--cloud)_35%,white)]",
      };
    return {
      text: "Cloud fallback",
      icon: Cloud,
      cls: "text-muted-foreground",
    };
  }, [mode, modelStatus]);

  const PillIcon = modelPill.icon;

  return (
    <div className="paper-canvas min-h-screen flex flex-col">
      {/* Header */}
      <header className="no-print sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setView("studio")}
            className="flex items-center gap-2.5 text-left"
            aria-label="GroundEd home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sprout className="h-5 w-5" />
            </span>
            <span>
              <span className="font-display block text-xl font-semibold leading-none">
                GroundEd
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                The classroom AI that works when the internet doesn&apos;t
              </span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <ModeChip mode={mode} />
            <button
              onClick={() => {
                setSettingsOpen(true);
              }}
              className={cn(
                "hidden md:inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium transition-colors hover:bg-muted",
                modelPill.cls,
              )}
            >
              <PillIcon
                className={cn("h-3.5 w-3.5", modelPill.text.includes("Downloading") && "animate-spin")}
              />
              {modelPill.text}
            </button>

            {/* Routing inspector */}
            <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                  <Activity className="h-4 w-4" />
                  <span className="hidden sm:inline">Routing</span>
                  {routingLog.length > 0 && (
                    <Badge className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                      {routingLog.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Routing inspector
                  </SheetTitle>
                </SheetHeader>
                <RoutingInspector />
              </SheetContent>
            </Sheet>

            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" /> Settings & offline AI
                  </SheetTitle>
                </SheetHeader>
                <SettingsPanel
                  onPrepareModel={onPrepareModel}
                  closeSheet={() => setSettingsOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
          </div>
        </div>

        {/* Nav tabs — labels collapse to icons under sm so the bar never
            overflows a 320–390px phone (the #1 mobile complaint). */}
        <nav
          className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-clip px-2 sm:px-6"
          aria-label="Main"
        >
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                aria-label={n.label}
                title={n.label}
                className={cn(
                  "relative flex min-h-11 flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-3",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{n.label}</span>
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
          <div className="ml-auto hidden items-center gap-1.5 py-2 text-xs text-muted-foreground lg:flex">
            {online ? (
              <Wifi className="h-3.5 w-3.5 text-[var(--device)]" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-[var(--cloud)]" />
            )}
            {online ? "Online" : "Offline — on-device features keep working"}
          </div>
        </nav>
      </header>

      {/* Demo banner — honest labelling, never pretend to be live */}
      {mode === "demo" && showDemoBanner && (
        <div className="no-print border-b border-dashed bg-[color-mix(in_oklab,var(--cloud)_8%,white)]">
          <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 text-xs sm:px-6">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cloud)]" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Demo mode.</span>{" "}
              No Firebase project is configured for this build, so AI responses
              are simulated locally by the GroundEd demo engine — every result
              is badged{" "}
              <RoutingBadge source="DEMO" size="sm" className="align-middle" />{" "}
              Add your Firebase config (see{" "}
              <code className="rounded bg-muted px-1 py-0.5">FIREBASE_SETUP.md</code>
              ) to switch this exact app to live Firebase AI Logic hybrid
              inference.
            </p>
            <button
              onClick={dismissDemoBanner}
              className="ml-auto shrink-0 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!online && (
        <div className="no-print border-b bg-muted">
          <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground sm:px-6">
            <WifiOff className="h-3.5 w-3.5" />
            You&apos;re offline. On-device generation and grading keep working;
            answers and sessions sync when you reconnect.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="no-print mt-auto border-t bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            GroundEd v3 · Built for{" "}
            <span className="font-medium text-foreground">#BuildHybridAI 2026</span>{" "}
            · Firebase AI Logic hybrid inference · Gemini Nano on-device
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--device)]" />
            Student answers stay on the device whenever possible
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Routing inspector panel ──────────────────────────────────────────────────

function RoutingInspector() {
  const log = useGrounded((s) => s.routingLog);
  const clear = useGrounded((s) => s.clearRoutingLog);

  const stats = useMemo(() => {
    const device = log.filter((e) => e.source === "ON_DEVICE").length;
    const cloud = log.filter((e) => e.source === "IN_CLOUD").length;
    const demo = log.filter((e) => e.source === "DEMO").length;
    const offline = log.filter((e) => e.offline).length;
    return { device, cloud, demo, offline };
  }, [log]);

  return (
    <div className="flex h-full flex-col gap-4 px-4 pb-6">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="On-device" value={stats.device} tone="device" />
        <Stat label="Cloud" value={stats.cloud} tone="cloud" />
        <Stat label="Demo" value={stats.demo} tone="muted" />
      </div>
      {stats.offline > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5" />
          {stats.offline} call{stats.offline > 1 ? "s" : ""} completed with no
          internet connection.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Every AI action is logged with the <code>inferenceSource</code> reported
        by the Firebase AI Logic SDK — on-device runs never send material to
        any server.
      </p>
      <Separator />
      <ScrollArea className="flex-1">
        {log.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No AI calls yet. Generate a quiz to see routing decisions here.
          </p>
        ) : (
          <ul className="space-y-2">
            {log.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border bg-card p-3 text-xs shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{featureLabel(e.feature)}</span>
                  <RoutingBadge source={e.source} size="sm" />
                </div>
                <p className="mt-1 text-muted-foreground">
                  {e.model} · {e.latencyMs} ms ·{" "}
                  {new Date(e.ts).toLocaleTimeString()}
                  {e.offline && " · offline"}
                  {e.inferred && " · source inferred"}
                </p>
                {e.note && (
                  <p className="mt-1 rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                    {e.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      {log.length > 0 && (
        <Button variant="outline" size="sm" onClick={clear}>
          Clear log
        </Button>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "device" | "cloud" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2",
        tone === "device" &&
          "border-[color-mix(in_oklab,var(--device)_30%,white)] bg-[color-mix(in_oklab,var(--device)_8%,white)]",
        tone === "cloud" &&
          "border-[color-mix(in_oklab,var(--cloud)_30%,white)] bg-[color-mix(in_oklab,var(--cloud)_8%,white)]",
        tone === "muted" && "bg-muted/50",
      )}
    >
      <p className="font-display text-xl font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function featureLabel(f: string) {
  switch (f) {
    case "generate-quiz":
      return "Quiz generation";
    case "grade-answer":
      return "Answer grading";
    case "regenerate-question":
      return "Question regenerate";
    case "verify-keys":
      return "Answer-key verification";
    case "generate-lesson-plan":
      return "Lesson plan";
    case "generate-flashcards":
      return "Flashcards";
    case "explain-concept":
      return "Explain tool";
    default:
      return f;
  }
}

// ── Settings panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  onPrepareModel,
  closeSheet,
}: {
  onPrepareModel: () => void;
  closeSheet: () => void;
}) {
  const routingPolicy = useGrounded((s) => s.routingPolicy);
  const setRoutingPolicy = useGrounded((s) => s.setRoutingPolicy);
  const modelStatus = useGrounded((s) => s.modelStatus);
  const mode = useGrounded((s) => s.mode);

  return (
    <div className="space-y-5 px-4 pb-8">
      {/* Routing policy */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">AI routing policy</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Controls the <code>InferenceMode</code> passed to Firebase AI Logic.
          Auto is recommended: on-device when the model is present, cloud
          fallback when it isn&apos;t.
        </p>
        <RadioGroup
          value={routingPolicy}
          onValueChange={(v) => setRoutingPolicy(v as typeof routingPolicy)}
          className="gap-2"
        >
          {[
            {
              value: "auto",
              label: "Auto — prefer on-device",
              hint: "PREFER_ON_DEVICE: Nano when available, cloud otherwise",
            },
            {
              value: "device",
              label: "On-device only",
              hint: "ONLY_ON_DEVICE: strict privacy; needs the downloaded model",
            },
            {
              value: "cloud",
              label: "Prefer cloud",
              hint: "PREFER_IN_CLOUD: heavier reasoning, needs connectivity",
            },
          ].map((opt) => (
            <Label
              key={opt.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal hover:bg-muted/50"
            >
              <RadioGroupItem value={opt.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {opt.hint}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </section>

      <Separator />

      {/* Offline model prep */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Offline AI preparation</h3>
        {mode === "demo" ? (
          <p className="text-xs text-muted-foreground">
            Demo mode uses the local demo engine — there is no model to
            download. In LIVE mode this card triggers{" "}
            <code>initializeDeviceModel()</code>, which downloads Gemini Nano
            to Chrome so inference works with zero connectivity.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Download Gemini Nano once (a few minutes, one time per device) and
              quiz generation + grading keep working in airplane mode. Requires
              Chrome Desktop 139+ with the Prompt API flag enabled.
            </p>
            {modelStatus.phase === "downloading" && (
              <div className="mb-3 space-y-1.5">
                <Progress value={modelStatus.progress * 100} />
                <p className="text-xs text-muted-foreground">
                  Downloading… {Math.round(modelStatus.progress * 100)}%
                </p>
              </div>
            )}
            {modelStatus.phase === "ready" && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-[var(--device)]">
                <CheckCircle2 className="h-4 w-4" /> On-device model ready —
                you can go offline.
              </p>
            )}
            <Button
              onClick={onPrepareModel}
              disabled={modelStatus.phase === "downloading"}
              className="w-full gap-2"
            >
              {modelStatus.phase === "downloading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {modelStatus.phase === "ready"
                ? "Re-check model"
                : "Prepare offline AI"}
            </Button>
          </>
        )}
      </section>

      <Separator />

      {/* Demo reset */}
      {mode === "demo" && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Demo session data</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Demo live sessions run over BroadcastChannel + localStorage on this
            machine. Reset clears the stored session and submissions.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetDemoSession();
              closeSheet();
            }}
          >
            Reset demo session
          </Button>
        </section>
      )}

      <Separator />

      {/* Stack info */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Under the hood</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--device)]" />
            {/* Keep the sentence in ONE flex item so "(PREFER_ON_DEVICE)" flows
                inline — bare text + element children become separate flex
                items, which orphans the ")" at the right edge. */}
            <span className="min-w-0">
              On-device: Gemini Nano via Chrome&apos;s Prompt API through
              Firebase AI Logic{" "}
              <span className="whitespace-nowrap">
                (<code>PREFER_ON_DEVICE</code>)
              </span>
            </span>
          </li>
          <li className="flex gap-2">
            <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cloud)]" />
            Cloud fallback: Gemini via Firebase AI Logic, with structured
            output on both tiers
          </li>
          <li>
            Firebase: AI Logic · App Check · Authentication · Firestore
            (offline persistence) · Remote Config (prompts + routing policy)
          </li>
          <li className="flex items-center gap-1.5 pt-1">
            <ExternalLink className="h-3.5 w-3.5" />
            Full architecture in the repository README
          </li>
        </ul>
      </section>
    </div>
  );
}
