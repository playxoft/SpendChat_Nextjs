import { utcMonthKey } from "@/lib/budgets";
import { validationError } from "@/lib/errors";
import { budgetMonthSchema } from "@/lib/validation";

/**
 * The month a budgets request is about: `?month=YYYY-MM`, or the current month
 * in UTC. A phone knows its own calendar month, so it should send it — around
 * midnight on the 1st, UTC and the person's month can differ.
 */
export function budgetMonthFrom(url: URL): string {
  const raw = url.searchParams.get("month");
  if (raw == null || raw === "") return utcMonthKey();
  const parsed = budgetMonthSchema.safeParse(raw);
  if (!parsed.success) throw validationError("Query param `month` must be YYYY-MM, between 1970 and 2999");
  return parsed.data;
}
