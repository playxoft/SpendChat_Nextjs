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
 * window, or belongs to a profile that isn't in view (`profileIds` — or the
 * single `profileId` — null = "All profiles", which counts everything). This
 * mirrors how the chat feed retires a ghost bubble once its real row appears.
 */
export function optimisticTotals(
  base: { income: number; expense: number },
  pending: readonly PendingContribution[],
  opts: {
    serverTxnIds: Iterable<string>;
    /** The one profile in view; null = "All profiles". Ignored when `profileIds` is given. */
    profileId?: string | null;
    /** The profiles in view (the sidebar's selection); null = "All profiles". */
    profileIds?: readonly string[] | null;
    monthStart: string;
    monthEnd: string;
  },
): Totals {
  const serverSet =
    opts.serverTxnIds instanceof Set ? opts.serverTxnIds : new Set(opts.serverTxnIds);
  const inView = profileInView(
    opts.profileIds !== undefined
      ? opts.profileIds
      : opts.profileId != null
        ? [opts.profileId]
        : null,
  );
  let income = base.income;
  let expense = base.expense;
  for (const m of pending) {
    if (m.status === "failed") continue; // not saved — don't count it
    if (!inView(m.profileId)) continue;
    if (m.occurredOn < opts.monthStart || m.occurredOn > opts.monthEnd) continue;
    if (m.realId && serverSet.has(m.realId)) continue; // already in the server total
    if (m.type === "income") income += m.amountMinor;
    else expense += m.amountMinor;
  }
  return { income, expense, balance: income - expense };
}

/**
 * "Is a row of this profile in view?" for the profiles a view shows — null for
 * "All profiles", where everything is. The tracker's ghost bubbles, its
 * optimistic balance and its bulk edits all ask it, so a pending transaction
 * shows in exactly the views its saved row will.
 */
export function profileInView(
  profileIds: readonly string[] | null,
): (profileId: string | null) => boolean {
  if (profileIds === null) return () => true;
  const set = new Set(profileIds);
  return (profileId) => profileId !== null && set.has(profileId);
}
