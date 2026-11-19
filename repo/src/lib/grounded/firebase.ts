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
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
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
      // Debug flow (no reCAPTCHA site key). Mirrors the OFFICIAL debug flow of
      // @firebase/app-check's DebugProvider: the registered debug secret is
      // EXCHANGED for a short-lived App Check token via
      // content-firebaseappcheck.googleapis.com (…:exchangeDebugToken), and the
      // exchanged token is what rides on requests. (Since Nov 2026 the AI Logic
      // endpoint rejects raw debug secrets; the exchange is required.)
      // `self.FIREBASE_APPCHECK_DEBUG_TOKEN` only makes the SDK PRINT the
      // secret in dev — never set it in production.
      if (typeof self !== "undefined" && process.env.NODE_ENV !== "production") {
        (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
          debugToken || true;
      }
      let cached: { token: string; expireTimeMillis: number } | null = null;
      appCheck = initializeAppCheck(a, {
        provider: new CustomProvider({
          getToken: async () => {
            const oneHour = Date.now() + 3_600_000;
            if (!debugToken) {
              return { token: "debug-token-not-yet-registered", expireTimeMillis: oneHour };
            }
            // Re-use the exchanged token until 5 min before it expires.
            if (cached && cached.expireTimeMillis - Date.now() > 5 * 60 * 1000) {
              return cached;
            }
            try {
              const { projectId, appId, apiKey } = a.options;
              const res = await fetch(
                `https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ debug_token: debugToken }),
                },
              );
              if (res.ok) {
                const data = (await res.json()) as { token?: string; ttl?: string };
                // ttl is a Protobuf Duration like "3600s".
                const m = data.ttl?.match(/^([\d.]+)s$/);
                const ttlMs = m ? Number(m[1]) * 1000 : 3_600_000;
                if (data.token) {
                  cached = {
                    token: data.token,
                    expireTimeMillis: Date.now() + ttlMs,
                  };
                  return cached;
                }
              }
            } catch {
              // fall through to the raw secret (pre-Nov-2026 behavior) — a
              // server-side policy change must not hard-break the classroom.
            }
            return { token: debugToken, expireTimeMillis: oneHour };
          },
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

/** GroundEd's view of the current Firebase user (null when signed out). */
export interface GroundedUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function watchAuth(cb: (u: GroundedUser | null) => void): () => void {
  if (!firebaseEnabled || typeof window === "undefined") {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(getAuthInstance(), (u) =>
    cb(
      u
        ? {
            uid: u.uid,
            isAnonymous: u.isAnonymous,
            displayName: u.displayName,
            email: u.email,
          }
        : null,
    ),
  );
}

/** Teachers: Google sign-in (LIVE mode). Never throws — typed result so the
 *  UI can explain EXACTLY what went wrong instead of a generic failure. */
export async function teacherSignIn(): Promise<
  { ok: true; uid: string } | { ok: false; code: string }
> {
  if (!firebaseEnabled) return { ok: false, code: "auth/not-configured" };
  const a = getAuthInstance();
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(a, provider);
    return { ok: true, uid: cred.user.uid };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "auth/unknown";
    return { ok: false, code };
  }
}

/** Sign out of the current session (keeps anonymous auth available). */
export async function teacherSignOut(): Promise<void> {
  if (!firebaseEnabled) return;
  try {
    await signOut(getAuthInstance());
  } catch {
    /* already signed out */
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
