import { formatMoney } from "@/lib/money";
import { balanceStatus, SETTLED_UP } from "@/lib/split-display";
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
 * or "Settled Up" — for the chat header and the groups list.
 */
export function BalanceChip({
  netMinor,
  currency,
  locale,
  className,
}: {
  netMinor: number;
  currency: string;
  locale: string;
  className?: string;
}) {
  const status = balanceStatus(netMinor);
  const amount = formatMoney(Math.abs(netMinor), currency, locale);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums",
        status === "owed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "owe" && "bg-muted text-foreground",
        status === "settled" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status === "owed" ? `You're owed ${amount}` : status === "owe" ? `You owe ${amount}` : SETTLED_UP}
    </span>
  );
}
