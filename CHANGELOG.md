# Changelog

All notable changes to GroundEd are documented here.

## 3.0.0 — "Classroom OS" (Nov 19, 2026)

GroundEd grows from a teaching kit into the teacher's whole workflow: paper
classrooms, class analytics, smarter revision, and a trust story you can run
in one click — still on one Firebase AI Logic hybrid engine with honest
routing badges.

### Added

- **Paper mode** — print the worksheet, students answer on paper, the teacher
  types the stack in once (MCQs become A–D taps, short answers a sentence
  each). MCQs auto-check deterministically; short answers run through the
  same privacy-biased hybrid grading engine — gradeable fully offline. CSV
  export + automatic session history, badged `PAPER-…` in the log.
- **Insights tab** — the class dashboard, computed locally from history and
  the routing log: sessions taught (live vs paper), student results, average
  MCQ trend (sparkline), and the questions the class keeps getting wrong
  (weighted across sessions). Plus the **hybrid-value meter**: on-device vs
  cloud call counts, illustrative savings vs a cloud-only app, KB of material
  kept local, and offline completions.
- **Verification Lab** — the cross-tier answer-key check made runnable: in
  DEMO mode it deterministically plants wrong keys and shows the check
  catching every one (labelled as a simulation); in LIVE mode it re-runs the
  real verification pass on the current quiz, in place.
- **Spaced repetition (SM-2)** — Study flashcards are now scheduled by the
  classic SM-2 algorithm (the one behind Anki): Again / Hard / Good / Easy,
  per-card ease and intervals, due-first queue, "mastered" at a 3-week gap.
  Progress persists per deck on the device.
- **Explain tool (UI)** — every question in the editor has an "Explain"
  button: a warm re-explanation at a chosen reading level (grade 3–12) with an
  everyday analogy, grounded in the source material. Device-preferred
  (student-facing = private), routing-badged, readable aloud.
- **Read-aloud** — questions in the student view, flashcards and explanations
  can be listened to via on-device speech synthesis (Web Speech API). Free,
  offline, no AI call — accessibility for younger and low-literacy learners.
- **PDF import** — PDFs are imported by extracting the text layer in the
  browser (pdf.js, worker bundled locally — no CDN). Text-layer PDFs feed the
  same path as pasted text, so they work on-device and offline; scanned PDFs
  are detected and redirected to the Photo tab with an honest message.
- **More output languages** — English, Hindi, Tamil, Telugu, Bengali and
  Marathi for quizzes, lesson plans and flashcards (cloud tier recommended
  for non-English; stated honestly in-app).
- **Session history enrichment** — every closed session (live or paper) now
  stores per-question class results and grading route counts, which is what
  powers Insights.

### Changed

- Study tab: the old "I know this" toggle is replaced by real SM-2
  scheduling (self-assessment quality instead of a binary flag).
- Live tab: a Live-class / Paper-stack switch replaces the single "start a
  session" card; past sessions now label their source.
- Landing page and README updated for the v3 surface area.

### Fixed

- The v2 red-team report claimed PDF import, paper-mode entry and the explain
  UI were shipped — they were not. All three actually exist now (and are
  covered by tests where the logic is pure).

## 2.0.0 — "Teach Kit" (Nov 19, 2026)

GroundEd grows from a quiz generator into a complete offline-first teaching
kit — one material, three teaching artifacts, all through the same Firebase AI
Logic hybrid inference engine with honest routing badges.

### Added

- **Lesson plans (Teach tab)** — timed 40-minute plans from the same material:
  objectives, materials, per-section "you do / students do", homework, and
  support & extension differentiation. Printable with its own print layout.
- **Flashcards (Study tab)** — AI-generated revision decks: flip animation,
  shuffle, self-marking "I know this".
- **Differentiated quiz versions** — one click builds Support (grade −2,
  recall-focused) and Extension (grade +2, analysis-focused) versions of the
  same material, with a lossless level switcher.
- **Cross-tier answer-key verification** — keys generated on-device are now
  re-derived in the cloud and vice versa. Two independent tiers check every
  key; corrections are surfaced in the routing log and as a toast. This is
  the headline "why hybrid" feature.
- **CSV export for live sessions** — teacher-gradebook rows (student, question,
  answer, result, score) with RFC-4180 quoting.
- **Session history** — closed sessions land in a local "Past sessions" panel
  with class-average MCQ stats and AI-graded counts.
- **Quiz file sharing** — export/import `.grounded.json` files; teachers can
  share quizzes by pen-drive with zero connectivity.
- **File import** — `.txt` / `.md` source material alongside paste and photo.
- **Instant student feedback** — students see their MCQ score immediately on
  submit (computed locally, no AI, no network).
- **Output language selector** — English or simple Hindi for quizzes, plans
  and decks (cloud tier recommended for non-English; stated honestly in-app).
- **PWA manifest + icons** — GroundEd is now installable.
- **Error boundary** — a friendly recovery card replaces blank-page crashes.
- **Test suite (vitest)** — demo engine output quality, quiz repair layer,
  CSV/share-format/session utilities.
- **CI (GitHub Actions)** — lint + test + static build on every push.
- **Session summary stats** and a versioned footer.

### Changed

- **Firestore security rules** — submissions now require (anonymous)
  authentication to read, closing unauthenticated session enumeration while
  keeping the classroom flow unchanged.
- **Demo engine quality** — subject-aware distractor pools end cross-domain
  nonsense options (a fractions quiz no longer offers "photosynthesis");
  graded answers get stemming and fairer partial credit.
- **Quiz repair layer** — every model response is validated: MCQs always
  render exactly 4 options with a valid key, unrepairable MCQs degrade to
  short answers, near-duplicates are dropped.
- **Call hardening** — 60s timeout on every AI call, one automatic retry on
  transient cloud failures, teacher-friendly error copy.
- **Honest routing** — when the SDK does not report `inferenceSource`, the
  event is flagged "source inferred" in the routing log instead of silently
  guessing.
- **Routing log persists** across refreshes (localStorage), with per-event
  notes (e.g. cross-tier verification results).
- **Remote Config hot-updates** now actually take effect: model cache keys
  include the RC-resolved prompt and cloud model id.
- **`checkDeviceAvailability`** probes both `LanguageModel` and
  `ai.languageModel`.
- Reduced-motion preference respected app-wide; new PWA icons and metadata.

### Fixed

- `verifyAnswerKeys` now reports how many keys it corrected (previously
  computed and discarded).
- Unused Firestore imports removed.
- MCQ distribution chart no longer assumes 4 options (repair layer
  guarantees it upstream).

## 1.0.0 (Nov 16, 2026)

Initial release: quiz studio, printable worksheets, live sessions with
offline sync, routing inspector, honest demo mode. Built for #BuildHybridAI
2026 on Firebase AI Logic hybrid inference.
