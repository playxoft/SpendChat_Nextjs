"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/neon-auth-client";
import { getAuthErrorMessage } from "@/lib/auth-errors";

/** Official multi-color Google "G" mark. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/** One-click "Continue with Google" — redirects through Neon Auth's hosted OAuth. */
export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    console.info("[auth] Starting Google sign-in…");
    try {
      // On success this redirects the browser to Google, so the loading state
      // stays until the page navigates away. We only return here on failure.
      // `callbackURL` is where Neon sends us back with the session verifier —
      // /auth/callback finalizes the session before entering the gated app.
      const { error: err } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth/callback",
        errorCallbackURL: "/sign-in",
      });
      if (err) {
        console.error("[auth] Google sign-in request failed:", err);
        setError(err.message || "Couldn't continue with Google. Try again.");
        setLoading(false);
      } else {
        console.info("[auth] Redirecting to Google…");
      }
    } catch (err) {
      console.error("[auth] Google sign-in threw:", err);
      setError(getAuthErrorMessage(err, "Couldn't continue with Google. Try again."));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full gap-2"
        onClick={onClick}
        disabled={loading}
      >
        <GoogleIcon />
        {loading ? "Connecting…" : "Continue with Google"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
