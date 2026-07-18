"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { FullscreenLoader } from "./fullscreen-loader";

type RunOptions = { variant?: "skeleton" | "spinner" };
type RunFn = (action: () => void | Promise<void>, label?: string, opts?: RunOptions) => void;
type QuietFn = (action: () => void | Promise<void>) => void;

type LoadingOverlayCtx = {
  /**
   * Run a blocking navigation with a full-screen loader until it settles.
   * `opts.variant` picks the loader style ("skeleton" default, or "spinner"
   * for a plain centered spinner — e.g. switching workspaces).
   */
  run: RunFn;
  /**
   * Like `run` but WITHOUT the full-screen loader — for soft profile switches
   * where the page already streams its own skeletons. `pending` still flips,
   * so consumers (e.g. the composer) can disable themselves until the new
   * profile has loaded, without covering the page.
   */
  runQuiet: QuietFn;
  pending: boolean;
};

// Fallback runs the action without an overlay, so consumers still work if they
// somehow render outside the provider (tests, isolated stories).
const Context = createContext<LoadingOverlayCtx>({
  run: (action) => {
    void Promise.resolve(action());
  },
  runQuiet: (action) => {
    void Promise.resolve(action());
  },
  pending: false,
});

/**
 * Hosts a full-screen loading overlay at a stable point in the tree (the app
 * layout, which doesn't unmount on navigation). Because the transition is owned
 * here — not by the button that triggers it — the loader survives even when the
 * trigger unmounts mid-switch (e.g. the mobile profile sheet closing).
 */
export function LoadingOverlayProvider({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("Loading…");
  const [variant, setVariant] = useState<"skeleton" | "spinner">("skeleton");
  // Whether the current transition should paint the full-screen loader. Quiet
  // transitions (profile switches) still set `pending` but skip the overlay.
  const [showOverlay, setShowOverlay] = useState(true);

  const run = useCallback<RunFn>(
    (action, nextLabel, opts) => {
      if (nextLabel) setLabel(nextLabel);
      setVariant(opts?.variant ?? "skeleton");
      setShowOverlay(true);
      startTransition(async () => {
        await action();
      });
    },
    [],
  );

  const runQuiet = useCallback<QuietFn>(
    (action) => {
      setShowOverlay(false);
      startTransition(async () => {
        await action();
      });
    },
    [],
  );

  return (
    <Context.Provider value={{ run, runQuiet, pending }}>
      {children}
      {pending && showOverlay && <FullscreenLoader label={label} variant={variant} />}
    </Context.Provider>
  );
}

export function useLoadingOverlay() {
  return useContext(Context);
}
