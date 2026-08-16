import { CategoryRow } from "spendchat";

// `kind` needs `as const`: the prop is Pick<Category, … | "kind">, and
// categories.kind is the txn-type enum ("income" | "expense"). Without it the
// literal widens to string and the array no longer satisfies the prop.
const CATEGORIES = [
  { id: "1", name: "Groceries", icon: "🛒", kind: "expense" as const },
  { id: "2", name: "Housing", icon: "🏠", kind: "expense" as const },
  { id: "3", name: "Travel", icon: "✈️", kind: "expense" as const },
  { id: "4", name: "Eating out", icon: "🍽️", kind: "expense" as const },
  { id: "5", name: "Transport", icon: "🚌", kind: "expense" as const },
  { id: "6", name: "Salary", icon: "💰", kind: "income" as const },
];

export function Selected() {
  return (
    <div className="w-full max-w-md">
      <CategoryRow categories={CATEGORIES} value="1" onChange={() => {}} onEdit={() => {}} />
    </div>
  );
}

export function NoSelection() {
  return (
    <div className="w-full max-w-md">
      <CategoryRow categories={CATEGORIES} value={null} onChange={() => {}} />
    </div>
  );
}

export function Compact() {
  return (
    <div className="w-full max-w-md">
      <CategoryRow categories={CATEGORIES} value="3" onChange={() => {}} compact />
    </div>
  );
}
