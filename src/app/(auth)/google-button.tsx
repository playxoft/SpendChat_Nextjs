"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdditionalUserInfo, signInWithPopup, signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, googleProvider, syncSession } from "@/lib/firebase";
import { firebaseAuthErrorMessage } from "@/lib/auth-errors";
import { TermsConsentDialog } from "@/components/legal/terms-consent";
import type { TermsChoices } from "@/lib/legal";

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

/**
 * "Continue with Google" — Firebase popup OAuth. `next` is where to land
 * afterwards (already validated by the form via `safeNextPath`).
 *
 * Nobody gets an account without ticking the terms box first:
 * - `terms="before"` (sign-up): the dialog comes first; the popup opens from
 *   its confirm click, so it's still a user gesture and isn't blocked.
 * - `terms="if-new"` (sign-in): an existing account goes straight in. If this
 *   Google sign-in has no SpendChat account behind it, the server says so
 *   (`terms_required`) instead of creating one, and the dialog appears before
 *   any session exists — no SpendChat account is made until they agree. The
 *   server decides, not Firebase's "new user" flag: a Google login can already
 *   exist in Firebase with no SpendChat account (one deleted here, or an
 *   unfinished email sign-up it was linked to). Declining deletes the Google
 *   sign-in only if this popup created it; otherwise it just signs out.
 */
export function GoogleSignInButton({
  next = null,
  terms,
}: {
  next?: string | null;
  terms: "before" | "if-new";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "before": asking before the popup. "new-account": the popup made a new
  // account that's waiting on the answer.
  const [asking, setAsking] = useState<null | "before" | "new-account">(null);
  const [confirming, setConfirming] = useState(false);
  // Whether the popup created the Firebase login — only then does declining
  // delete it (an older login may belong to an unfinished email sign-up).
  const createdLogin = useRef(false);

  /**
   * Establish the session cookie, then enter the app. False = the server wants
   * the terms first. `acceptedTerms`: what was ticked on the dialog, if it was.
   */
  async function finish(acceptedTerms: TermsChoices | null): Promise<boolean> {
    // Google accounts are email-verified, so the server gives a session — or,
    // for a sign-in that would create an account, asks for the terms first.
    const outcome = await syncSession({
      acceptedTerms: acceptedTerms ?? undefined,
      askTermsIfNew: terms === "if-new",
    });
    if (outcome === "terms_required") return false;
    router.push(next ?? "/app");
    router.refresh();
    return true;
  }

  function fail(err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
    // A user closing the popup isn't an error worth shouting about.
    if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
      setError(firebaseAuthErrorMessage(err, "Couldn't continue with Google. Try again."));
    }
    setLoading(false);
  }

  async function signIn(acceptedTerms: TermsChoices | null) {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(getFirebaseAuth(), googleProvider());
      createdLogin.current = getAdditionalUserInfo(result)?.isNewUser === true;
      if (!(await finish(acceptedTerms))) setAsking("new-account");
    } catch (err) {
      fail(err);
    }
  }

  async function acceptNewAccount(choices: TermsChoices) {
    setConfirming(true);
    try {
      await finish(choices);
    } catch (err) {
      setConfirming(false);
      setAsking(null);
      fail(err);
    }
  }

  async function declineNewAccount() {
    setAsking(null);
    const auth = getFirebaseAuth();
    // Just signed in, so Firebase allows the delete without a fresh login.
    // If it fails anyway, signing out still leaves no session and no
    // SpendChat account — only an unused Google sign-in on Firebase's side.
    if (createdLogin.current) {
      try {
        await auth.currentUser?.delete();
      } catch {
        // fall through to sign-out
      }
    }
    await signOut(auth).catch(() => {});
    setLoading(false);
    setError("You need to accept the terms to create an account. Nothing was saved.");
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full gap-2"
        onClick={() => {
          if (terms === "before") setAsking("before");
          else void signIn(null);
        }}
        disabled={loading}
      >
        <GoogleIcon />
        {loading ? "Connecting…" : "Continue with Google"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <TermsConsentDialog
        open={asking === "before"}
        title="Before you create your account"
        description="Here's the short, friendly version of our terms. Have a quick read, then tick the box."
        confirmLabel="Continue with Google"
        onConfirm={(choices) => {
          setAsking(null);
          // Straight from the click: no await before the popup opens.
          void signIn(choices);
        }}
        onCancel={() => setAsking(null)}
      />
      <TermsConsentDialog
        open={asking === "new-account"}
        title="Create your SpendChat account"
        description="There's no SpendChat account for this Google account yet. Have a quick read, then tick the box to create one."
        confirmLabel="Create my account"
        pendingLabel="Creating account…"
        pending={confirming}
        onConfirm={(choices) => void acceptNewAccount(choices)}
        onCancel={() => void declineNewAccount()}
        cancelLabel="Don't create an account"
      />
    </div>
  );
}
