"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { FeedJumpTarget } from "@/lib/feed-days";

type JumpHandler = (target: FeedJumpTarget) => Promise<void>;

type FeedJumpValue = {
  /** Open the feed at a day or a month; resolves once it's there (or has said why not). */
  jump: JumpHandler;
  /** The feed's handler, while it's mounted (null when it unmounts). */
  register: (handler: JumpHandler | null) => void;
};

const FeedJumpContext = createContext<FeedJumpValue | null>(null);

/**
 * Connects the tracker header's date picker to the feed. They sit in separate
 * Suspense branches of the page (the feed streams in, and remounts on a
 * profile switch), so the feed registers what a jump does and the picker calls
 * it — the same shape as `ActiveMonthProvider` beside it.
 */
export function FeedJumpProvider({ children }: { children: ReactNode }) {
  const handler = useRef<JumpHandler | null>(null);
  const register = useCallback((next: JumpHandler | null) => {
    handler.current = next;
  }, []);
  const jump = useCallback(async (target: FeedJumpTarget) => {
    await handler.current?.(target);
  }, []);
  const value = useMemo(() => ({ jump, register }), [jump, register]);
  return <FeedJumpContext.Provider value={value}>{children}</FeedJumpContext.Provider>;
}

export function useFeedJump(): FeedJumpValue {
  const ctx = useContext(FeedJumpContext);
  if (!ctx) throw new Error("useFeedJump must be used within <FeedJumpProvider>");
  return ctx;
}
