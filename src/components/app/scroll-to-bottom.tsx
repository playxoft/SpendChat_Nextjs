"use client";

import { useEffect } from "react";

/** Scrolls the window to the newest transaction on load and when the count changes. */
export function ScrollToBottom({ count }: { count: number }) {
  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  }, [count]);
  return null;
}
