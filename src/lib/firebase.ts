"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase-config";
import { clearStoredAttribution, readStoredAttribution } from "@/lib/attribution";
import {
  LEGAL_VERSION,
  clearStoredTermsAcceptance,
  readStoredTermsAcceptance,
  type TermsChoices,
} from "@/lib/legal";

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
 *
 * `acceptedTerms` says the person ticked "I'm 13 or older and I agree" on this
 * page just now (the Google path), with what they chose in the optional box
 * beside it. An email sign-up's tick waits in local storage for the same
 * account's first sync instead (`storeTermsAcceptance`), since that account
 * can't have a session until its address is verified.
 *
 * `askTermsIfNew` (the sign-in page's Google button, which can still show the
 * terms dialog): if this sign-in would create a new account and no terms were
 * ticked, the server creates nothing and this returns "terms_required" — the
 * caller asks, then calls again with `acceptedTerms`.
 */
export async function syncSession(
  options: { acceptedTerms?: TermsChoices; askTermsIfNew?: boolean } = {},
): Promise<"ok" | "terms_required" | "failed"> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return "failed";
  const idToken = await user.getIdToken(/* forceRefresh */ true);
  const storedTerms = readStoredTermsAcceptance(user.uid);
  const choices = options.acceptedTerms ?? storedTerms;
  const terms = choices ? { version: LEGAL_VERSION, newsEmails: choices.newsEmails } : undefined;
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Include the refresh token so the server can keep the session alive for a
    // month past the ID token's ~1h life (see `session-cookie.ts`), and the
    // first-touch attribution, used only if this sign-in creates the account.
    body: JSON.stringify({
      idToken,
      refreshToken: user.refreshToken,
      attribution: readStoredAttribution(),
      terms,
      ...(options.askTermsIfNew && !terms ? { askTermsIfNew: true } : {}),
    }),
  });
  // Sent once; the server kept it if it mattered. Don't keep resending it.
  if (res.ok) {
    clearStoredAttribution();
    if (storedTerms) clearStoredTermsAcceptance();
    return "ok";
  }
  return res.status === 428 ? "terms_required" : "failed";
}

/** Clear the server session cookie (pair with Firebase `signOut`). */
export async function clearSession(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" });
}
