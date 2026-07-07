"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { FullscreenLoader } from "./fullscreen-loader";

type RunFn = (action: () => void | Promise<void>, label?: string) => void;

type LoadingOverlayCtx = {
  /** Run a blocking navigation with a full-screen loader until it settles. */
  run: RunFn;
  pending: boolean;
};

// Fallback runs the action without an overlay, so consumers still work if they
// somehow render outside the provider (tests, isolated stories).
const Context = createContext<LoadingOverlayCtx>({
  run: (action) => {
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

  const run = useCallback<RunFn>(
    (action, nextLabel) => {
      if (nextLabel) setLabel(nextLabel);
      startTransition(async () => {
        await action();
      });
    },
    [],
  );

  return (
    <Context.Provider value={{ run, pending }}>
      {children}
      {pending && <FullscreenLoader label={label} />}
    </Context.Provider>
  );
}

export function useLoadingOverlay() {
  return useContext(Context);
}
