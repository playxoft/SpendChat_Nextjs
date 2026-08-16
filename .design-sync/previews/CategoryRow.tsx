import { CategoryRow } from "spendchat";

const CATEGORIES = [
  { id: "1", name: "Groceries", icon: "🛒", kind: "expense" },
  { id: "2", name: "Housing", icon: "🏠", kind: "expense" },
  { id: "3", name: "Travel", icon: "✈️", kind: "expense" },
  { id: "4", name: "Eating out", icon: "🍽️", kind: "expense" },
  { id: "5", name: "Transport", icon: "🚌", kind: "expense" },
  { id: "6", name: "Salary", icon: "💰", kind: "income" },
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
