"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The month ("YYYY-MM") currently under the sticky header as the user scrolls
 * the tracker. The scroll spy in the feed sets it; the summary bar reads it to
 * show that month's balance. Kept in a tiny context because the two live in
 * separate Suspense branches of the tracker page and only share this one string.
 */
type ActiveMonthValue = {
  activeMonth: string;
  setActiveMonth: (month: string) => void;
};

const ActiveMonthContext = createContext<ActiveMonthValue | null>(null);

export function useActiveMonth(): ActiveMonthValue {
  const ctx = useContext(ActiveMonthContext);
  if (!ctx) {
    throw new Error("useActiveMonth must be used within <ActiveMonthProvider>");
  }
  return ctx;
}

export function ActiveMonthProvider({
  initialMonth,
  children,
}: {
  initialMonth: string;
  children: ReactNode;
}) {
  const [activeMonth, setActiveMonth] = useState(initialMonth);
  const value = useMemo(() => ({ activeMonth, setActiveMonth }), [activeMonth]);
  return <ActiveMonthContext.Provider value={value}>{children}</ActiveMonthContext.Provider>;
}
