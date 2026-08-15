"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFileSize } from "@/lib/attachments";
import { formatStorageCompact, storageUsageTone } from "@/lib/files";
import { cn } from "@/lib/utils";

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ARC_CLASS = {
  ok: "stroke-primary",
  warn: "stroke-amber-500",
  full: "stroke-destructive",
} as const;

const BAR_CLASS = {
  ok: "bg-primary",
  warn: "bg-amber-500",
  full: "bg-destructive",
} as const;

/** The exact usage sentence — popover title, tooltip body, aria labels. */
export const storageExactLabel = (usedBytes: number, limitBytes: number): string =>
  `${formatFileSize(usedBytes)} of ${formatFileSize(limitBytes)} used`;

/** The bare gauge circle, sized by the caller (`size-6` toolbar, `size-3.5` nav). */
export function StorageRingSvg({
  usedBytes,
  limitBytes,
  className,
}: {
  usedBytes: number;
  limitBytes: number;
  className?: string;
}) {
  const tone = storageUsageTone(usedBytes, limitBytes);
  const fraction = Math.min(1, usedBytes / limitBytes);
  // Keep a visible sliver once anything is stored; the ring only closes
  // completely when the quota really is full.
  const shown = usedBytes > 0 ? Math.max(0.02, fraction) : 0;
  return (
    <svg viewBox="0 0 32 32" className={cn("-rotate-90", className)} aria-hidden>
      <circle cx="16" cy="16" r={RADIUS} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="16"
        cy="16"
        r={RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - shown)}
        className={cn("transition-[stroke-dashoffset] duration-300", ARC_CLASS[tone])}
      />
    </svg>
  );
}

/**
 * Workspace storage gauge for the files toolbar — ring + rounded "0.1/1 GB"
 * label, `h-8` to match the icon buttons beside it. Radix Tooltip is
 * hover-only, so the exact numbers open in one controlled Popover: hover
 * opens/closes it for a mouse, tap toggles it on touch (where the synthetic
 * pointerenter is ignored so it can't fight the click). Closing is deferred a
 * beat and cancelled when the pointer reaches the content, so the mouse can
 * cross the trigger→content gap without the popover vanishing under it.
 */
export function StorageRing({
  usedBytes,
  limitBytes,
}: {
  usedBytes: number;
  limitBytes: number;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const tone = storageUsageTone(usedBytes, limitBytes);
  const fraction = Math.min(1, usedBytes / limitBytes);
  const label = storageExactLabel(usedBytes, limitBytes);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => cancelClose, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg px-1.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Storage: ${label}`}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") openNow();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose();
          }}
        >
          <StorageRingSvg usedBytes={usedBytes} limitBytes={limitBytes} className="size-5" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatStorageCompact(usedBytes, limitBytes)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        closeOnOutsideClick
        className="w-64 p-3"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") cancelClose();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
      >
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", BAR_CLASS[tone])}
            style={{ width: `${Math.min(100, fraction * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Vault files and transaction attachments, across the whole workspace.
        </p>
      </PopoverContent>
    </Popover>
  );
}
