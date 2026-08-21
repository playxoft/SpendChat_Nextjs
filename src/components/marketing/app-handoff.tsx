"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  dismissPrompt,
  getHandoffServerSnapshot,
  getHandoffSnapshot,
  setPrefersApp,
  subscribeHandoff,
} from "@/lib/app-redirect";

/**
 * The landing page's handoff for someone who is already signed in: a card on
 * the right offering the app, with a checkbox to make that the default.
 *
 * Signed-out visitors — and every crawler, which carries no cookies — get
 * nothing at all: this renders `null` and `/` behaves exactly as it always has.
 * That is the whole reason the state lives in cookies read on the client (see
 * `lib/app-redirect.ts`); the page stays statically rendered and indexable.
 *
 * Once the box is ticked, `/` stops rendering for that browser and goes
 * straight to `/app`. `?stay=1` is the way back — it suppresses the redirect for
 * one visit and shows this card with the box already ticked, so the switch that
 * turned the behaviour on is also the one that turns it off.
 */
export function AppHandoff() {
  const router = useRouter();
  // Everything comes from one external store, including `?stay=1` — reading the
  // URL with `useSearchParams` would force this page into a Suspense boundary
  // or out of static rendering. During hydration the store serves the frozen
  // server snapshot ("signed out"), so the prerendered HTML and the first
  // client render agree; the real values land on the re-render straight after.
  const { signedIn, prefers, dismissed, stay } = useSyncExternalStore(
    subscribeHandoff,
    getHandoffSnapshot,
    getHandoffServerSnapshot,
  );

  const redirecting = signedIn && prefers && !stay;

  useEffect(() => {
    if (redirecting) router.replace("/app");
  }, [redirecting, router]);

  // While the redirect is in flight, cover the page. The static HTML has
  // already painted by the time hydration runs, so without this the landing
  // page flashes on every visit for someone who asked never to see it.
  if (redirecting) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-background"
        role="status"
        aria-label="Opening the app"
      >
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  if (!signedIn) return null;
  // Already going straight to the app, and not here to change that: the card
  // would be offering something that is already happening.
  if (prefers && !stay) return null;
  if (dismissed && !prefers) return null;

  return (
    <div
      className="fixed top-24 right-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] sm:right-5"
      // Not a modal — the landing page stays fully usable behind it.
      role="complementary"
      aria-label="Continue to the app"
    >
      <div className="relative flex flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dismissPrompt}
          aria-label="Dismiss"
          className="absolute top-1.5 right-1.5 size-7 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>

        <div className="pr-6">
          <p className="text-sm font-medium">You&rsquo;re signed in</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pick up where you left off.
          </p>
        </div>

        <Button asChild className="w-full gap-2">
          <a href="/app">
            Go to app
            <ArrowRight className="size-4" />
          </a>
        </Button>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={prefers}
            onCheckedChange={(checked) => setPrefersApp(checked === true)}
          />
          Always take me straight here
        </label>
      </div>
    </div>
  );
}
