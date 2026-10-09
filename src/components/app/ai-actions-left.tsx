"use client";

import { Suspense, use, useDeferredValue } from "react";
import { aiActionsLock } from "@/lib/add-limits";
import { aiActionsSpent, type AiActionsLeft } from "@/lib/ai-limits";
import { cn } from "@/lib/utils";
import { LockGlyph } from "./limit-lock";
import { usePlan } from "./upgrade-dialog";

/**
 * "38 of 50 AI actions left this month" — the workspace's monthly AI allowance,
 * on the composers that spend it (the tracker's AI mode and Ask), plus any
 * top-up actions it has left ("· +450 top-up"), which carry on once the
 * month's allowance is spent.
 *
 * The page streams the first value (`allowance`, a promise it never awaits, so
 * the count can't hold up the page); after each use the composer passes the
 * count its action returned (`latest`), which wins from then on. At zero the
 * line says so, with the plan lock's words and its Upgrade button (the same
 * lock and upgrade dialog every other limit uses) — so the way out shows
 * before a send is refused.
 */
export function AiActionsLeftLine({
  allowance,
  latest,
  className,
}: {
  /** The page's value, streamed. Null when it couldn't be read — nothing shows. */
  allowance: Promise<AiActionsLeft | null> | null | undefined;
  /** The value the last use returned, if there has been one. */
  latest?: AiActionsLeft | null;
  className?: string;
}) {
  if (latest) return <Line value={latest} className={className} />;
  if (!allowance) return null;
  return (
    <Suspense fallback={null}>
      <Streamed allowance={allowance} className={className} />
    </Suspense>
  );
}

function Streamed({
  allowance,
  className,
}: {
  allowance: Promise<AiActionsLeft | null>;
  className?: string;
}) {
  // A refresh of the page (every tracker send revalidates it) hands down a new
  // promise; deferring it keeps the old count on screen until the new one is
  // in, instead of blinking the line out while it loads.
  const value = use(useDeferredValue(allowance));
  return value ? <Line value={value} className={className} /> : null;
}

function Line({ value, className }: { value: AiActionsLeft; className?: string }) {
  const { plan, showUpgrade } = usePlan();
  const remaining = Math.max(0, value.remaining);
  const topUp = Math.max(0, value.topUpRemaining ?? 0);
  const limit = value.limit.toLocaleString("en-US");
  if (remaining === 0 && topUp > 0) {
    // The month's allowance is spent and a top-up is carrying on (C4).
    const full = `This month's AI actions are used — ${topUp.toLocaleString("en-US")} top-up actions left`;
    return (
      <span
        className={cn("min-w-0 truncate text-xs text-muted-foreground tabular-nums", className)}
        title={full}
      >
        <span className="sm:hidden" aria-hidden>
          {topUp.toLocaleString("en-US")} top-up left
        </span>
        <span className="sr-only sm:not-sr-only">{full}</span>
      </span>
    );
  }
  if (aiActionsSpent(value)) {
    const lock = aiActionsLock(plan, value.limit);
    const refills = refillDate(value.resetsAt ?? nextMonthStartIso());
    return (
      <span
        className={cn("inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)}
        title={`They refill on ${refills}.`}
      >
        <LockGlyph />
        <span className="truncate">
          <span className="sm:hidden">0 of {limit} left</span>
          <span className="hidden sm:inline">No AI actions left this month</span>
        </span>
        {/* A visible button, not a tooltip: this is the one way forward, and
            it has to work on a phone too. Opens the usual upgrade dialog. */}
        <button
          type="button"
          onClick={() => showUpgrade(lock.info)}
          className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
        >
          {lock.cta}
        </button>
      </span>
    );
  }
  const extra = topUp > 0 ? ` · +${topUp.toLocaleString("en-US")} top-up` : "";
  const full = `${remaining.toLocaleString("en-US")} of ${limit} AI actions left this month${extra}`;
  return (
    <span
      className={cn("min-w-0 truncate text-xs text-muted-foreground tabular-nums", className)}
      title={full}
    >
      <span className="sm:hidden" aria-hidden>
        {remaining.toLocaleString("en-US")} of {limit} left
      </span>
      <span className="sr-only sm:not-sr-only">{full}</span>
    </span>
  );
}

/** The allowance's reset (the 1st, UTC — `nextMonthStartUtc`) when the page didn't say. */
function nextMonthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** "November 1" — when a spent allowance comes back. */
function refillDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
