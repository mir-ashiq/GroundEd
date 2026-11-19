# GroundEd — Firebase Setup Runbook

> **Audience:** you, the human teammate, assuming **zero prior Firebase experience**.
> **Time required:** ~45–60 minutes the first time (the on-device model download adds a few more).
> **What you get at the end:** the live app running on a public URL with real
> Firebase AI Logic hybrid inference, ready for the demo video.

> **✅ DEPLOYMENT STATUS (Nov 18, 2026):** project **`grounded-hybrid`** is LIVE at
> **<https://grounded-hybrid.web.app>**. Steps **1, 2, 4, 5, 7, 9** are DONE and
> automated (project + web app, Gemini Developer API enabled, `.env.local`
> filled, Firestore `asia-south1` + security rules deployed, Remote Config's 5
> parameters published, hosting deployed). App Check has a **registered debug
> token** baked into the live build (accepted for the hackathon).
> **Your two remaining manual steps:**
> 1. **Step 3** — open [Authentication → Sign-in method](https://console.firebase.google.com/project/grounded-hybrid/authentication/providers)
>    and switch on **Google** (support email = your Gmail) and **Anonymous**. Two toggles, ~60 seconds; no rebuild needed.
> 2. Before the final submission (optional but recommended): **Step 6 prod** —
>    register a reCAPTCHA v3 site key so production attestation uses it instead
>    of the debug token.

GroundEd runs in two modes:

- **DEMO mode** (no configuration): everything works locally, AI responses are
  simulated by a built-in engine, and the UI labels every result `DEMO`. Use it
  to explore the flows, never for the submission video.
- **LIVE mode** (this runbook): the same app calls **real Firebase AI Logic
  hybrid inference** — Gemini Nano on-device in Chrome, with cloud fallback.
  The header chip reads `LIVE · Firebase AI Logic`. **This is the mode the
  judges must see.**

---

## 0. Prerequisites

- A Google account (any personal account).
- **Chrome Desktop, version 139 or newer** (check at `chrome://settings/help`).
- Node.js 20+ installed (`node --version`).
- This repository cloned to your machine.

```bash
npm install
cp .env.example .env.local   # you will fill this in during Step 4
```

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it (e.g. `grounded-app`). Google Analytics is optional — disable it.
3. Create the project and continue.

## 2. Register a Web app and enable AI Logic (guided flow)

1. In the project overview, click the **Web (`</>`)** icon to add a web app.
   Nickname it `GroundEd`, do **not** check Firebase Hosting yet, register.
2. You will see a `firebaseConfig` object — keep that page open (Step 4 uses it).
3. In the left menu, choose **Build → AI Logic**. Start the **guided setup**:
   - Choose the **Gemini Developer API** provider and click **Enable**.
   - The guided flow **automatically enforces App Check** for AI Logic — this
     is mandatory and exactly what the hackathon requires.
4. On the AI Logic page, find **Direct model access / Gemini Nano** (on-device)
   and enable it for your project if presented.

## 3. Enable Authentication (two providers)

1. **Build → Authentication → Get started.**
2. In **Sign-in method**, enable:
   - **Google** (teachers may sign in with it — leave the default settings,
     add a support email if asked).
   - **Anonymous** (students join sessions without accounts).
3. Both toggle to **Enabled**. Nothing else to configure.

## 4. Fill in `.env.local`

Copy the values from the `firebaseConfig` you saw in Step 2:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=grounded-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=grounded-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=grounded-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

## 5. Create the Firestore database + security rules

1. **Build → Firestore Database → Create database.**
   Choose **Production mode**, pick the region closest to you (e.g.
   `asia-south1` for India), confirm.
2. From the repository, deploy the security rules:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project, alias: default
firebase deploy --only firestore:rules
```

## 6. App Check

**Local development (do this first):**

1. Run `npm run dev` and open <http://localhost:3000>.
2. Open DevTools → Console. Look for a line like:
   `AppCheck debug token: "1234abcd-...". You will need to safelist it…`
3. Copy that token. In Firebase console: **Build → App Check → Apps tab →
   your web app → ⋮ (overflow menu) → Manage debug tokens** → add the token.
4. Paste the same token into `.env.local` as
   `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=` so it works on restarts.

**Production (hosted) attestation:**

1. Create a **reCAPTCHA v3** site key at <https://www.google.com/recaptcha/admin/create>
   (type: reCAPTCHA v3; domains: your hosting domain + localhost is NOT needed).
2. In Firebase console: **App Check → Apps → your web app → Register** the
   reCAPTCHA v3 provider with that site key.
3. Put the site key in `.env.local` as `NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY=...`
   (keep it alongside the debug token — the site key takes precedence in
   production builds; see `src/lib/grounded/firebase.ts`).

## 7. Remote Config (hot-updatable prompts + routing policy)

**Run → Remote Config → Create parameter** for each of these (all strings,
default values shown — publish after creating):

| Parameter key            | Default value                          | What it controls |
| ------------------------ | -------------------------------------- | ---------------- |
| `prompt_quiz_system`     | *(empty → uses built-in prompt)*       | System prompt for quiz generation |
| `prompt_grading_system`  | *(empty → uses built-in prompt)*       | System prompt for answer grading |
| `routing_policy`         | `auto`                                 | Default routing policy |
| `cloud_model`            | `gemini-3.5-flash-lite`                | Cloud fallback model id |
| `flag_live_sessions`     | `true`                                 | Feature flag |

Nothing else required — the app reads these at startup and falls back to its
built-in defaults when offline.

## 8. Prepare Chrome for on-device inference

On the machine you will demo from:

1. Use **Chrome Desktop 139+**.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and set
   it to **Enabled** (needed for photo import; plain text generation works
   without the flag once the model is present).
3. Restart Chrome.
4. In the deployed app, open **Settings → Prepare offline AI** and click it
   once (it must be a user action). The download progress shows in-app.
   Alternatively verify via DevTools console:
   `await LanguageModel.availability()` → should print `available`.

## 9. Deploy to Firebase Hosting

```bash
npm run deploy
# = npm run build:static && firebase deploy --only hosting
```

First run: `firebase use --add` (Step 5 already did this). The command
produces a public URL like `https://grounded-app.web.app`.

## 10. The pre-flight check (do this before recording)

- [ ] Header shows **`LIVE · Firebase AI Logic`** (not DEMO).
- [ ] **Settings → Prepare offline AI** reports the model ready.
- [ ] Generate a quiz from pasted text → badge shows **On-device**.
- [ ] Turn on airplane mode → **reload the page** → generate again → still
      **On-device**. (This is the money shot for the video.)
- [ ] Reconnect → long document → badge flips to **Cloud**.
- [ ] Live session: teacher tab + phone (or second tab) → submit → teacher
      sees the submission; short-answer **AI grade** shows the On-device badge.
- [ ] `firebase deploy --only firestore:rules` ran without errors.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `App Check` errors in console | Debug token not registered (Step 6) or site key missing in production. |
| Badge always says `Cloud` | Model not downloaded or Chrome < 139. Run **Prepare offline AI**. |
| `on-device model unavailable` error | You set routing to *On-device only* before the model finished downloading — switch to Auto until ready. |
| Generation fails entirely | Check AI Logic is enabled (Step 2) and quota: text inference is free within limits. |
| Hosting shows old build | `npm run deploy` again; hard-refresh (Ctrl+Shift+R). |

---

*Questions during the hackathon: the #BuildHybridAI Discord `#hackathon-help` channel.*
