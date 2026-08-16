import { TransactionBubble } from "spendchat";

// The chat feed stacks bubbles in a column; income aligns left, expense right.
function Feed({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full max-w-md flex-col gap-3">{children}</div>;
}

export function ExpenseAndIncome() {
  return (
    <Feed>
      <TransactionBubble
        type="income"
        amountLabel="+₹85,000.00"
        title="October salary"
        categoryName="Salary"
        categoryIcon="💰"
        timeLabel="09:12"
      />
      <TransactionBubble
        type="expense"
        amountLabel="₹1,240.00"
        title="Weekly groceries"
        categoryName="Groceries"
        categoryIcon="🛒"
        timeLabel="18:34"
      />
      <TransactionBubble
        type="expense"
        amountLabel="₹32,000.00"
        title="Rent — November"
        categoryName="Housing"
        categoryIcon="🏠"
        timeLabel="21:05"
      />
    </Feed>
  );
}

export function WithDescription() {
  return (
    <Feed>
      <TransactionBubble
        type="expense"
        amountLabel="₹4,780.00"
        title="Flight to Bengaluru"
        description="IndiGo 6E-274, booked on the travel card. Reimbursable — receipt saved to the vault."
        categoryName="Travel"
        categoryIcon="✈️"
        timeLabel="07:41"
      />
    </Feed>
  );
}

export function SharedWorkspace() {
  return (
    <Feed>
      <TransactionBubble
        type="expense"
        amountLabel="₹680.00"
        title="Dinner — Copper Chimney"
        categoryName="Eating out"
        categoryIcon="🍽️"
        timeLabel="20:15"
        authorName="Priya"
        authorColorClass="text-violet-600 dark:text-violet-400"
      />
      <TransactionBubble
        type="income"
        amountLabel="+₹340.00"
        title="Split settled"
        categoryName="Transfers"
        categoryIcon="↔️"
        timeLabel="20:22"
        authorName="Arjun"
        authorColorClass="text-sky-600 dark:text-sky-400"
      />
    </Feed>
  );
}

export function Uncategorized() {
  return (
    <Feed>
      <TransactionBubble type="expense" amountLabel="₹99.00" timeLabel="11:58" />
    </Feed>
  );
}
