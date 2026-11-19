"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — landing-page interactive bits (the landing itself stays a zero-JS
// server component; these two are the only islands).
//
//  1. JoinStrip  — a student opening the ROOT url sees a code box, not a
//                  developer marketing page. Lands straight in the join flow.
//  2. DemoVideo  — "Watch the demo" opens an in-page modal instead of ejecting
//                  the visitor to a raw .mp4 in a bare browser player.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { ArrowRight, PlayCircle, Users, X } from "lucide-react";

export function JoinStrip() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function join() {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z]+-\d{3,4}$/.test(normalized)) {
      setError("Codes look like OAK-482 — ask your teacher.");
      return;
    }
    window.location.href = `/studio/#join=${normalized}`;
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-2xl border bg-card/80 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:gap-3">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          Student? Join your class:
        </span>
        <div className="flex w-full gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="OAK-482"
            aria-label="Class join code"
            aria-invalid={!!error}
            className="h-11 min-w-0 flex-1 rounded-full border bg-background px-4 text-center font-semibold tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={join}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
          >
            Join <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs font-medium text-destructive sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}

export function DemoVideo() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  function close() {
    videoRef.current?.pause();
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border bg-card px-6 py-3 text-base font-medium shadow-sm transition-colors hover:bg-muted"
      >
        <PlayCircle className="h-5 w-5 text-primary" /> Watch the demo
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="GroundEd demo video"
          onClick={close}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close video"
              className="absolute -top-11 right-0 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-4 text-sm font-medium text-white hover:bg-black/60"
            >
              <X className="h-4 w-4" /> Close
            </button>
            {/* Local file: the demo plays even with the network off — on-brand. */}
            <video
              ref={videoRef}
              src="/demo/GroundEd_demo_video.mp4"
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-2xl border border-white/10 bg-black shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
