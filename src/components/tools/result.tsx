"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Link2, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shareUrl } from "@/components/tools/tool-state";
import { cn } from "@/lib/utils";

/**
 * The output half of a `/tools/*` calculator: the answer, the breakdown, and
 * what you can do with it (copy, share, reset).
 *
 * The answer is the biggest thing on the screen and is announced to screen
 * readers as it changes (`useAnnounce`) — there is no "Calculate" button to
 * press, anywhere.
 */

/** Inputs left, result right on desktop; stacked (inputs first) on a phone. */
export function ToolLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A bordered card that holds a calculator's inputs or its result. */
export function ToolPanel({
  children,
  className,
  sticky,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Keep the result in view on desktop while a long form scrolls. */
  sticky?: boolean;
  as?: "div" | "section";
}) {
  return (
    <As
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-4 sm:p-6",
        sticky && "lg:sticky lg:top-24",
        className,
      )}
    >
      {children}
    </As>
  );
}

/**
 * Screen-reader announcements for results. A live region only announces
 * changes to itself, and each result block mounts and unmounts as inputs go
 * from valid to empty and back — a fresh region arrives already full and is
 * usually read out by nobody. So every result speaks through one region that
 * lives on the page for good, debounced so typing "1500" announces once.
 */
let announcer: HTMLElement | null = null;
let announceTimer: ReturnType<typeof setTimeout> | undefined;
let lastAnnounced = "";

function ensureAnnouncer(): HTMLElement {
  if (announcer && document.body.contains(announcer)) return announcer;
  announcer = document.createElement("div");
  announcer.setAttribute("role", "status");
  announcer.className = "sr-only";
  document.body.appendChild(announcer);
  return announcer;
}

/** Announce `ref`'s text whenever it changes — but not on first render, which is the page loading. */
function useAnnounce(ref: RefObject<HTMLElement | null>) {
  const first = useRef(true);
  useEffect(() => {
    const text = ref.current?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const region = ensureAnnouncer();
    if (first.current) {
      first.current = false;
      lastAnnounced = text;
      return;
    }
    if (!text || text === lastAnnounced) return;
    lastAnnounced = text;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      region.textContent = text;
    }, 700);
  });
}

/** The one number the visitor came for. */
export function ResultHero({
  label,
  value,
  sub,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** A short sentence reading the number back in words. */
  sub?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAnnounce(ref);
  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums break-words sm:text-4xl">
        {value}
      </p>
      {sub && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

export type ResultRow = {
  label: ReactNode;
  value: ReactNode;
  /** Bold the row — a subtotal or the figure a breakdown adds up to. */
  strong?: boolean;
};

/** The breakdown under the answer, as a definition list. */
export function ResultRows({ rows, className }: { rows: ResultRow[]; className?: string }) {
  return (
    <dl className={cn("divide-y border-y text-sm", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className={cn("text-muted-foreground", row.strong && "font-medium text-foreground")}>
            {row.label}
          </dt>
          <dd className={cn("text-right tabular-nums", row.strong && "font-semibold")}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A friendly nudge shown in place of a result while an input is missing or invalid. */
export function ResultEmpty({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useAnnounce(ref);
  return (
    <p ref={ref} className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy — your browser blocked clipboard access.");
  }
}

/**
 * Copy / Share / Reset (and optionally Print), under every result.
 *
 * `copy` is the result as a sentence someone would paste into a chat — not a
 * dump of every field. Pass `null` to leave the Copy button out.
 */
export function ResultActions({
  copy,
  onReset,
  onPrint,
  withCurrency = true,
  className,
}: {
  copy: string | null;
  onReset?: () => void;
  onPrint?: () => void;
  /** Money tools pin the currency into the shared link; date tools don't need it. */
  withCurrency?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {copy && (
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => copyText(copy, "Result copied")}>
          <Copy /> Copy result
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-lg"
        onClick={() => copyText(shareUrl({ withCurrency }), "Link copied — it opens with these numbers")}
      >
        <Link2 /> Copy link
      </Button>
      {onPrint && (
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onPrint}>
          <Printer /> Print / PDF
        </Button>
      )}
      {onReset && (
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onReset}>
          <RotateCcw /> Reset
        </Button>
      )}
    </div>
  );
}

/**
 * The one SpendChat hand-off on a tool: a quiet, centred line under the whole
 * calculator — never a wall in front of the answer. `message` ties it to what
 * the visitor just did. Rendered by `ToolPage`, not by each tool.
 */
export function ToolCta({
  slug,
  message,
  href = "/sign-up",
  className,
}: {
  slug: string;
  message: string;
  /** Where it signs people up to — a tool whose work carries over passes its own `?next=`. */
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-track-event="cta_click"
      data-track-params={JSON.stringify({ location: `tool_${slug}`, label: "tool_result_cta" })}
      className={cn(
        "group flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-dashed px-4 py-3 text-center text-sm transition-colors hover:bg-muted/50",
        className,
      )}
    >
      <span className="text-muted-foreground">{message}</span>
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        Try SpendChat free
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
