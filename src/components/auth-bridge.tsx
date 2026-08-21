"use client";

import { useEffect } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { notifyHandoffChange } from "@/lib/app-redirect";

/**
 * Keeps the server's `__session` cookie in sync with Firebase's client-side
 * auth. Fires on sign-in, on the ~hourly ID-token refresh, and on sign-out:
 *   - signed in  → POST the fresh ID token to `/api/auth/session` (sets cookie)
 *   - signed out → DELETE `/api/auth/session` (clears cookie)
 * Mounted once in the root layout so every route keeps the cookie current.
 */
export function AuthBridge() {
  useEffect(() => {
    const unsub = onIdTokenChanged(getFirebaseAuth(), async (user) => {
      try {
        if (user) {
          const idToken = await user.getIdToken();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            // The refresh token lets the server re-mint ID tokens for a month,
            // so the user isn't logged out an hour after closing the app.
            body: JSON.stringify({ idToken, refreshToken: user.refreshToken }),
          });
        } else {
          await fetch("/api/auth/session", { method: "DELETE" });
        }
        // Those two requests are what set and clear the landing page's session
        // hint, server-side — nothing in the browser can see that write. Say so
        // here, or `/` renders its handoff against a hint that arrived after it
        // last looked, and only a reload would fix it (in either direction: a
        // card that never appears, or one still offering the app after sign-out).
        notifyHandoffChange();
      } catch {
        // Transient network error — the next token change re-syncs.
      }
    });
    return () => unsub();
  }, []);

  return null;
}
