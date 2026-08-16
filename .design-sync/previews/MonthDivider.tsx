import { MonthDivider, TransactionBubble } from "spendchat";

export function Labels() {
  return (
    <div className="w-full max-w-md">
      <MonthDivider label="October 2026" />
      <MonthDivider label="September 2026" />
    </div>
  );
}

export function InFeed() {
  return (
    <div className="flex w-full max-w-md flex-col">
      <MonthDivider label="October 2026" />
      <TransactionBubble
        type="expense"
        amountLabel="₹32,000.00"
        title="Rent — October"
        categoryName="Housing"
        categoryIcon="🏠"
        timeLabel="09:05"
      />
    </div>
  );
}
