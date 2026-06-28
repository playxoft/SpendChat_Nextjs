"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { authClient } from "@/lib/neon-auth-client";
import { getAuthErrorMessage } from "@/lib/auth-errors";

/**
 * OAuth landing page. Neon redirects here after Google with a one-time
 * `neon_auth_session_verifier` in the URL. Calling `authClient.getSession()`
 * exchanges that verifier for a real session cookie (via the `/api/auth`
 * route handler) and strips it from the URL. Only once the cookie exists can
 * we send the user into the `(app)` group, which is gated by `requireUser()`.
 *
 * This lives OUTSIDE `(app)` on purpose: the server-side auth gate would
 * otherwise redirect to `/sign-in` before the browser ever runs the exchange.
 * (Normally Neon's middleware would do this server-side, but Workers can't run
 * Next 16 middleware — see AGENTS.md.)
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  // React Strict Mode invokes effects twice in dev; the verifier is one-time,
  // so guard against a duplicate exchange.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      console.info("[auth] OAuth callback: exchanging session verifier…");
      try {
        const { data, error } = await authClient.getSession();
        if (error || !data?.user) {
          console.error(
            "[auth] OAuth callback failed to establish a session:",
            error ?? "no user in session response",
          );
          toast.error("Couldn't finish signing in. Please try again.");
          router.replace("/sign-in");
          return;
        }
        console.info(
          "[auth] OAuth callback: session established for",
          data.user.email ?? data.user.id,
        );
        toast.success("Signed in with Google.");
        router.replace("/app");
      } catch (err) {
        console.error("[auth] OAuth callback threw while exchanging verifier:", err);
        toast.error(getAuthErrorMessage(err, "Couldn't finish signing in. Please try again."));
        router.replace("/sign-in");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <Logo />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
