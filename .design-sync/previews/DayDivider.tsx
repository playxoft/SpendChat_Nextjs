import { DayDivider, TransactionBubble } from "spendchat";

export function Labels() {
  return (
    <div className="w-full max-w-md">
      <DayDivider label="Today" />
      <DayDivider label="Yesterday" />
      <DayDivider label="Wed, 14 Oct" />
    </div>
  );
}

export function InFeed() {
  return (
    <div className="flex w-full max-w-md flex-col">
      <DayDivider label="Yesterday" />
      <TransactionBubble
        type="expense"
        amountLabel="₹1,240.00"
        title="Weekly groceries"
        categoryName="Groceries"
        categoryIcon="🛒"
        timeLabel="18:34"
      />
      <DayDivider label="Today" />
      <TransactionBubble
        type="income"
        amountLabel="+₹85,000.00"
        title="October salary"
        categoryName="Salary"
        categoryIcon="💰"
        timeLabel="09:12"
      />
    </div>
  );
}
