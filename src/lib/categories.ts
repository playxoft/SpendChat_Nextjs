export type DefaultCategory = {
  name: string;
  kind: "income" | "expense";
  icon: string;
};

/** Seeded for every new user on first sign-in. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Expenses
  { name: "Food & Dining", kind: "expense", icon: "🍽️" },
  { name: "Groceries", kind: "expense", icon: "🛒" },
  { name: "Transport", kind: "expense", icon: "🚆" },
  { name: "Housing", kind: "expense", icon: "🏠" },
  { name: "Utilities", kind: "expense", icon: "💡" },
  { name: "Shopping", kind: "expense", icon: "🛍️" },
  { name: "Health", kind: "expense", icon: "⚕️" },
  { name: "Entertainment", kind: "expense", icon: "🎬" },
  { name: "Education", kind: "expense", icon: "📚" },
  { name: "Other", kind: "expense", icon: "📦" },
  // Income
  { name: "Salary", kind: "income", icon: "💼" },
  { name: "Freelance", kind: "income", icon: "🧾" },
  { name: "Investments", kind: "income", icon: "📈" },
  { name: "Gifts", kind: "income", icon: "🎁" },
  { name: "Other", kind: "income", icon: "➕" },
];
