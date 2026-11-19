# Changelog

All notable changes to GroundEd are documented here.

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
