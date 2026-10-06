"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addLock,
  type AddLimitsData,
  type AddLock,
  type AddLockKind,
  type AddLockOptions,
} from "@/lib/add-limits";
import { cn } from "@/lib/utils";
import { usePlan } from "./upgrade-dialog";

/**
 * Plan limits shown up front. One behaviour everywhere: a "new …" control
 * whose limit is reached keeps working but carries a lock with a tooltip
 * (reason + "See plans"); the form it opens shows a `LimitPanel` at the top and
 * a disabled create button (`LockedButton`). Editing what already exists is
 * never locked — limits only stop adding.
 *
 * The data is the layout's `getAddLimits()` via `usePlan().addLimits`; with no
 * provider nothing locks. The server still enforces every limit, and its
 * refusal still opens the upgrade dialog (`handlePlanLimit`).
 */

/** The layout's add limits, or null outside the app. */
export function useAddLimits(): AddLimitsData | null {
  return usePlan().addLimits ?? null;
}

/** The lock for adding one more `kind` here, or null when it's allowed. */
export function useAddLock(kind: AddLockKind, opts?: AddLockOptions): AddLock | null {
  return addLock(useAddLimits(), kind, opts);
}

/** Tooltip body: the reason, plus a way into the upgrade dialog for mouse users. */
function LockTooltipContent({
  lock,
  side = "top",
}: {
  lock: AddLock;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { showUpgrade } = usePlan();
  return (
    <TooltipContent
      side={side}
      variant="surface"
      className="max-w-64 flex-col items-start gap-1 text-left"
    >
      <span>{lock.reason}</span>
      <button
        type="button"
        className="font-medium underline underline-offset-2 hover:text-foreground"
        onClick={() => showUpgrade(lock.info)}
      >
        {lock.info.upgradeTo ? "See plans" : "Contact us"}
      </button>
    </TooltipContent>
  );
}

/**
 * A small lock with the reason in a tooltip. Clicking it opens the upgrade
 * dialog, so keyboard users get there too (the tooltip's link is mouse-only).
 */
export function LimitLock({
  lock,
  className,
  side,
}: {
  lock: AddLock | null;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { showUpgrade } = usePlan();
  if (!lock) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${lock.title}. ${lock.info.upgradeTo ? "See plans" : "Contact us"}`}
          onClick={(e) => {
            // It can sit inside a clickable row or a label.
            e.preventDefault();
            e.stopPropagation();
            showUpgrade(lock.info);
          }}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
        >
          <Lock aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <LockTooltipContent lock={lock} side={side} />
    </Tooltip>
  );
}

/**
 * Wrap a "new …" control: when locked it gets the reason as a tooltip (the
 * control itself still works and opens its form). Unlocked, it renders the
 * child untouched.
 */
export function LimitTooltip({
  lock,
  children,
  side,
  wrapperClassName,
}: {
  lock: AddLock | null;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Set when the child is disabled: a disabled control gets no pointer or
   * focus events, so the tooltip hangs off a focusable wrapper with this class.
   */
  wrapperClassName?: string;
}) {
  if (!lock) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {wrapperClassName !== undefined ? (
          <span
            tabIndex={0}
            className={cn(
              "rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              wrapperClassName,
            )}
          >
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <LockTooltipContent lock={lock} side={side} />
    </Tooltip>
  );
}

/** A lock glyph to put inside a locked control (text buttons, menu rows). */
export function LockGlyph({ className }: { className?: string }) {
  return (
    <>
      <Lock aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />
      <span className="sr-only">(limit reached)</span>
    </>
  );
}

/** A tiny lock on the corner of an icon-only button (`relative` on the button). */
export function LockBadge() {
  return (
    <span
      aria-hidden
      className="absolute -right-0.5 -bottom-0.5 flex size-3 items-center justify-center rounded-full bg-background text-muted-foreground"
    >
      <Lock className="size-2.5" />
    </span>
  );
}

/**
 * The panel at the top of a create form when the limit is reached: what's
 * reached, the plan that lifts it, and an Upgrade button.
 */
export function LimitPanel({
  lock,
  hint,
  className,
}: {
  lock: AddLock | null;
  /** An extra line — what can still be done ("Pick another space"). */
  hint?: string;
  className?: string;
}) {
  const { showUpgrade } = usePlan();
  if (!lock) return null;
  return (
    <div
      role="note"
      className={cn("flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3", className)}
    >
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{lock.title}</p>
        <p className="text-xs text-muted-foreground">{lock.reason}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => showUpgrade(lock.info)}
      >
        {lock.cta}
      </Button>
    </div>
  );
}

/**
 * A create/submit button that's disabled while `lock` is set, with the reason
 * in a tooltip. A disabled button gets no pointer events, so the tooltip hangs
 * off a focusable wrapper instead.
 */
export function LockedButton({
  lock,
  children,
  disabled,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { lock: AddLock | null }) {
  if (!lock) {
    return (
      <Button disabled={disabled} className={className} {...props}>
        {children}
      </Button>
    );
  }
  // An icon-only button swaps its icon for the lock; a labelled one gains it.
  const iconOnly = typeof props.size === "string" && props.size.startsWith("icon");
  return (
    <LimitTooltip lock={lock} wrapperClassName="flex">
      <Button {...props} disabled className={cn("flex-1", className)}>
        <Lock aria-hidden className="size-4" />
        {iconOnly ? null : children}
      </Button>
    </LimitTooltip>
  );
}
