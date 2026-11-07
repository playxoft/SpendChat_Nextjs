"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { acceptTerms } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { TermsConsentDialog } from "@/components/legal/terms-consent";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";
import { useOnboardingFlow } from "./onboarding-flow";
import {
  AGE_RULES,
  LEGAL_UPDATED,
  LEGAL_VERSION,
  clearStoredTermsAcceptance,
  type TermsChoices,
} from "@/lib/legal";

/**
 * The app's terms gate: shown over every `/app` page to anyone whose account
 * hasn't accepted the current `LEGAL_VERSION` — accounts that predate the
 * checkbox, ones created in the mobile app, and everyone once after a material
 * policy change. It can't be dismissed; the only ways out are agreeing or
 * signing out. (The server never relies on it: it's the person's chance to
 * agree, not an access check.)
 *
 * `updated` picks the wording: an account that accepted an older version, or
 * predates this one, has seen terms before; a new one hasn't.
 *
 * It's the welcome's first popup (`OnboardingFlowProvider`): Continue hands
 * straight over to the next one and saves in the background. A failed save
 * brings the gate back, with its error, in front of whatever came next.
 */
export function TermsGate({ updated }: { updated: boolean }) {
  const router = useRouter();
  const { turn, answer, reopen } = useOnboardingFlow();
  const [, startSave] = useTransition();
  const [signingOut, startSignOut] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function agree(choices: TermsChoices) {
    setError(null);
    answer("terms");
    // The action refreshes the layout itself when it lands (`revalidatePath`),
    // and actions run one at a time, so the next popup's save queues behind it.
    startSave(async () => {
      const res = await acceptTerms(LEGAL_VERSION, choices).catch(() => null);
      if (!res?.ok) {
        setError(res?.error ?? "Couldn't save that. Check your connection and try again.");
        reopen("terms");
        return;
      }
      // An email sign-up's own tick may still be waiting in this browser.
      clearStoredTermsAcceptance();
    });
  }

  function leave() {
    startSignOut(async () => {
      await signOut(getFirebaseAuth()).catch(() => {});
      await clearSession().catch(() => {});
      router.push("/sign-in");
      router.refresh();
    });
  }

  return (
    <TermsConsentDialog
      open={turn === "terms"}
      title={updated ? "We've updated our terms" : "Before you start"}
      description={
        updated
          ? `Our terms changed on ${LEGAL_UPDATED} — they're simpler to read now, and SpendChat is open to everyone ${AGE_RULES.minAge} and older. Have a quick read, then tick the box to keep going.`
          : "Here's the short, friendly version of our terms. Have a quick read, then tick the box to start."
      }
      confirmLabel="Continue"
      pending={signingOut}
      error={error}
      onConfirm={agree}
      secondary={
        <Button
          type="button"
          variant="ghost"
          onClick={leave}
          disabled={signingOut}
          className="sm:mr-auto"
        >
          <LogOut className="size-4" /> {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      }
    />
  );
}
