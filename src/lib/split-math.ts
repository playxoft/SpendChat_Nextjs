/**
 * Split maths — how an expense is divided, what everyone's balance is, and who
 * should pay whom to settle up. Pure and integer-only: every amount is in the
 * group currency's **minor units** (`amount_minor`), so a currency with no
 * decimals (JPY, KRW…) needs no special case — its minor unit is the yen, and
 * a leftover is a leftover yen. The browser runs the same functions for the
 * expense dialog's live preview that the server runs before it stores a share,
 * so what someone sees is exactly what gets saved.
 *
 * **Leftover units are assigned deterministically.** ₹100 split three ways is
 * ₹33.33 + ₹33.33 + ₹33.34; *who* gets the extra paisa is decided by one
 * canonical order: the payer first (when they're part of the split), then
 * everyone else by member id. Member ids are uuidv7, so that's join order. The
 * payer absorbing the rounding means nobody else is ever asked for more than
 * their share, and the order never depends on how a client listed people.
 */

/** A percent of the whole, in basis points: 100% = 10 000. */
export const BASIS_POINTS_TOTAL = 10_000;

/** A rule the input broke ("shares don't add up") — the caller turns it into a 422. */
export class SplitMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitMathError";
  }
}

export type ShareAmount = { memberId: string; amountMinor: number };

/** How to divide an expense — the inputs, never the resulting shares. */
export type ShareSpec =
  | { type: "equal"; memberIds: string[] }
  | { type: "exact"; shares: { memberId: string; amountMinor: number }[] }
  | { type: "percent"; shares: { memberId: string; bp: number }[] };

/** A typed percent (≤ 2 decimals) as basis points: 12.5 → 1250. */
export function toBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/** Basis points back to a percent for display: 1250 → 12.5. */
export function fromBasisPoints(bp: number): number {
  return bp / 100;
}

/**
 * The order every tie is broken in: the payer first when they're in the list,
 * then the rest by id. Input order never matters.
 */
export function canonicalOrder(memberIds: readonly string[], payerId: string | null): string[] {
  const rest = memberIds.filter((id) => id !== payerId).sort();
  return payerId !== null && memberIds.includes(payerId) ? [payerId, ...rest] : rest;
}

function assertDistinct(memberIds: readonly string[]): void {
  if (memberIds.length === 0) throw new SplitMathError("Pick who it's split between");
  if (new Set(memberIds).size !== memberIds.length) {
    throw new SplitMathError("Someone is in the split twice");
  }
}

function assertAmount(minor: number, what: string): void {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new SplitMathError(`${what} must be a whole number of minor units`);
  }
}

/**
 * Divide `totalMinor`, paid by `payerId`, according to `spec`. Returns one
 * share per participant in canonical order, summing to exactly `totalMinor`.
 * People with a zero exact amount or zero percent are left out — they aren't
 * part of this expense. `format` renders amounts in error messages.
 */
