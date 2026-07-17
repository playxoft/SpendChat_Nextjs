/** A month total in integer minor units. `balance = income - expense`. */
export type Totals = { income: number; expense: number; balance: number };

/** The minimum a pending transaction needs to contribute to an optimistic total. */
export type PendingContribution = {
  status: "sending" | "sent" | "failed";
  type: "income" | "expense";
  /** Stored positive amount in minor units. */
  amountMinor: number;
  /** Target profile, or null when the entry isn't tied to a profile. */
  profileId: string | null;
  /** YYYY-MM-DD — the calendar date the transaction is dated. */
  occurredOn: string;
  /** Saved id once the server has it; absent while still in flight. */
  realId?: string;
};

/**
 * Fold in-flight transactions into a server-computed month total, so the
 * tracker balance moves the instant a message is sent instead of waiting for
 * the RSC to revalidate.
 *
 * A contribution is counted until its saved id turns up in `serverTxnIds` — at
 * that point the server total already includes it, so counting it too would
 * double it. It's ignored when it failed to save, falls outside the month
 * window, or belongs to a different profile than the one in view (`profileId`
 * null = "All profiles", which counts everything). This mirrors how the chat
 * feed retires a ghost bubble once its real row appears.
 */
export function optimisticTotals(
  base: { income: number; expense: number },
  pending: readonly PendingContribution[],
  opts: {
    serverTxnIds: Iterable<string>;
    profileId: string | null;
    monthStart: string;
    monthEnd: string;
  },
): Totals {
  const serverSet =
    opts.serverTxnIds instanceof Set ? opts.serverTxnIds : new Set(opts.serverTxnIds);
  let income = base.income;
  let expense = base.expense;
  for (const m of pending) {
    if (m.status === "failed") continue; // not saved — don't count it
    if (opts.profileId !== null && m.profileId !== opts.profileId) continue;
    if (m.occurredOn < opts.monthStart || m.occurredOn > opts.monthEnd) continue;
    if (m.realId && serverSet.has(m.realId)) continue; // already in the server total
    if (m.type === "income") income += m.amountMinor;
    else expense += m.amountMinor;
  }
  return { income, expense, balance: income - expense };
}
