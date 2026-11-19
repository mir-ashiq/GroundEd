// ─────────────────────────────────────────────────────────────────────────────
// GroundEd — Firebase initialization (REAL-FIRST architecture).
//
// • When NEXT_PUBLIC_FIREBASE_* env vars exist  → LIVE mode: real Firebase
//   AI Logic hybrid inference, App Check, Auth, Firestore, Remote Config.
//   This is the default on the hosted deployment.
// • When they are absent (local dev, config-less preview) → DEMO mode: a fully
//   local, clearly-badged simulated engine. Demo mode NEVER pretends to be
//   live — the UI labels every simulated response.
//
// Docs: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider, type AppCheck } from "firebase/app-check";
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when a real Firebase project is configured for this build. */
export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let rc: RemoteConfig | null = null;
let remoteConfigActivated = false;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = firebaseEnabled
      ? getApps().length
        ? getApp()
        : initializeApp(firebaseConfig as Record<string, string>)
      : initializeApp({
          apiKey: "demo-placeholder",
          projectId: "grounded-demo",
          appId: "demo",
        });
  }
  return app;
}

/**
 * App Check is REQUIRED by Firebase AI Logic.
 * • Production (hosted): reCAPTCHA v3 provider via NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY.
 * • Local development: the official debug flow — set FIREBASE_APPCHECK_DEBUG_TOKEN
 *   before initializing App Check (per firebase.google.com/docs/app-check/web/debug-provider).
 *   The SDK prints a debug token to the console which you register in the
 *   Firebase console (Security → App Check → Manage debug tokens). Debug tokens
 *   are explicitly accepted by the #BuildHybridAI rules for submissions.
 */
export function getAppCheck(): AppCheck {
  if (!appCheck) {
    const a = getFirebaseApp();
    const siteKey = process.env.NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY;
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (siteKey) {
      appCheck = initializeAppCheck(a, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } else {
      // Debug flow (local development without a reCAPTCHA site key).
      if (typeof self !== "undefined") {
        // `true` → SDK prints a fresh debug token to the console on first run;
        // a token string → uses the already-registered token directly.
        (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
          debugToken || true;
      }
      appCheck = initializeAppCheck(a, {
        provider: new CustomProvider({
          getToken: () =>
            Promise.resolve({
              token: debugToken || "debug-token-not-yet-registered",
              expireTimeMillis: Date.now() + 3_600_000,
            }),
        }),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return appCheck;
}

export function getDb(): Firestore {
  if (!db) {
    // persistentLocalCache → Firestore keeps working OFFLINE via IndexedDB,
    // and queued writes sync automatically when connectivity returns.
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return db;
}

export function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getRemoteConfigInstance(): RemoteConfig {
  if (!rc) {
    rc = getRemoteConfig(getFirebaseApp());
    // NOTE: fetchTimeoutMillis is REQUIRED for the runtime — an unset value
    // makes the fetch abort immediately (setTimeout coerces undefined to 0).
    rc.settings = {
      minimumFetchIntervalMillis: 3600_000,
      fetchTimeoutMillis: 10_000,
    };
    rc.defaultConfig = {
      // Prompt templates + routing policy are hot-updatable from the console.
      prompt_quiz_system: "",
      prompt_grading_system: "",
      routing_policy: "auto",
      cloud_model: "gemini-3.5-flash-lite",
      flag_live_sessions: true,
    };
  }
  return rc;
}

export async function activateRemoteConfig(): Promise<void> {
  if (!firebaseEnabled || remoteConfigActivated) return;
  try {
    await fetchAndActivate(getRemoteConfigInstance());
    remoteConfigActivated = true;
  } catch {
    // Offline first launch: defaults are used; RC syncs later.
  }
}

/** Remote Config string getter with local fallback. NOTE: getString is a
 *  MODULE-level function taking the RC instance — not an instance method. */
export function rcString(key: string, fallback: string): string {
  if (!firebaseEnabled || !remoteConfigActivated) return fallback;
  try {
    const v = getString(getRemoteConfigInstance(), key);
    return v && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** Teachers: Google sign-in (LIVE mode). Returns null in DEMO mode. */
export async function teacherSignIn(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  const a = getAuthInstance();
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(a, provider);
    return cred.user.uid;
  } catch {
    return null;
  }
}

/** Students: anonymous auth (LIVE mode) so Firestore rules can gate writes. */
export async function studentSignIn(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  try {
    const cred = await signInAnonymously(getAuthInstance());
    return cred.user.uid;
  } catch {
    return null;
  }
}

export function currentUid(): string | null {
  if (!firebaseEnabled) return null;
  return getAuthInstance().currentUser?.uid ?? null;
}
