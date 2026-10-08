import { formatMoney } from "@/lib/money";
import { balanceChipText, balanceStatus, SETTLED_UP } from "@/lib/split-display";
import { cn } from "@/lib/utils";

/**
 * A balance in words: "you're owed ₹500" (emerald — the app's one accent for
 * money coming in), "owes ₹200", or "Settled Up" (a status, so Title Case).
 * `you` switches to the second person for the caller's own row.
 */
export function BalanceText({
  netMinor,
  currency,
  locale,
  you = false,
  className,
}: {
  netMinor: number;
  currency: string;
  locale: string;
  you?: boolean;
  className?: string;
}) {
  const status = balanceStatus(netMinor);
  if (status === "settled") {
    return <span className={cn("text-muted-foreground", className)}>{SETTLED_UP}</span>;
  }
  const amount = formatMoney(Math.abs(netMinor), currency, locale);
  if (status === "owed") {
    return (
      <span className={cn("text-emerald-600 dark:text-emerald-400", className)}>
        {you ? "you're owed" : "is owed"} {amount}
      </span>
    );
  }
  return (
    <span className={cn("text-foreground", className)}>
      {you ? "you owe" : "owes"} {amount}
    </span>
  );
}

/**
 * The caller's balance as a status chip — "You're owed ₹1,200", "You owe ₹300"
 * or "Settled Up" — for the chat header and the groups list. `compact` shows
 * the short form ("+₹1,200", "−₹300") below `sm`, where a phone's header row
 * has room for little else; the full words stay its accessible name. Long
 * amounts end in an ellipsis rather than a hard clip.
 */
export function BalanceChip({
  netMinor,
  currency,
  locale,
  compact = false,
  className,
}: {
  netMinor: number;
  currency: string;
  locale: string;
  compact?: boolean;
  className?: string;
}) {
  const status = balanceStatus(netMinor);
  const text = balanceChipText(netMinor, formatMoney(Math.abs(netMinor), currency, locale));
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 shrink items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        status === "owed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "owe" && "bg-muted text-foreground",
        status === "settled" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {compact ? (
        <>
          <span aria-hidden className="truncate sm:hidden">
            {text.short}
          </span>
          <span className="sr-only sm:not-sr-only sm:truncate">{text.full}</span>
        </>
      ) : (
        <span className="truncate">{text.full}</span>
      )}
    </span>
  );
}
