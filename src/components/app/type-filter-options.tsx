import { SelectItem } from "@/components/ui/select";

/**
 * The shared Income / Expense options for a transaction-type filter: income in
 * green with a leading "+", expense in red with a leading "−" (the same signed
 * convention `formatMoney` uses). The colour is pinned on `focus` too so it
 * survives the highlight state. Render inside a `<SelectContent>`.
 */
export function TypeFilterOptions() {
  return (
    <>
      <SelectItem value="all">All types</SelectItem>
      <SelectItem
        value="income"
        className="text-emerald-600 focus:text-emerald-600 dark:text-emerald-400 dark:focus:text-emerald-400"
      >
        + Income
      </SelectItem>
      <SelectItem
        value="expense"
        className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
      >
        − Expense
      </SelectItem>
    </>
  );
}
