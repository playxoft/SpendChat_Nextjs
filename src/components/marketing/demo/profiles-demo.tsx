"use client";

import { useEffect, useRef } from "react";
import { LayoutGrid } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { DemoFrame } from "./demo-frame";
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import {
  DEMO_PROFILES,
  DEMO_PROFILE_BLURB,
  DEMO_PROFILE_ICON,
  type DemoProfile,
} from "./demo-data";
import { useDemoFeed } from "./use-demo-feed";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * Three profiles, three sets of books.
 *
 * The switch is the whole demo, so it has to be a real one: each profile has
 * its own seeded feed in `demo-data.ts`, and picking one swaps the transactions
 * *and* the balance above them. A demo that re-labelled the same rows would
 * teach the wrong model — profiles aren't a filter or a tag, they're separate
 * ledgers that happen to live in one account.
 *
 * The sidebar is the app's, via `DemoFrame`, with the profile list rendered
 * into its `sidebarTop` slot the way the real one is — including the Shift+n
 * shortcut chips, which are built from the shortcut registry rather than being
 * typed out here (see `profileCombo` below).
 */

/**
 * The registry names the profile chord once, as the first slot (`shift+1`)
 * plus a label that explains the 1…9 range; a sidebar has to show every row its
 * own number. So the modifier comes out of the registry and only the digit is
 * computed here — the same split `shortcuts-demo.tsx` makes, and the reason a
 * change to `src/lib/shortcuts.ts` reaches these chips instead of leaving them
 * quietly wrong.
 */
const PROFILE_MOD = comboFor("profiles.switch").split("+").slice(0, -1).join("+");

/** Shift + 1…9, then 0 for a tenth profile — the app's own numbering. */
function profileCombo(index: number): string {
  return `${PROFILE_MOD}+${(index + 1) % 10}`;
}

export function ProfilesDemo() {
  const feed = useDemoFeed("Personal");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Land on the newest row when the books change, rather than wherever the last
  // profile happened to be scrolled to. The feed is bottom-anchored (see the
  // note on it below), so the start of a profile's feed is its *bottom* — this
  // used to scroll to 0, which parked every switch on the oldest transaction in
  // a ledger the visitor had never seen. Scoped to the demo's own scroller, so
  // it never moves the page under the reader.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.profile]);

  return (
    <DemoFrame
      label="Interactive profiles demo"
      active="/app"
      className="h-[36rem]"
      sidebarTop={
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Profiles
            </span>
          </div>
          <div className="space-y-0.5 px-2 pb-2">
            {DEMO_PROFILES.map((profile, i) => {
              const active = profile === feed.profile;
              return (
                <div
                  key={profile}
                  className={cn(
                    "group relative flex items-center gap-1 rounded-lg pr-2.5 transition-colors",
                    active ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="w-2.5 shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => feed.setProfile(profile as DemoProfile)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-sm transition-colors",
                      active
                        ? "font-medium text-accent-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <span aria-hidden className="text-base">
                      {DEMO_PROFILE_ICON[profile]}
                    </span>
                    <span className="truncate">{profile}</span>
                    <Kbd combo={profileCombo(i)} className="ml-auto shrink-0 opacity-60" />
                  </button>
                </div>
              );
            })}

            {/* The app's "All profiles" row — everything at once, for the
                months where you want one number rather than three. */}
            <div className="flex items-center gap-1 rounded-lg pr-2.5 text-muted-foreground">
              <span className="w-2.5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-sm">
                <LayoutGrid className="size-4" />
                <span className="truncate">All profiles</span>
                <Kbd
                  combo={comboFor("profiles.all")}
                  className="ml-auto shrink-0 opacity-60"
                />
              </span>
            </div>
          </div>
        </div>
      }
      header={
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <DemoSummaryBar
              label="August"
              balanceMinor={feed.balanceMinor}
              incomeMinor={feed.totals.incomeMinor}
              expenseMinor={feed.totals.expenseMinor}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {DEMO_PROFILE_BLURB[feed.profile]}
            </p>
          </div>
          {/* On narrow screens the sidebar is gone, so the header carries the
              switcher — exactly the split the app makes. */}
          <div className="lg:hidden">
            <DemoProfilePicker profile={feed.profile} onChange={feed.setProfile} />
          </div>
        </div>
      }
      bodyClassName="overflow-hidden"
    >
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
        {/* The feed grows from the bottom, as it does in the app: the newest
            transaction sits at the bottom edge of the pane — where the app
            keeps it, just above the composer — rather than leaving a gap
            beneath a short history. There's no composer in this frame: the
            switcher is the whole story here, and a second copy of the
            tracker's input would only compete with it for attention. */}
        <div className="flex min-h-full flex-col justify-end">
          <DemoFeed txns={feed.txns} />
        </div>
      </div>
    </DemoFrame>
  );
}
