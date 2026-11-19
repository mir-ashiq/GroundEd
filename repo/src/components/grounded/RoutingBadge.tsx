"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — RoutingBadge: the signature hybrid-inference UI.
//
// Every AI action in GroundEd is stamped with WHERE the inference ran:
//   • ON-DEVICE (Gemini Nano, via Chrome Prompt API through Firebase AI Logic)
//   • CLOUD (Gemini cloud fallback, e.g. gemini-3.5-flash-lite)
//   • DEMO (local simulation when no Firebase project is configured)
//
// `response.inferenceSource` from the Firebase AI Logic SDK is the source of
// truth — the badge never guesses.
// ─────────────────────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Cloud,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Zap,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouteSource } from "@/lib/grounded/types";

const SOURCE_META: Record<
  RouteSource,
  { label: string; sub: string; icon: React.ElementType; cls: string }
> = {
  ON_DEVICE: {
    label: "On-device",
    sub: "Private · Free · Offline",
    icon: Cpu,
    cls: "bg-[color-mix(in_oklab,var(--device)_14%,white)] text-[var(--device)] border-[color-mix(in_oklab,var(--device)_35%,white)]",
  },
  IN_CLOUD: {
    label: "Cloud",
    sub: "Gemini cloud fallback",
    icon: Cloud,
    cls: "bg-[color-mix(in_oklab,var(--cloud)_14%,white)] text-[var(--cloud)] border-[color-mix(in_oklab,var(--cloud)_35%,white)]",
  },
  DEMO: {
    label: "Demo",
    sub: "Simulated locally",
    icon: FlaskConical,
    cls: "bg-muted text-muted-foreground border-border",
  },
};

export function RoutingBadge({
  source,
  size = "md",
  showSub = false,
  className,
}: {
  source: RouteSource | null;
  size?: "sm" | "md" | "lg";
  showSub?: boolean;
  className?: string;
}) {
  if (!source) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 py-1 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Routing…
      </span>
    );
  }
  const meta = SOURCE_META[source] ?? SOURCE_META.DEMO;
  const Icon = meta.icon;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={source}
        initial={{ scale: 0.85, opacity: 0, rotateX: -30 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        exit={{ scale: 0.85, opacity: 0, rotateX: 30 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border font-medium shadow-sm",
          size === "sm" && "px-2.5 py-0.5 text-[11px]",
          size === "md" && "px-3 py-1 text-xs",
          size === "lg" && "px-4 py-1.5 text-sm",
          meta.cls,
          className,
        )}
      >
        <Icon className={cn(size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5")} />
        <span>{meta.label}</span>
        {showSub && (
          <span className="hidden sm:inline opacity-70 font-normal">
            · {meta.sub}
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/** Persistent header chip: is this deployment running real Firebase AI Logic? */
export function ModeChip({ mode }: { mode: "live" | "demo" }) {
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--device)_35%,white)] bg-[color-mix(in_oklab,var(--device)_12%,white)] px-3 py-1 text-xs font-semibold text-[var(--device)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--device)] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--device)]" />
        </span>
        LIVE · Firebase AI Logic
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--cloud)] bg-[color-mix(in_oklab,var(--cloud)_10%,white)] px-3 py-1 text-xs font-semibold text-[var(--cloud)]">
      <FlaskConical className="h-3.5 w-3.5" />
      DEMO · simulated AI
    </span>
  );
}

/** Small chips summarizing why each tier matters — used beside the badge. */
export function DevicePerks({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-[11px] text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--device)]" /> Private
      </span>
      <span className="inline-flex items-center gap-1">
        <Zap className="h-3.5 w-3.5 text-[var(--device)]" /> Free
      </span>
      <span className="inline-flex items-center gap-1">
        <WifiOff className="h-3.5 w-3.5 text-[var(--device)]" /> Works offline
      </span>
    </span>
  );
}
