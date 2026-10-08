import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Tripwire for a parallel-route slot that falls back to `default.tsx`.
 *
 * On a client-side navigation to a URL a named slot (`@x`) has no page for,
 * Next 16 doesn't render the slot's default — it keeps the slot's *previous*
 * segment and remembers the URL it came from
 * (`reuseActiveSegmentInDefaultSlot`, `next/dist/client/components/
 * router-reducer/ppr-navigations.js`). Every later `router.refresh()` or
 * revalidation then re-requests that old URL too. Ask's chat column first
 * shipped as an `@panel` slot with a page only under `ask/`: leave Ask, add
 * ten transactions on the tracker, and Ask's page rendered ten more times in
 * the background.
 *
 * So a slot must match every URL under it — a `page.tsx` at its root and a
 * catch-all page — or not exist. Ask's column now lives in its page.
 */

const APP = join(__dirname, "..", "..", "src", "app");

function slotsUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("@")) out.push(full);
    slotsUnder(full, out);
  }
  return out;
}

describe("parallel-route slots", () => {
  it("every named slot matches every URL under it, so it never reuses a stale segment", () => {
    const stale = slotsUnder(APP).filter((slot) => {
      const entries = readdirSync(slot);
      const root = entries.some((e) => /^page\.(t|j)sx?$/.test(e));
      const catchAll = entries.some(
        (e) => /^\[\[?\.\.\..+\]\]?$/.test(e) && existsSync(join(slot, e, "page.tsx")),
      );
      return !(root && catchAll);
    });
    expect(stale).toEqual([]);
  });

  it("Ask's chat column is rendered by the Ask page, not a slot", () => {
    const page = readFileSync(join(APP, "app", "ask", "page.tsx"), "utf8");
    expect(page).toContain("<AskPanel");
    expect(existsSync(join(APP, "app", "@panel"))).toBe(false);
  });
});
