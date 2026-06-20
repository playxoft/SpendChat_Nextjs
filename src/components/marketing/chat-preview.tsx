import { ArrowUp } from "lucide-react";
import { DayDivider } from "@/components/app/day-divider";
import { TransactionBubble } from "@/components/app/transaction-bubble";

/** Static, non-interactive mock of the tracker, used on marketing pages. */
export function ChatPreview() {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Balance this month</p>
          <p className="text-lg font-semibold tabular-nums">$1,847.50</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          June
        </span>
      </div>

      <div className="space-y-2 px-4 py-4">
        <DayDivider label="Today" />
        <TransactionBubble
          type="income"
          amountLabel="+$2,000.00"
          categoryName="Salary"
          categoryIcon="💼"
          title="June salary"
          timeLabel="9:02 AM"
        />
        <TransactionBubble
          type="expense"
          amountLabel="−$12.50"
          categoryName="Food & Dining"
          categoryIcon="🍽️"
          title="Lunch with the team"
          timeLabel="1:14 PM"
        />
        <TransactionBubble
          type="expense"
          amountLabel="−$40.00"
          categoryName="Groceries"
          categoryIcon="🛒"
          timeLabel="6:30 PM"
        />
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <div className="flex-1 rounded-full border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Add a transaction…
        </div>
        <div className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
          <ArrowUp className="size-4" />
        </div>
      </div>
    </div>
  );
}
