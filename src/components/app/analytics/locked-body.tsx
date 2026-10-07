"use client";

import type * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { advancedAnalyticsLock } from "@/lib/add-limits";
import { usePlan } from "@/components/app/upgrade-dialog";

/**
 * A Plus widget on Free: the real component drawn over sample numbers,
 * blurred and taken out of the tab order and the accessibility tree, with a
 * lock, one line on what it shows, and an Upgrade button into the upgrade
 * dialog. The sample never came from the workspace — a Free request doesn't
 * read a transaction for this section.
 */
export function LockedBody({ hint, children }: { hint: string; children: React.ReactNode }) {
  const { plan, showUpgrade } = usePlan();
  const lock = advancedAnalyticsLock(plan);
  return (
    <div className="relative h-full min-h-[inherit]">
      <div aria-hidden inert className="pointer-events-none h-full select-none opacity-60 blur-[3px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div className="flex max-w-64 flex-col items-center gap-2 rounded-lg border bg-background/90 px-4 py-3 text-center shadow-sm">
          <Lock aria-hidden className="size-4 text-muted-foreground" />
          <p className="text-sm">{hint}</p>
          <Button type="button" size="sm" onClick={() => showUpgrade(lock.info)}>
            {lock.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The section header's Upgrade button (Free). */
export function InsightsUpgradeButton() {
  const { plan, showUpgrade } = usePlan();
  const lock = advancedAnalyticsLock(plan);
  return (
    <Button type="button" variant="outline" onClick={() => showUpgrade(lock.info)}>
      <Lock aria-hidden className="size-3.5" />
      {lock.cta}
    </Button>
  );
}
