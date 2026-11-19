// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — landing page (server component, zero client JS).
// The product itself lives at /studio. Built for #BuildHybridAI 2026.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Sprout,
  ArrowRight,
  PlayCircle,
  Cpu,
  Cloud,
  ShieldCheck,
  BookOpen,
  Printer,
  Radio,
  Activity,
  WifiOff,
  FlaskConical,
  Camera,
  Wand2,
  Users,
  Github,
  ExternalLink,
  BadgeCheck,
  GraduationCap,
  Layers,
  FileStack,
  BarChart3,
  Volume2,
} from "lucide-react";

const STUDIO_URL = "/studio/";
const VIDEO_URL = "/demo/GroundEd_demo_video.mp4";
const REPO_URL = "https://github.com/mir-ashiq/GroundEd";

function BadgeChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "device" | "cloud" | "neutral";
}) {
  const cls =
    tone === "device"
      ? "border-[color-mix(in_oklab,var(--device)_35%,white)] bg-[color-mix(in_oklab,var(--device)_10%,white)] text-[var(--device)]"
      : tone === "cloud"
        ? "border-[color-mix(in_oklab,var(--cloud)_40%,white)] bg-[color-mix(in_oklab,var(--cloud)_12%,white)] text-[color-mix(in_oklab,var(--cloud)_78%,black)]"
        : "border-border bg-card text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

const FEATURES: { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: BookOpen,
    title: "Quiz studio",
    body: "Paste text, import a .txt/.md/PDF or photograph a textbook page; pick grade level (3\u201312), Bloom's depth and question mix \u2014 get an editable quiz with a cross-verified answer key. PDFs are extracted in the browser \u2014 nothing uploaded.",
  },
  {
    icon: GraduationCap,
    title: "Lesson plans",
    body: "The same material becomes a timed 40-minute plan: objectives, what you do / what students do per section, homework, and support & extension notes. Printable.",
  },
  {
    icon: Printer,
    title: "Printable worksheet",
    body: "Real print CSS: name and date lines, MCQ option grids, short-answer rule lines and a separate answer-key page. Paper is the most reliable classroom device.",
  },
  {
    icon: Radio,
    title: "Live sessions",
    body: "A 6-character join code brings the class in on their phones. MCQs auto-check deterministically (students see their score instantly); short answers are graded by AI with a per-call routing badge.",
  },
  {
    icon: FileStack,
    title: "Paper mode",
    body: "No student devices? Print the worksheet, then type the class's answers once — MCQs auto-check and short answers are graded by the same privacy-biased engine, offline if needed. The audience's most common medium, supported end-to-end.",
  },
  {
    icon: Layers,
    title: "Differentiated versions",
    body: "One click re-builds the same material as a Support version (two grades simpler) and an Extension version (two grades deeper) \u2014 because real classrooms are mixed-ability.",
  },
  {
    icon: Wand2,
    title: "Flashcards, with spaced repetition",
    body: "A revision deck from the same lesson — scheduled by the SM-2 algorithm (the one behind Anki): failed cards come back tomorrow, easy cards in weeks. Progress lives on the device. Cards can be read aloud for younger readers.",
  },
  {
    icon: Volume2,
    title: "Read-aloud",
    body: "Questions, flashcards and re-explanations can be listened to with on-device speech synthesis — for younger and low-literacy learners. Free, offline, no AI call needed.",
  },
  {
    icon: BarChart3,
    title: "Class insights",
    body: "Sessions, student results, MCQ trends and the questions the class keeps getting wrong — computed locally from history. Plus a hybrid-value meter: what on-device routing saved you, in calls, KB and offline completions.",
  },
  {
    icon: ShieldCheck,
    title: "Cross-tier verification",
    body: "Answer keys generated on-device are re-derived in the cloud, and vice versa. Two independent brains check every key \u2014 a systematic mistake on one tier gets caught by the other.",
  },
  {
    icon: Activity,
    title: "Routing inspector",
    body: "Every AI call is logged with the SDK-reported inferenceSource, model, latency and offline status \u2014 the badge is never a guess.",
  },
  {
    icon: WifiOff,
    title: "Offline-first sync",
    body: "Answers submitted offline queue on the device (Firestore offline persistence) and sync on reconnect. Quizzes export as files \u2014 teacher-to-teacher sharing needs no server.",
  },
];

const STACK = [
  "Firebase AI Logic — hybrid inference",
  "Gemini Nano on-device (Chrome built-in AI)",
  "Gemini cloud fallback",
  "Firebase Authentication",
  "App Check",
  "Cloud Firestore — offline persistence",
  "Remote Config — prompts + routing policy",
  "Firebase Hosting",
];