export function computeShares(
  totalMinor: number,
  payerId: string,
  spec: ShareSpec,
  format: (minor: number) => string = String,
): ShareAmount[] {
  assertAmount(totalMinor, "The amount");
  if (totalMinor === 0) throw new SplitMathError("Amount must be greater than 0");

  if (spec.type === "equal") {
    assertDistinct(spec.memberIds);
    const order = canonicalOrder(spec.memberIds, payerId);
    const base = Math.floor(totalMinor / order.length);
    const leftover = totalMinor - base * order.length;
    return order.map((memberId, i) => ({ memberId, amountMinor: base + (i < leftover ? 1 : 0) }));
  }

  if (spec.type === "exact") {
    assertDistinct(spec.shares.map((s) => s.memberId));
    for (const s of spec.shares) assertAmount(s.amountMinor, "Each share");
    const sum = spec.shares.reduce((acc, s) => acc + s.amountMinor, 0);
    if (sum !== totalMinor) {
      throw new SplitMathError(
        `Shares add up to ${format(sum)}, but the expense is ${format(totalMinor)}`,
      );
    }
    const byId = new Map(spec.shares.map((s) => [s.memberId, s.amountMinor]));
    return canonicalOrder([...byId.keys()], payerId)
      .map((memberId) => ({ memberId, amountMinor: byId.get(memberId)! }))
      .filter((s) => s.amountMinor > 0);
  }

  assertDistinct(spec.shares.map((s) => s.memberId));
  for (const s of spec.shares) {
    if (!Number.isInteger(s.bp) || s.bp < 0 || s.bp > BASIS_POINTS_TOTAL) {
      throw new SplitMathError("Each percent must be between 0 and 100");
    }
  }
  const bpSum = spec.shares.reduce((acc, s) => acc + s.bp, 0);
  if (bpSum !== BASIS_POINTS_TOTAL) {
    throw new SplitMathError(`Percents add up to ${fromBasisPoints(bpSum)}%, not 100%`);
  }
  // BigInt: a 3-decimal currency's total can reach ~1e12 minor units, and
  // × 10 000 is past Number's 2^53 — where integer maths silently stops being exact.
  const total = BigInt(totalMinor);
  const bpById = new Map(spec.shares.filter((s) => s.bp > 0).map((s) => [s.memberId, s.bp]));
  const order = canonicalOrder([...bpById.keys()], payerId);
  const parts = order.map((memberId, rank) => {
    const scaled = total * BigInt(bpById.get(memberId)!);
    return {
      memberId,
      rank,
      floor: Number(scaled / BigInt(BASIS_POINTS_TOTAL)),
      remainder: Number(scaled % BigInt(BASIS_POINTS_TOTAL)),
    };
  });
  let leftover = totalMinor - parts.reduce((acc, p) => acc + p.floor, 0);
  // Largest remainder first; ties in canonical order.
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.rank - b.rank);
  const extra = new Set<string>();
  for (const p of byRemainder) {
    if (leftover === 0) break;
    extra.add(p.memberId);
    leftover -= 1;
  }
  return parts.map((p) => ({ memberId: p.memberId, amountMinor: p.floor + (extra.has(p.memberId) ? 1 : 0) }));
}

/** Per-member sums, as the four `GROUP BY` queries return them. Missing = 0. */
export type LedgerTotals = {
  /** Expenses this member paid for. */
  paid: Readonly<Record<string, number>>;
  /** This member's shares of expenses. */
  owed: Readonly<Record<string, number>>;
  /** Settlements this member paid to someone. */
  sent: Readonly<Record<string, number>>;
  /** Settlements this member received. */
  received: Readonly<Record<string, number>>;
};

export type MemberBalance = { memberId: string; netMinor: number };

/**
 * Everyone's net position: positive = is owed money, negative = owes. Paying
 * for an expense and paying someone back both move you up; your share of an
 * expense and money you received move you down. The nets of a group always sum
 * to zero.
 */
export function netBalances(memberIds: readonly string[], totals: LedgerTotals): MemberBalance[] {
  return memberIds.map((memberId) => ({
    memberId,
    netMinor:
      (totals.paid[memberId] ?? 0) -
      (totals.owed[memberId] ?? 0) +
      (totals.sent[memberId] ?? 0) -
      (totals.received[memberId] ?? 0),
  }));
}

export type SettlementSuggestion = { fromMemberId: string; toMemberId: string; amountMinor: number };

/**
 * Who should pay whom to bring every balance to zero: the largest debt is
 * matched with the largest credit, then the next, so a group of n people needs
 * at most n − 1 payments. Ties go by member id, so the list is the same on
 * every render. "Mark as paid" records one of these as a settlement.
 */
export function suggestSettlements(balances: readonly MemberBalance[]): SettlementSuggestion[] {
  const byAmount = (a: { left: number; id: string }, b: { left: number; id: string }) =>
    b.left - a.left || (a.id < b.id ? -1 : 1); // ids are distinct
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ id: b.memberId, left: -b.netMinor }))
    .sort(byAmount);
  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ id: b.memberId, left: b.netMinor }))
    .sort(byAmount);

  const out: SettlementSuggestion[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!;
    const creditor = creditors[c]!;
    const amountMinor = Math.min(debtor.left, creditor.left);
    out.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amountMinor });
    debtor.left -= amountMinor;
    creditor.left -= amountMinor;
    if (debtor.left === 0) d += 1;
    if (creditor.left === 0) c += 1;
  }
  return out;
}
