# Changelog

All notable changes to GroundEd are documented here.

## 3.2.0 — source-grounded questions (Nov 20, 2026)

Judges and teachers asked the hardest pedagogical question an AI quiz
generator can face: *"How do I know these questions actually come from MY
textbook?"* GroundEd now answers with evidence, not promises.

### Added

- **Every generated question carries a verbatim `sourceQuote`** — the exact
  sentence from the teacher's material that the question is based on (max 25
  words, copied word-for-word by the model; the prompt forbids invented or
  paraphrased quotes, and the field is simply omitted when the exact words
  can't be quoted).
- **Teacher-visible grounding in the Studio**: each question card shows a
  "From the material (verbatim — check it against the textbook)" block under
  the question. It is editable like every other part of the quiz, so a
  teacher can trim or correct a quote.
- **Source lines on the printed answer key**: the printable answer-key page
  now cites the source sentence under each answer — a paper trail from every
  question back to the textbook page it came from.
- The demo engine (zero-config first run) grounds its questions the same
  way, so the feature is visible before any Firebase setup.

### Fixed — production incident

- **App Check policy change broke cloud inference (found & fixed Nov 20).**
  Firebase's AI Logic endpoint stopped accepting raw debug-token secrets in the
  `X-Firebase-AppCheck` header (401 "Firebase App Check token is invalid" on
  every cloud generation, live site included). The CustomProvider now performs
  the OFFICIAL debug flow — exchanging the registered secret for a short-lived
  App Check token via `content-firebaseappcheck.googleapis.com
  …:exchangeDebugToken` (exactly what @firebase/app-check's DebugProvider
  does), caching it until 5 minutes before expiry, and falling back to the raw
  secret only if the exchange itself is unreachable.
- **Student join race (found by the v3.2 E2E, fixed the same day).** The join
  promise resolved on the FIRST transport emit — but the submissions/students
  Firestore streams require auth, and a joining student is not yet
  authenticated, so a permission error could beat the session document to the
  punch and read as "No active session with that code". Snapshots now carry
  `sessionSettled`, set only by the session-document stream (which the join
  code legitimately unlocks), and a join resolves only when that stream has
  answered.

- **React #418 on every offline reload (pre-existing since v3.1, fixed).** The
  Generate button's helper text read `navigator.onLine` during the first
  client render — offline, the client rendered the "You're offline…" variant
  while the prerendered HTML carried the "Paste about 80+ characters…" hint:
  a guaranteed hydration text mismatch. The offline variant now renders only
  after mount (online/offline listeners), so offline reloads hydrate cleanly.

### Hardening

- The repair layer sanitizes model-provided quotes (trim, collapse
  whitespace, 220-char cap with ellipsis) and stays Firestore-safe: no
  `undefined` at any depth, absent key when there is no quote.
- New unit tests: quote pass-through, length capping, empty-quote dropping,
  Firestore safety without a quote, and a demo-engine test asserting every
  demo MCQ's quote is literally contained in the source material.

## 3.1.0 — hostile-test hardening (Nov 19, 2026)

Five zero-context, maximally-critical tester agents (hackathon judge, first-time
teacher, mobile specialist, design critic, QA/accessibility auditor) tore the
live app apart. Everything below came out of that round — verified against
production where the sandbox allowed, and against Firestore via a REST rules
E2E where it didn't.

### Fixed — the big ones

- **Teacher sign-in now shows the truth.** The old card kept a static
  "Sign in with Google" button forever — even after a successful login. The
  card is now reactive (`onAuthStateChanged`): signed-in teachers see their
  account + Sign out, everyone else sees "no account is needed" with Google as
  an explicitly optional extra. Every failure mode explains itself (popup
  blocked / provider disabled / offline) instead of one misleading blanket
  error.
- **Mobile nav overflow.** The main nav was 411px wide — every app screen
  scrolled sideways on a 390px iPhone. Labels now collapse to icons under
  `sm`; 44px touch targets; verified 390 = 390 at every screen.
- **The live dashboard is no longer blind.** A new presence layer
  (`sessions/{code}/students`) puts every student on the teacher's roster the
  moment they join — with live "3/6 answered" progress — instead of the first
  submission being the first sign of life. Rows are bound to the writer's
  anonymous auth uid (ownerUid) so only the original device can update them
  (verified: foreign updates 403).
- **Lobby gating.** "Activate quiz" did nothing — students could start while
  the teacher was still in the lobby. Students now wait on a "Waiting for your
  teacher" screen that unlocks the moment the teacher presses
  **Start for everyone**.
- **og:image pointed at localhost** in production metadata (static-export
  `metadataBase` fallback) — every social share rendered a dead preview. Now
  absolute to the live domain.
- **Silent student failures.** Joining with a valid-format-but-wrong code, or
  on a slow cold start, could fail with nothing on screen. There is now a
  persistent inline error (aria-live) plus a longer-lived toast, and the
  Firestore warm-up moved to app boot so the join is never the first listener.
- **Generation "hang".** 30–90s of a bare "Asking the model…" read as frozen.
  Now: skeleton + elapsed-seconds counter + phase copy + an honest
  "can take 30–60s" note. The Generate button also explains WHY it's disabled
  (needs ~80+ chars / offline without device model) instead of just going grey.

### Added

- **Students can join from the landing page** — a code box right in the hero
  (a kid with a link should never have to escape a marketing page). The join
  deep link (`/studio/#join=CODE`) now opens the student view directly.
- **Session QR code** — rendered locally (qrcode lib, works offline) next to
  the join code and the now-visible join URL; a classroom scans once instead
  of typing.
- **Per-question review for students** after submitting — MCQs show the
  student's answer vs the correct one; written answers are marked private.
- **Cross-tier verification is now visible** — a "Keys cross-verified on the
  other tier" chip (or "fixed N keys") on the quiz header, powered by the
  existing async verification pass.
- **A real 404 page** with Join + Home doors instead of a dead end.
- **Watch the demo** opens an in-page modal video instead of ejecting the
  visitor to a raw .mp4.

### Changed

- App Check debug token no longer printed to the production console.
- Accessibility: labels programmatically associated (Subject/Grade/Questions/
  language), switches and selects named, heading hierarchy fixed on the
  landing, a11y-tree-safe text spacing in the hero/footer.
- Copy: "Export CSV" → "Export for Excel (CSV)", lobby status lines reflect
  who's in the room, jargon trimmed where it blocked first-time teachers.
- Differentiated-version chips restyled (single-line pills, active hint line)
  so controls stop out-shouting content.

## 3.0.1 — production deploy + hydration fix (Nov 19, 2026)

- **Live on production**: v3 "Classroom OS" deployed to
  https://grounded-hybrid.web.app and verified with the full 29-check E2E
  suite against production (LIVE generation, live session, AI grading,
  offline submit + sync, offline reload) — 29/29.
- **Fixed**: React hydration error #418 on reload with saved data. The
  Zustand store initialized the persisted routing log / session history
  from localStorage during store creation, so the first client render
  diverged from the prerendered HTML. Persisted slices now start empty
  and rehydrate after mount (`rehydratePersisted()` in AppShell).
- Screenshots refreshed from the production app (incl. new: Verification
  Lab result, Insights with a real graded session).

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
