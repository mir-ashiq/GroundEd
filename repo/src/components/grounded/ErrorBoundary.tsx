"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — top-level error boundary.
//
// A runtime crash anywhere in the app must never show a judge or a teacher a
// blank page: this boundary catches render errors and offers a clean recovery
// path (reload keeps the offline shell + Firestore cache intact).
// ─────────────────────────────────────────────────────────────────────────────

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error) {
    // Surface in console for debugging; no telemetry leaves the device.
    console.error("[GroundEd] render error:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="paper-canvas flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-7 w-7" />
            </span>
            <h1 className="font-display mt-4 text-xl font-semibold">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The app hit an unexpected error. Your saved quizzes and session
              history are safe on this device — reloading usually fixes it.
            </p>
            {this.state.message && (
              <p className="mt-2 rounded-lg bg-muted/60 p-2 font-mono text-[11px] text-muted-foreground">
                {this.state.message}
              </p>
            )}
            <Button className="mt-5 gap-2" onClick={() => window.location.reload()}>
              <RotateCcw className="h-4 w-4" /> Reload GroundEd
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
