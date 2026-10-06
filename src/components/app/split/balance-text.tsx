import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A balance in words: "you're owed ₹500" (emerald — the app's one accent for
 * money coming in), "owes ₹200", or "settled up". `you` switches to the second
 * person for the caller's own row.
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
  if (netMinor === 0) {
    return <span className={cn("text-muted-foreground", className)}>settled up</span>;
  }
  const amount = formatMoney(Math.abs(netMinor), currency, locale);
  if (netMinor > 0) {
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
