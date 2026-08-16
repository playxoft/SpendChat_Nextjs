import { TransactionFilters } from "spendchat";

const CATEGORIES = [
  { id: "c1", name: "Groceries", icon: "🛒", kind: "expense" as const },
  { id: "c2", name: "Housing", icon: "🏠", kind: "expense" as const },
  { id: "c3", name: "Travel", icon: "✈️", kind: "expense" as const },
  { id: "c4", name: "Salary", icon: "💰", kind: "income" as const },
];

// Filter state lives in the URL, so this reads its values from the router.
export function Toolbar() {
  return (
    <div className="w-full max-w-3xl">
      <TransactionFilters categories={CATEGORIES} today="2026-10-16" locale="en-IN" />
    </div>
  );
}
