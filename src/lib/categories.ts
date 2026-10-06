export type DefaultCategory = {
  name: string;
  kind: "income" | "expense";
  icon: string;
};

/**
 * Seeded into every new workspace: 7 expense + 3 income — the handful nearly
 * everyone uses, leaving room under the plan's category cap (Free 20, these
 * included) for the person's own. Existing workspaces keep whatever they have.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Expenses
  { name: "Food & Dining", kind: "expense", icon: "🍽️" },
  { name: "Groceries", kind: "expense", icon: "🛒" },
  { name: "Transport", kind: "expense", icon: "🚆" },
  { name: "Housing", kind: "expense", icon: "🏠" },
  { name: "Bills & Utilities", kind: "expense", icon: "💡" },
  { name: "Shopping", kind: "expense", icon: "🛍️" },
  { name: "Health", kind: "expense", icon: "⚕️" },
  // Income
  { name: "Salary", kind: "income", icon: "💼" },
  { name: "Freelance", kind: "income", icon: "🧾" },
  { name: "Investments", kind: "income", icon: "📈" },
];

export type DefaultTag = { name: string; color: string };

/**
 * Seeded into every new workspace: two tags that cut across categories and
 * that people reach for in the first week — what repeats every month, and what
 * someone else owes back. Leaves room under the plan's tag cap (Free 5).
 */
export const DEFAULT_TAGS: DefaultTag[] = [
  { name: "Recurring", color: "#3b82f6" },
  { name: "Reimbursable", color: "#f59e0b" },
];
