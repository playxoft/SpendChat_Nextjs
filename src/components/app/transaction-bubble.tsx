import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function amountToneClass(type: "income" | "expense"): string {
  return type === "income"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}

/**
 * Amount label for a chat bubble. Expenses carry no sign — the neutral color
 * already reads as money out — while income keeps a leading "+" (with its
 * emerald tone). `amountMinor` is the stored positive value.
 */
export function bubbleAmountLabel(
  type: "income" | "expense",
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return type === "income"
    ? formatMoney(amountMinor, currency, locale, { signed: true })
    : formatMoney(amountMinor, currency, locale);
}

/**
 * A transaction rendered as a chat bubble. Income ("incoming") aligns left;
 * expense ("outgoing") aligns right, like sent vs. received messages.
 *
 * Layout: the title sits up top (with the amount), the description shows below
 * it as a subtitle, and the category + time anchor the bottom corners. The
 * bubble grows to fit the description — there is no expand/collapse toggle.
 */
export function TransactionBubble({
  type,
  amountLabel,
  title,
  description,
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
  categoryName?: string | null;
  categoryIcon?: string | null;
  timeLabel?: string;
  onActivate?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const side: "left" | "right" = type === "income" ? "left" : "right";
  const heading = title?.trim() || categoryName || "Transaction";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && onActivate) {
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
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex size-9 shrink-0 cursor-default items-center justify-center rounded-full bg-muted text-base">
            {categoryIcon ?? "💸"}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{categoryName ?? "Uncategorized"}</TooltipContent>
      </Tooltip>
      <div
        role={onActivate ? "button" : undefined}
        tabIndex={onActivate ? 0 : undefined}
        onClick={onActivate}
        onKeyDown={onActivate ? handleKeyDown : undefined}
        className={cn(
          "min-w-0 flex-1 rounded-2xl border bg-card px-3.5 py-2.5 shadow-sm outline-none",
          side === "left" ? "rounded-tl-sm" : "rounded-tr-sm",
          onActivate &&
            "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-sm font-medium break-words">{heading}</span>
          <span
            className={cn(
              "shrink-0 text-base font-semibold tabular-nums",
              amountToneClass(type),
            )}
          >
            {amountLabel}
          </span>
        </div>

        {description ? (
          <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">
            {description}
          </p>
        ) : null}

        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <span aria-hidden className="shrink-0">
              {categoryIcon ?? "🏷️"}
            </span>
            <span className="truncate">{categoryName ?? "Uncategorized"}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {timeLabel ? <span>{timeLabel}</span> : null}
            {actions}
          </span>
        </div>
      </div>
    </div>
  );
}
