"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeConsent,
} from "@/lib/consent";
import { TRACK_EVENT_ATTR, TRACK_PARAMS_ATTR, trackEvent } from "@/lib/analytics";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

const SCROLL_THRESHOLDS = [25, 50, 75, 90];

/**
 * Mounted once in the (marketing) layout — analytics never reach the
 * authenticated app. Loads GA4 + Clarity only after the visitor grants
 * cookie consent (src/lib/consent.ts); until then this renders nothing and
 * trackEvent() calls elsewhere stay no-ops. Also tracks SPA pageviews (gtag's
 * own `config` call only fires once, not on client-side route changes),
 * scroll depth, and delegates clicks for any element carrying
 * data-track-event/data-track-params, so Server Component pages can declare
 * trackable clicks without becoming Client Components.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot
  );
  const isFirstPageview = useRef(true);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        `[${TRACK_EVENT_ATTR}]`
      );
      const name = target?.getAttribute(TRACK_EVENT_ATTR);
      if (!name) return;
      const raw = target?.getAttribute(TRACK_PARAMS_ATTR);
      let params;
      if (raw) {
        try {
          params = JSON.parse(raw);
        } catch {
          params = undefined;
        }
      }
      trackEvent(name, params);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    // Skip the very first pageview — gtag's initial `config` call below
    // already sends one for the landing page.
    if (isFirstPageview.current) {
      isFirstPageview.current = false;
      return;
    }
    trackEvent("page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  useEffect(() => {
    const fired = new Set<number>();
    function handleScroll() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const percent = (window.scrollY / scrollable) * 100;
      for (const threshold of SCROLL_THRESHOLDS) {
        if (percent >= threshold && !fired.has(threshold)) {
          fired.add(threshold);
          trackEvent("scroll_depth", { percent: threshold, page_path: pathname });
        }
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  if (!GA_MEASUREMENT_ID && !CLARITY_PROJECT_ID) return null;
  if (consent !== "granted") return null;

  return (
    <>
      {GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
      {CLARITY_PROJECT_ID && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
          `}
        </Script>
      )}
    </>
  );
}
