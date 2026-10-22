import { formatMoney } from "@/lib/money";
import { balanceChipText, balanceStatus, SETTLED_UP } from "@/lib/split-display";
import { cn } from "@/lib/utils";

/**
 * A balance in words: "you're owed ₹500" (emerald — the app's one accent for
 * money coming in), "owes ₹200", "even overall · 2 to settle" (a zero balance
 * with payments still to make or receive), or "Settled Up" (a status, so
 * Title Case). `you` switches to the second person for the caller's own row;
 * `openPayments` is that person's lines in the settle-up plan.
 */
export function BalanceText({
  netMinor,
  currency,
  locale,
  you = false,
  openPayments = 0,
  className,
}: {
  netMinor: number;
  currency: string;
  locale: string;
  you?: boolean;
  openPayments?: number;
  className?: string;
}) {
  const status = balanceStatus(netMinor, openPayments);
  if (status === "settled") {
    return <span className={cn("text-muted-foreground", className)}>{SETTLED_UP}</span>;
  }
  if (status === "open") {
    return <span className={cn("text-foreground", className)}>even overall · {openPayments} to settle</span>;
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
 * The caller's balance as a status chip — "You're owed ₹1,200", "You owe ₹300",
 * "Even overall, 2 payments to settle" or "Settled Up" — for the chat header
 * and the groups list. `compact` shows
 * the short form ("+₹1,200", "−₹300") below `sm`, where a phone's header row
 * has room for little else; the full words stay its accessible name. Long
 * amounts end in an ellipsis rather than a hard clip.
 */
export function BalanceChip({
  netMinor,
  currency,
  locale,
  openPayments = 0,
  compact = false,
  className,
}: {
  netMinor: number;
  currency: string;
  locale: string;
  /** The viewer's lines in the settle-up plan — a zero balance can still have some. */
  openPayments?: number;
  compact?: boolean;
  className?: string;
}) {
  const status = balanceStatus(netMinor, openPayments);
  const text = balanceChipText(netMinor, formatMoney(Math.abs(netMinor), currency, locale), openPayments);
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 shrink items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        status === "owed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        (status === "owe" || status === "open") && "bg-muted text-foreground",
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
