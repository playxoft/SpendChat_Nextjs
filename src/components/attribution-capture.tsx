"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Records the visit's first channel touch (see `lib/attribution.ts`). Mounted
 * once in the root layout, runs once per page load, renders nothing.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
