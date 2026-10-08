"use client";

import Link from "next/link";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import { FOCUS_RING, NavMenu } from "@/components/marketing/nav-menu";
import { trackEvent } from "@/lib/analytics";
import {
  FEATURE_GROUPS,
  featurePath,
  featuresInGroup,
  publishedFeatures,
} from "@/lib/features";
import { cn } from "@/lib/utils";

/**
 * The desktop Features menu: a three-column directory of every feature page,
 * one column per group. The hover, keyboard and positioning behaviour lives in
 * `NavMenu` (shared with the Tools menu); this file is only what's inside.
 */
export function FeaturesMenu({
  markActive = true,
}: {
  /** See `NavMenu`'s `markActive` — `false` on the 404. */
  markActive?: boolean;
} = {}) {
  const spokes = publishedFeatures();
  return (
    <NavMenu
      href="/features"
      label="Features"
      panelLabel="Features"
      panelWidthRem={46}
      hasPanel={spokes.length > 0}
      markActive={markActive}
    >
      {(close) => (
        <>
          <div className="scrollbar-slim grid min-h-0 flex-1 gap-x-2 gap-y-4 overflow-y-auto sm:grid-cols-3">
            {FEATURE_GROUPS.map((group) => {
              const items = featuresInGroup(group.id);
              if (items.length === 0) return null;
              return (
                <div key={group.id}>
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  {items.map((feature) => (
                    <Link
                      key={feature.slug}
                      href={featurePath(feature.slug)}
                      onClick={() => {
                        close();
                        trackEvent("nav_link_click", {
                          label: feature.slug,
                          location: "features_menu",
                        });
                      }}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent",
                        FOCUS_RING,
                      )}
                    >
                      <FeatureIcon
                        name={feature.icon}
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium">{feature.label}</span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {feature.blurb}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-2 shrink-0 border-t pt-2">
            <Link
              href="/features"
              onClick={() => {
                close();
                trackEvent("nav_link_click", {
                  label: "all_features",
                  location: "features_menu",
                });
              }}
              className={cn(
                "flex items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent",
                FOCUS_RING,
              )}
            >
              See all features
            </Link>
          </div>
        </>
      )}
    </NavMenu>
  );
}

/**
 * The mobile counterpart: an indented list of every feature page, under the
 * "Features" link in the sheet. Flat rather than collapsible — a sheet the user
 * already opened deliberately shouldn't ask for a second tap to reveal its
 * contents. Like the desktop panel this is behind an interaction — a Radix
 * portal with no `forceMount` — so it is for people, not for crawlers.
 */
export function FeaturesMenuMobile({ onNavigate }: { onNavigate?: () => void }) {
  const spokes = publishedFeatures();
  if (spokes.length === 0) return null;

  return (
    <div className="mt-0.5 mb-1 ml-3 flex flex-col border-l pl-3">
      {spokes.map((feature) => (
        <Link
          key={feature.slug}
          href={featurePath(feature.slug)}
          onClick={() => {
            trackEvent("nav_link_click", {
              label: feature.slug,
              location: "features_menu_mobile",
            });
            onNavigate?.();
          }}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {feature.label}
        </Link>
      ))}
    </div>
  );
}
