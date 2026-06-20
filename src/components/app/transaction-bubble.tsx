import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function amountToneClass(type: "income" | "expense"): string {
  return type === "income"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}

/**
 * A transaction rendered as a chat bubble. Income ("incoming") aligns left;
 * expense ("outgoing") aligns right, like sent vs. received messages.
 */
export function TransactionBubble({
  type,
  amountLabel,
  title,
  description,
  showDescription = false,
  onToggleDescription,
  categoryName,
  categoryIcon,
  timeLabel,
  onActivate,
  actions,
  className,
}: {
  type: "income" | "expense";
  amountLabel: string;
  title?: string | null;
  description?: string | null;
  showDescription?: boolean;
  onToggleDescription?: () => void;
  categoryName?: string | null;
  categoryIcon?: string | null;
  timeLabel?: string;
  onActivate?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const side: "left" | "right" = type === "income" ? "left" : "right";
  const hasDescription = !!description;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (e.shiftKey && hasDescription) {
      e.preventDefault();
      onToggleDescription?.();
    } else if (!e.shiftKey && onActivate) {
      e.preventDefault();
      onActivate();
    }
  }

  return (
    <div
      className={cn(
        "group flex w-full max-w-md items-start gap-2.5 animate-rise",
        side === "right" && "ml-auto flex-row-reverse",
        className,
      )}
    >
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
      >
        {categoryIcon ?? "💸"}
      </div>
      <div
        role={onActivate ? "button" : undefined}
        tabIndex={onActivate ? 0 : undefined}
        onClick={onActivate}
        onKeyDown={onActivate || onToggleDescription ? handleKeyDown : undefined}
        className={cn(
          "min-w-0 flex-1 rounded-2xl border bg-card px-3.5 py-2.5 shadow-sm outline-none",
          side === "left" ? "rounded-tl-sm" : "rounded-tr-sm",
          onActivate &&
            "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
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

        {title ? <p className="mt-0.5 line-clamp-2 text-sm">{title}</p> : null}

        {hasDescription && showDescription ? (
          <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
            {description}
          </p>
        ) : null}

        {(timeLabel || actions || hasDescription) && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{timeLabel}</span>
            <div className="flex items-center gap-1">
              {hasDescription && onToggleDescription ? (
                <button
                  type="button"
                  aria-label={showDescription ? "Hide description" : "Show description"}
                  aria-expanded={showDescription}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDescription();
                  }}
                  className="inline-flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      showDescription && "rotate-180",
                    )}
                  />
                </button>
              ) : null}
              {actions}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
