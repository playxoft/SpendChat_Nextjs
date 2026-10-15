"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The invoices section's layout on every tab: the list on the left, a panel on
 * the right with what's picked — a document, a client, a set of details. From
 * `lg` the two sit side by side filling the rest of the screen's height (the
 * page itself doesn't scroll — `InvoicesShell`), and each scrolls on its own
 * to its end. Below `lg` the list has the screen, and an open panel covers it
 * until it's closed. Place it in a flex column so it can take the height.
 */
export function SplitView({
  list,
  panel,
  open,
  label,
}: {
  list: ReactNode;
  panel: ReactNode;
  /** Something is picked (or being made) — what decides the panel on a phone. */
  open: boolean;
  /** The panel's accessible name. */
  label: string;
}) {
  return (
    <div className="grid items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
      <div className="scrollbar-slim min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">{list}</div>
      <section
        aria-label={label}
        className={cn(
          "scrollbar-slim overflow-y-auto bg-background",
          // Phone: over the list while open, out of the way otherwise.
          open ? "fixed inset-0 z-40 p-4" : "hidden",
          // Desktop: always there, beside the list, as tall as it and scrolling on its own.
          "lg:static lg:z-auto lg:block lg:h-full lg:rounded-xl lg:border lg:p-4",
        )}
      >
        {panel}
      </section>
    </div>
  );
}

/** A panel's top line: what it shows, and ✕ (or other controls) on the right. */
export function PanelHeader({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose?: () => void;
  /** Extra controls before ✕. */
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
      <div className="flex shrink-0 items-center gap-1">
        {children}
        {onClose ? <PanelClose onClose={onClose} /> : null}
      </div>
    </div>
  );
}

export function PanelClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      title="Close"
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" />
    </button>
  );
}

/** The panel with nothing picked: what goes here, and the way to start. */
export function PanelEmpty({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
