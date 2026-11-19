"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — route-level error boundary (Next.js app router).
//
// Belt-and-braces alongside components/grounded/ErrorBoundary: catches render
// errors that escape the app shell and offers a friendly recovery path.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GroundEd] route error:", error);
  }, [error]);

  return (
    <div className="paper-canvas flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h2 className="font-display mt-4 text-xl font-semibold">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The app hit an unexpected error. Your saved quizzes and session
          history are safe on this device.
        </p>
        <Button className="mt-5 gap-2" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
