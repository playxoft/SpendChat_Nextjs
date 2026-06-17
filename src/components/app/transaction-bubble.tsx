import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function amountToneClass(type: "income" | "expense"): string {
  return type === "income"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}

export function TransactionBubble({
  type,
  amountLabel,
  note,
  categoryName,
  categoryIcon,
  timeLabel,
  actions,
  className,
}: {
  type: "income" | "expense";
  amountLabel: string;
  note?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  timeLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group flex w-full max-w-md items-start gap-2.5 animate-rise", className)}>
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
      >
        {categoryIcon ?? "💸"}
      </div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">
            {categoryName ?? "Uncategorized"}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              amountToneClass(type),
            )}
          >
            {amountLabel}
          </span>
        </div>
        {note ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{note}</p>
        ) : null}
        {(timeLabel || actions) && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{timeLabel}</span>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
