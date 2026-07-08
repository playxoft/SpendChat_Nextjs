"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase-config";

/**
 * Browser Firebase app + auth. Config comes from the single build-time env var
 * `NEXT_PUBLIC_FIREBASE_CONFIG` (JSON, inlined by Next). This is the client half
 * of auth: sign-in happens here via the Firebase Web SDK; the resulting ID token
 * is bridged to an httpOnly cookie by `AuthBridge` so server components read it.
 */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig());
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

/** Google provider — always request the account chooser. */
export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * Push the current user's fresh ID token to the server `__session` cookie.
 * Call this after a sign-in and await it BEFORE navigating to a protected
 * (server-rendered) route, so the cookie is set when the server renders.
 */
export async function syncSession(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  const idToken = await user.getIdToken(/* forceRefresh */ true);
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Include the refresh token so the server can keep the session alive for a
    // month past the ID token's ~1h life (see `session-cookie.ts`).
    body: JSON.stringify({ idToken, refreshToken: user.refreshToken }),
  });
}

/** Clear the server session cookie (pair with Firebase `signOut`). */
export async function clearSession(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" });
}
