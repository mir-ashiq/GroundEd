"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — the app (at /studio; views switch client-side so the whole
// product keeps working offline after first load, and can be exported as a
// fully static site for Firebase Hosting). The marketing landing lives at /.
//
// Built for #BuildHybridAI 2026 · Google (Firebase) · Devpost.
// ─────────────────────────────────────────────────────────────────────────────

import { AppShell } from "@/components/grounded/AppShell";
import { StudioView } from "@/components/grounded/StudioView";
import { LiveView } from "@/components/grounded/LiveView";
import { StudentView } from "@/components/grounded/StudentView";
import { ErrorBoundary } from "@/components/grounded/ErrorBoundary";
import { useGrounded } from "@/lib/grounded/store";

export default function Studio() {
  const view = useGrounded((s) => s.view);
  return (
    <ErrorBoundary>
      <AppShell>
        {view === "studio" && <StudioView />}
        {view === "live" && <LiveView />}
        {view === "student" && <StudentView />}
      </AppShell>
    </ErrorBoundary>
  );
}
