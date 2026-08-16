import { CategoryPieChart } from "spendchat";

const DATA = [
  { name: "Housing", value: 3_200_000, icon: "🏠" },
  { name: "Groceries", value: 618_000, icon: "🛒" },
  { name: "Travel", value: 478_000, icon: "✈️" },
  { name: "Eating out", value: 312_000, icon: "🍽️" },
  { name: "Transport", value: 96_000, icon: "🚌" },
];

// Values are integer minor units (paise), the app's storage format.
export function ByCategory() {
  return (
    <div className="w-full max-w-xl">
      <CategoryPieChart data={DATA} currency="INR" locale="en-IN" />
    </div>
  );
}

export function SingleCategory() {
  return (
    <div className="w-full max-w-xl">
      <CategoryPieChart data={DATA.slice(0, 1)} currency="INR" locale="en-IN" />
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="w-full max-w-xl">
      <CategoryPieChart data={[]} currency="INR" locale="en-IN" />
    </div>
  );
}