export default function Landing() {
  return (
    <div className="paper-canvas min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
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
          </span>
          <nav className="ml-auto flex items-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              <Github className="h-3.5 w-3.5" /> Code
            </a>
            <a
              href={STUDIO_URL}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
            >
              Open the Studio <ArrowRight className="h-4 w-4" />
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <BadgeChip tone="device">
            <BadgeCheck className="h-3.5 w-3.5" />
            Built for #BuildHybridAI 2026 · Firebase AI Logic hybrid inference
          </BadgeChip>
          <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            The classroom AI that works when the{" "}
            <span className="text-[var(--device)]">internet doesn&apos;t.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            GroundEd is an offline-first <strong className="text-foreground">teaching kit</strong> for
            low-connectivity classrooms: quizzes, lesson plans, flashcards,
            live sessions, paper-stack grading and class insights — all from
            the same material. Every AI action runs through
            Firebase AI Logic hybrid inference — <strong className="text-foreground">Gemini Nano on the device</strong> when it&apos;s
            there, <strong className="text-foreground">Gemini in the cloud</strong> when it helps — and
            answer keys are verified on the <em>other</em> tier, so two
            independent brains check every question.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={STUDIO_URL}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.02]"
            >
              Open the Studio <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href={VIDEO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border bg-card px-6 py-3 text-base font-medium shadow-sm transition-colors hover:bg-muted"
            >
              <PlayCircle className="h-5 w-5 text-primary" /> Watch the demo
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <BadgeChip tone="device">
              <Cpu className="h-3.5 w-3.5" /> ON DEVICE · private · free · airplane mode
            </BadgeChip>
            <BadgeChip tone="cloud">
              <Cloud className="h-3.5 w-3.5" /> CLOUD · long documents · heavy lifting
            </BadgeChip>
            <BadgeChip tone="neutral">
              <ShieldCheck className="h-3.5 w-3.5" /> Student answers stay on the device whenever possible
            </BadgeChip>
          </div>
        </section>

        {/* ── Routing honesty ───────────────────────────────────────────── */}
        <section className="border-y bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--device)_30%,white)] bg-[color-mix(in_oklab,var(--device)_6%,white)] p-6">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-[var(--device)]" />
                <h3 className="font-display text-xl font-semibold">
                  On-device tier
                </h3>
                <BadgeChip tone="device">ON DEVICE</BadgeChip>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Gemini Nano through Chrome&apos;s built-in AI, driven by{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  InferenceMode.PREFER_ON_DEVICE
                </code>
                . Quiz generation and answer grading keep working in airplane
                mode — private and free, because they never leave the device.
              </p>
            </div>
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--cloud)_35%,white)] bg-[color-mix(in_oklab,var(--cloud)_7%,white)] p-6">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-[var(--cloud)]" />
                <h3 className="font-display text-xl font-semibold">
                  Cloud tier
                </h3>
                <BadgeChip tone="cloud">CLOUD</BadgeChip>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The same JSON schema is wired to both tiers — the cloud Gemini
                model takes over for long documents and heavier reasoning, or
                whenever no local model exists. One schema, two wiring paths (
                <code className="rounded bg-muted px-1 py-0.5 text-xs">responseSchema</code>{" "}
                /{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  responseConstraint
                </code>
                ).
              </p>
            </div>
          </div>
          <p className="mx-auto -mt-6 mb-10 max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
            The badge is driven by the SDK&apos;s own{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              response.inferenceSource
            </code>{" "}
            — never a guess.
          </p>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-center text-3xl font-semibold sm:text-4xl">
            From textbook page to live class — in three steps
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Camera,
                step: "1",
                title: "Bring your material",
                body: "Paste a passage or photograph a textbook page. Pick grade level 3–12, Bloom's depth and the question mix.",
              },
              {
                icon: Wand2,
                step: "2",
                title: "Generate anywhere",
                body: "A quiz with a cross-verified answer key, a full lesson plan, and a flashcard deck — on-device when possible, cloud when it helps, badged honestly either way.",
              },
              {
                icon: Users,
                step: "3",
                title: "Run the class — live or on paper",
                body: "Students join with a code on their phones, or answer on paper and the teacher types the stack in once. MCQs auto-check; short answers are graded by AI; offline answers queue and sync; results land on the Insights dashboard.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="relative rounded-2xl border bg-card p-6 shadow-sm"
              >
                <span className="font-display absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                  {s.step}
                </span>
                <s.icon className="h-6 w-6 text-primary" />
                <h3 className="font-display mt-3 text-lg font-semibold">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section className="border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-center text-3xl font-semibold sm:text-4xl">
              Everything a low-connectivity classroom needs
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10">
                      <f.icon className="h-5 w-5 text-primary" />
                    </span>
                    <h3 className="font-display text-base font-semibold">{f.title}</h3>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Impact ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                Built for the classrooms the cloud forgot
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Only <strong className="text-foreground">half of the world&apos;s primary schools</strong> have
                internet access for teaching (UNESCO UIS, 2025), and{" "}
                <strong className="text-foreground">2.2 billion people</strong> remain offline
                (ITU, 2025). Per-call API pricing is invisible budget poison
                for schools. GroundEd keeps the teacher working through all of
                it: the on-device tier is free and private, and the whole app
                ships as static files that keep running offline.
              </p>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
                <p className="font-display text-5xl font-bold text-[var(--device)]">50%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  of the world&apos;s primary schools have internet for teaching —
                  UNESCO UIS, 2025
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
                <p className="font-display text-5xl font-bold text-[var(--cloud)]">2.2B</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  people are still offline — ITU Facts &amp; Figures, 2025
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stack ─────────────────────────────────────────────────────── */}
        <section className="border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-center text-2xl font-semibold sm:text-3xl">
              The Firebase stack underneath
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {STACK.map((s) => (
                <span
                  key={s}
                  className="rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Try it with the network off.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
            Open the Studio, load a sample, hit Generate — then flip on airplane
            mode and keep going. Works best in Chrome (the on-device tier uses
            Chrome&apos;s built-in Gemini Nano; the cloud tier works everywhere).
          </p>
          <a
            href={STUDIO_URL}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-lg font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.02]"
          >
            Open the Studio <ArrowRight className="h-5 w-5" />
          </a>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            Built for{" "}
            <span className="font-medium text-foreground">#BuildHybridAI 2026</span>{" "}
            · Firebase AI Logic hybrid inference · Gemini Nano on-device
          </p>
          <p className="flex items-center gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" /> GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
            <span>Apache-2.0</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
