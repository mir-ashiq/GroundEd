import Link from "next/link";
import { Sprout, ArrowRight, Users, Home } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — 404. A mistyped join link (e.g. /join/OAK-482) used to strand a
// student on a bare "page could not be found". Now it hands them every door.
// ─────────────────────────────────────────────────────────────────────────────

export default function NotFound() {
  return (
    <div className="paper-canvas flex min-h-screen flex-col">
      <header className="border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-semibold">GroundEd</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center">
        <p className="font-display text-7xl font-bold text-primary">404</p>
        <h1 className="font-display text-2xl font-semibold">
          That page isn&apos;t here
        </h1>
        <p className="text-sm text-muted-foreground">
          Maybe the link was mistyped, or a session ended. If your teacher gave
          you a code, join from the app — everything runs from there.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/studio/"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
          >
            <Users className="h-4 w-4" /> Join your class
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            <Home className="h-4 w-4" /> Back to home <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
