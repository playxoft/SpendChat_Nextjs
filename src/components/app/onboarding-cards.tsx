"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissInviteNudge } from "@/actions/settings";

/**
 * The tracker's one-time card above the feed: an invite nudge for a workspace
 * that's still solo after its first day — shared tracking is the feature
 * people miss. Dismissal lives in `ui_prefs.onboarding`. It hides instantly
 * and persists in the background; a failed write only means the card returns
 * next visit. ("How did you hear about us?" used to be a card here too; it's
 * now a step of the "About you" welcome questions, `about-you-dialog.tsx`.)
 */
export function OnboardingCards({ showInviteNudge }: { showInviteNudge: boolean }) {
  const [inviteDone, setInviteDone] = useState(!showInviteNudge);
  if (!inviteDone) return <InviteNudge onDone={() => setInviteDone(true)} />;
  return null;
}

const closeButton =
  "-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

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
