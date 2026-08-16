import { TransactionsTableSkeleton } from "spendchat";

export function Loading() {
  return (
    <div className="w-full max-w-2xl">
      <TransactionsTableSkeleton />
    </div>
  );
}
