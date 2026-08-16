"use client";

// The wrapper every preview card renders inside (`cfg.provider` in
// .design-sync/config.json), bundled as `window.SpendChat.DesignPreviewProvider`.
//
// Three contexts, for three different reasons:
//
//  * next-themes `ThemeProvider` — the app's real theme root. It owns the
//    `.dark` class the whole token layer keys off, so without it dark-mode
//    styling has nothing to switch on. Its props mirror `src/app/layout.tsx`
//    exactly, and that matters in both directions: pinning `defaultTheme` to
//    light with `enableSystem={false}` (which this used to do) makes the
//    stylesheet's whole `.dark` layer unreachable from any card, and because
//    next-themes owns `documentElement.classList` under `attribute="class"`, a
//    `.dark` class applied from outside is stripped on the next render. Change
//    the theme through this provider, or change it in the app first.
//  * `TooltipProvider` — SpendChat's `Tooltip` is the bare Radix root; it
//    throws outside a provider. TransactionBubble, ControlHint and every
//    icon-button hint depend on this. `delayDuration` mirrors the app too:
//    Radix's default is 700ms, and the product's hover timing is 300ms.
//  * `PendingMessagesProvider` — TransactionComposer calls
//    `usePendingMessages()`, which throws by design outside it (optimistic
//    chat rows live in that context).
//  * Next's app-router contexts — `usePathname()` / `useSearchParams()` /
//    `useRouter()` return null outside a Next render, and nav components call
//    `.get()` on the result. AppSidebar, BottomNav, SettingsNav and
//    ProfileSwitcher all crash without these.
//
// The router contexts are deep imports from `next/dist/...`. They are not part
// of Next's public API and could move on a major upgrade; if previews start
// failing with "Cannot read properties of null", check these paths first. This
// is preview-only scaffolding — nothing here ships in an app that already
// renders inside Next.

import * as React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PendingMessagesProvider } from "@/components/app/pending-messages";

const noop = () => {};

const inertRouter = {
  push: noop,
  replace: noop,
  back: noop,
  forward: noop,
  refresh: noop,
  prefetch: async () => {},
} as unknown as React.ContextType<typeof AppRouterContext>;

export function DesignPreviewProvider({
  children,
  pathname = "/app",
}: {
  children: React.ReactNode;
  pathname?: string;
}) {
  const searchParams = React.useMemo(() => new URLSearchParams(), []);
  return (
    <AppRouterContext.Provider value={inertRouter}>
      <PathnameContext.Provider value={pathname}>
        <SearchParamsContext.Provider value={searchParams}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={300}>
              <PendingMessagesProvider>{children}</PendingMessagesProvider>
            </TooltipProvider>
          </ThemeProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
