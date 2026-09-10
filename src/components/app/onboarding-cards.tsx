"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dismissInviteNudge, recordHeardFrom } from "@/actions/settings";
import {
  HEARD_FROM_OPTIONS,
  HEARD_FROM_OTHER_MAX,
  type HeardFromChoice,
} from "@/lib/attribution";

/**
 * The tracker's two one-time cards, shown one at a time above the feed:
 * 1. "How did you hear about us?" — a single tap, asked only of an account
 *    still inside `HEARD_FROM_MAX_ACCOUNT_AGE_DAYS` (the page decides).
 *    Answered or skipped, it's stored on `users.acquisition` and never asked
 *    again.
 * 2. An invite nudge for a workspace that's still solo after its first day —
 *    shared tracking is the feature people miss. Dismissal lives in
 *    `ui_prefs.onboarding`.
 * Both hide instantly and persist in the background; a failed write only means
 * the card returns next visit.
 */
export function OnboardingCards({
  askHeardFrom,
  showInviteNudge,
}: {
  askHeardFrom: boolean;
  showInviteNudge: boolean;
}) {
  const [heardFromDone, setHeardFromDone] = useState(!askHeardFrom);
  const [inviteDone, setInviteDone] = useState(!showInviteNudge);
  if (!heardFromDone) return <HeardFromCard onDone={() => setHeardFromDone(true)} />;
  if (!inviteDone) return <InviteNudge onDone={() => setInviteDone(true)} />;
  return null;
}

const closeButton =
  "-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

function HeardFromCard({ onDone }: { onDone: () => void }) {
  // null until "Other" is picked; then the free-text draft.
  const [other, setOther] = useState<string | null>(null);

  // Fired and forgotten, deliberately: `onDone()` has already unmounted this
  // card, so there is no pending state to show and nothing to render from the
  // result. (A `useTransition` here bought nothing — the callback was
  // synchronous and the promise discarded, so React marked the transition
  // complete before the action's fetch had even resolved.) A failed write only
  // means the card comes back next visit, which is the intended fallback.
  function submit(choice: HeardFromChoice | "skipped", detail?: string) {
    onDone();
    void recordHeardFrom(choice, detail).catch(() => {});
  }

  return (
    <div
      className="mb-4 rounded-lg border bg-muted/40 px-3 py-3 text-sm"
      data-onboarding="heard-from"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Quick one — how did you hear about SpendChat?</p>
        <button
          type="button"
          onClick={() => submit("skipped")}
          className={closeButton}
          aria-label="Skip"
        >
          <X className="size-4" />
        </button>
      </div>
      {other === null ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {HEARD_FROM_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3"
              onClick={() => (o.value === "other" ? setOther("") : submit(o.value))}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit("other", other.trim() || undefined);
          }}
        >
          <Input
            autoFocus
            value={other}
            maxLength={HEARD_FROM_OTHER_MAX}
            placeholder="Where?"
            aria-label="Where did you hear about SpendChat?"
            className="h-8"
            onChange={(e) => setOther(e.target.value)}
          />
          <Button type="submit" size="sm" className="h-8">
            Send
          </Button>
        </form>
      )}
    </div>
  );
}

function InviteNudge({ onDone }: { onDone: () => void }) {
  // Same fire-and-forget as `HeardFromCard.submit` above, for the same reason.
  function dismiss() {
    onDone();
    void dismissInviteNudge().catch(() => {});
  }

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-3 text-sm"
      data-onboarding="invite"
    >
      <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Tracking money with someone?</p>
        <p className="mt-0.5 text-muted-foreground">
          Invite your partner, family or team to this workspace and everyone logs into the
          same feed.
        </p>
        <div className="mt-2 flex gap-2">
          <Button asChild size="sm" className="h-8">
            <Link href="/app/settings/workspace" onClick={dismiss}>
              Invite someone
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button type="button" onClick={dismiss} className={closeButton} aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
