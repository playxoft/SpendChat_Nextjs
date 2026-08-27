"use client";

import { DemoFrame } from "@/components/marketing/demo/demo-frame";
import { DemoFeed } from "@/components/marketing/demo/demo-feed";
import {
  DEMO_PROFILE_ICON,
  type DemoProfile,
} from "@/components/marketing/demo/demo-data";
import { useDemoFeed } from "@/components/marketing/demo/use-demo-feed";
import { useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";

/**
 * The gallery's control panel: `DemoFrame` with a seeded feed and nothing to
 * click.
 *
 * It sits at the top of the page so the chrome — corner radius, border, header
 * height, sidebar width — can be read against every live demo below it. That
 * only works if it's comparable in the respects the gallery *isn't* testing
 * too, which is why this is a client island rather than a few lines inside the
 * page: it reads the same `useDemoMoney()` the demos do. A `$1,921.60` panel
 * stacked above a column of `₹1,53,000` ones is drift the gallery would be
 * structurally unable to catch, because the difference would be its own doing.
 *
 * The rows come from `useDemoFeed`, which is where seeded amounts are scaled
 * into the visitor's currency and nowhere else (see its comment), and are drawn
 * by `DemoFeed` — so the day dividers and bubbles are the same ones the real
 * demos render, not a second copy that could drift on its own.
 */
export function StaticFeed({ profile }: { profile: DemoProfile }) {
  const feed = useDemoFeed(profile);
  const money = useDemoMoney();

  return (
    <DemoFrame
      label={`${profile} tracker demo`}
      header={
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div>
            <p className="text-xs text-muted-foreground">Balance this month</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(feed.balanceMinor, money.code, money.locale)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
            <span aria-hidden>{DEMO_PROFILE_ICON[profile]}</span> {profile}
          </span>
        </div>
      }
      bodyClassName="px-4 py-4"
    >
      <DemoFeed txns={feed.txns} />
    </DemoFrame>
  );
}
