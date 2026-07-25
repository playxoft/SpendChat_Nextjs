"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONSENT_REOPEN_EVENT,
  type ConsentValue,
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeConsent,
  writeConsent,
} from "@/lib/consent";

/**
 * Fixed-bottom banner shown until the visitor accepts or declines analytics
 * cookies. Nothing in AnalyticsProvider loads before a decision is made —
 * "Decline" just records the decision so the banner doesn't reappear.
 * Reopened via the footer's "Cookie settings" link (CONSENT_REOPEN_EVENT).
 */
export function CookieConsent() {
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot
  );
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    const handleReopen = () => setForceOpen(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, handleReopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, handleReopen);
  }, []);

  function decide(value: ConsentValue) {
    writeConsent(value);
    setForceOpen(false);
  }

  const visible = forceOpen || consent === null;
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <Cookie className="hidden size-8 shrink-0 text-muted-foreground sm:block" />
        <p className="flex-1 text-sm text-muted-foreground">
          We use cookies for analytics (Google Analytics, Microsoft Clarity) to
          understand how visitors use this site. Nothing loads until you accept. See our{" "}
          <Link
            href="/cookie-policy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            cookie policy
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2.5">
          <Button
            variant="outline"
            className="h-11 rounded-full px-6 text-base"
            onClick={() => decide("denied")}
          >
            Decline
          </Button>
          <Button
            className="h-11 rounded-full px-6 text-base"
            onClick={() => decide("granted")}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
