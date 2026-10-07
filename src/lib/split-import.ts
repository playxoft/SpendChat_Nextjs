/**
 * The hand-off from the free split calculator (`/tools/split-bill-calculator`)
 * to the app's Split (`/app/split/import`): the shape a browser draft is sent
 * in, and the one step the server takes before its own rules run — swapping
 * the draft's short person keys for the member ids they became.
 *
 * Pure and client-safe (no zod, no DB): the tool's page builds this shape in
 * the browser, `lib/validation.ts#splitImportSchema` checks it, and
 * `services/split-import.ts` creates the group from it. Everything an expense
 * carries besides its people (title, amount, date, percents) is checked by the
 * app's own `splitExpenseSchema` *after* the swap, so an imported expense is
 * held to exactly the rules of one typed into the app.
 */

import { withNext } from "@/lib/next-path";

/** Where the app reads a draft back after sign-up. */
export const SPLIT_IMPORT_PATH = "/app/split/import";
/** Sign-up and sign-in, coming back to the import page afterwards. */
export const SPLIT_SIGN_UP_HREF = withNext("/sign-up", SPLIT_IMPORT_PATH);
export const SPLIT_SIGN_IN_HREF = withNext("/sign-in", SPLIT_IMPORT_PATH);

/** Expenses one import may carry — what the tool lets a draft hold. */
export const SPLIT_IMPORT_EXPENSES_MAX = 200;

/**
 * A person's key inside a draft: the tool's own short id (`p0001`), never a
 * database id. Lowercase letters and digits, so it can't smuggle anything.
 */
export const SPLIT_DRAFT_REF_PATTERN = /^[a-z0-9]{1,16}$/;

type ImportExpenseBase = {
  title: string;
  /** Major units of the group currency, as the app's expense form sends it. */
  amount: number;
  /** A draft person key on the way in; a member id after `mapImportExpense`. */
  paidBy: string;
  occurredOn: string;
};

/** One expense, shaped like the app's `SplitExpenseInput` but naming people by draft key. */
export type SplitImportExpense =
  | (ImportExpenseBase & { splitType: "equal"; memberIds: string[] })
  | (ImportExpenseBase & { splitType: "exact"; shares: { memberId: string; amount: number }[] })
  | (ImportExpenseBase & { splitType: "percent"; shares: { memberId: string; percent: number }[] });

export type SplitImportInput = {
  name: string;
  icon?: string | null;
  currency: string;
  /** The person in the draft who is the signed-in caller — the group's creator. */
  me: { ref: string; name: string };
  /** Everyone else, in draft order, each with the email the app needs to invite them. */
  people: { ref: string; name: string; email: string }[];
  expenses: SplitImportExpense[];
};

/**
 * The expense with every draft key replaced by the member id `idOf` gives it,
 * or `null` when one of them isn't someone in the import — the caller refuses
 * the whole import rather than guess.
 */
export function mapImportExpense(
  expense: SplitImportExpense,
  idOf: (ref: string) => string | undefined,
): SplitImportExpense | null {
  const paidBy = idOf(expense.paidBy);
  if (!paidBy) return null;
  if (expense.splitType === "equal") {
    const memberIds = expense.memberIds.map(idOf);
    if (memberIds.some((id) => !id)) return null;
    return { ...expense, paidBy, memberIds: memberIds as string[] };
  }
  if (expense.splitType === "exact") {
    const shares = expense.shares.map((s) => ({ ...s, memberId: idOf(s.memberId) }));
    if (shares.some((s) => !s.memberId)) return null;
    return { ...expense, paidBy, shares: shares as { memberId: string; amount: number }[] };
  }
  const shares = expense.shares.map((s) => ({ ...s, memberId: idOf(s.memberId) }));
  if (shares.some((s) => !s.memberId)) return null;
  return { ...expense, paidBy, shares: shares as { memberId: string; percent: number }[] };
}
