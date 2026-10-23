/**
 * Split maths — how an expense is divided, what everyone's balance is, and who
 * should pay whom to settle up. Pure and integer-only: every amount is in the
 * group currency's **minor units** (`amount_minor`), so a currency with no
 * decimals (JPY, KRW…) needs no special case — its minor unit is the yen, and
 * a leftover is a leftover yen. The browser runs the same functions for the
 * expense dialog's live preview that the server runs before it stores a share,
 * so what someone sees is exactly what gets saved.
 *
 * **Leftover units are assigned deterministically**, and never depend on how
 * a client listed people. One canonical order breaks every tie: the payer
 * first (when they're part of the split), then everyone else by member id
 * (uuidv7, so join order). With several payers, "the payer" is the main one —
 * whoever paid the most, ties by member id (`primaryPayer`).
 *
 * **Several people can pay** (`payerAmounts`): the total divides evenly
 * between them unless they say what each paid, which must then add up to it.
 * - **Equal:** ₹100 three ways is ₹33.34 + ₹33.33 + ₹33.33 — the leftover
 *   paisa go one each in canonical order, so the payer absorbs them first and
 *   nobody else is asked for more than an even share.
 * - **Percent:** each share is rounded down, and the leftover units go to the
 *   largest remainders (the share closest to rounding up) first, ties in
 *   canonical order — so the payer isn't necessarily the one who takes them.
 * - **Exact:** the amounts as entered; they must add up to the total.
 *
 * Errors carry a neutral message (it ends up in log lines) and the specifics —
 * sums, totals — as numbers in `details`, for the caller to phrase.
 */

/** A percent of the whole, in basis points: 100% = 10 000. */
export const BASIS_POINTS_TOTAL = 10_000;

/** A rule the input broke ("shares don't add up") — the caller turns it into a 422. */
export class SplitMathError extends Error {
  /** The specifics, as numbers: e.g. `{ sumMinor, totalMinor }` or `{ bpSum }`. */
  readonly details?: Record<string, number>;
  constructor(message: string, details?: Record<string, number>) {
    super(message);
    this.name = "SplitMathError";
    this.details = details;
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
 * part of this expense.
 */
export function computeShares(totalMinor: number, payerId: string, spec: ShareSpec): ShareAmount[] {
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
      throw new SplitMathError("The shares don't add up to the expense", {
        sumMinor: sum,
        totalMinor,
      });
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
    throw new SplitMathError("The percents don't add up to 100%", { bpSum });
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

/** Who paid for an expense: amounts for all of them, or for none (then it divides evenly). */
export type PayerInput = { memberId: string; amountMinor?: number };

/**
 * What each payer paid, by member id. Without amounts the total divides evenly
 * between them, leftover units one each by member id; with amounts they're
 * taken as given and must add up to the total. A payer at 0 paid nothing and
 * is left out.
 */
export function payerAmounts(totalMinor: number, payers: readonly PayerInput[]): ShareAmount[] {
  assertAmount(totalMinor, "The amount");
  if (totalMinor === 0) throw new SplitMathError("Amount must be greater than 0");
  if (payers.length === 0) throw new SplitMathError("Pick who paid");
  const ids = payers.map((p) => p.memberId);
  if (new Set(ids).size !== ids.length) throw new SplitMathError("Someone is in Paid by twice");
  const given = payers.filter((p) => p.amountMinor !== undefined).length;
  if (given === 0) {
    const order = [...ids].sort();
    const base = Math.floor(totalMinor / order.length);
    const leftover = totalMinor - base * order.length;
    return order
      .map((memberId, i) => ({ memberId, amountMinor: base + (i < leftover ? 1 : 0) }))
      .filter((p) => p.amountMinor > 0);
  }
  if (given !== payers.length) {
    throw new SplitMathError("Give an amount for everyone who paid, or for nobody");
  }
  for (const p of payers) assertAmount(p.amountMinor!, "Each amount paid");
  const sum = payers.reduce((acc, p) => acc + p.amountMinor!, 0);
  if (sum !== totalMinor) {
    throw new SplitMathError("The amounts paid don't add up to the expense", { paidSumMinor: sum, totalMinor });
  }
  return payers
    .filter((p) => p.amountMinor! > 0)
    .map((p) => ({ memberId: p.memberId, amountMinor: p.amountMinor! }))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
}

/** The main payer: whoever paid the most, ties by member id. */
export function primaryPayer(payers: readonly ShareAmount[]): string {
  const [first] = [...payers].sort(
    (a, b) => b.amountMinor - a.amountMinor || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
  );
  if (!first) throw new SplitMathError("Pick who paid");
  return first.memberId;
}

/** Per-member sums, as the four `GROUP BY` queries return them. Missing = 0. */
export type LedgerTotals = {
  /** What this member paid towards expenses. */
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
 * every render.
 *
 * **Not a group's settle-up plan.** Matching nets across a whole group sends
 * money between people who never shared a bill — you paid lunch for four,
 * Senthil paid dinner for four, and it has Muthumani pay you while Nantha,
 * who ate your lunch too, pays you nothing. People read that as wrong maths.
 * A group's plan is `pairwiseSettlements`; this matches the people inside one
 * expense (`expenseDebts`), and the free calculator's one-off trip.
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

/**
 * Who owes whom for one expense: each person's share less what they paid
 * towards it, matched inside the expense. With one payer that's simply every
 * other participant owing the payer their share; with several, the people
 * short are matched with the payers who covered them (`suggestSettlements`,
 * so it's the same on every render).
 */
export function expenseDebts(
  payers: readonly ShareAmount[],
  shares: readonly ShareAmount[],
): SettlementSuggestion[] {
  const net = new Map<string, number>();
  for (const p of payers) net.set(p.memberId, (net.get(p.memberId) ?? 0) + p.amountMinor);
  for (const s of shares) net.set(s.memberId, (net.get(s.memberId) ?? 0) - s.amountMinor);
  return suggestSettlements([...net].map(([memberId, netMinor]) => ({ memberId, netMinor })));
}

/**
 * A group's settle-up plan: who pays whom, person to person. Every debt comes
 * from an expense the two of them were both on (`expenseDebts`); what each
 * pair owes the other is netted — you owe Senthil ₹500 for dinner, he owes you
 * ₹250 for lunch, so you pay him ₹250 — and a payment between them counts
 * against it. Nobody is asked to pay someone they never shared a bill with.
 *
 * Each person's lines add up to their balance (`netBalances`), so the plan
 * and the balance chip always agree; it can take more payments than matching
 * nets across the group would. `debts` may repeat a pair (one entry per
 * expense, or per pre-summed batch); `payments` are recorded settlements. The
 * most first, then by member ids, so every member sees the same list.
 */
export function pairwiseSettlements(
  debts: Iterable<SettlementSuggestion>,
  payments: Iterable<SettlementSuggestion> = [],
): SettlementSuggestion[] {
  // One running total per pair, keyed lower id first: positive = the lower id owes.
  const pairs = new Map<string, { lo: string; hi: string; minor: number }>();
  const add = (from: string, to: string, minor: number) => {
    if (from === to || minor === 0) return;
    const [lo, hi, sign] = from < to ? [from, to, 1] : [to, from, -1];
    const key = `${lo}\u0000${hi}`;
    const pair = pairs.get(key) ?? { lo, hi, minor: 0 };
    pair.minor += sign * minor;
    pairs.set(key, pair);
  };
  for (const d of debts) add(d.fromMemberId, d.toMemberId, d.amountMinor);
  // Paying someone back counts against what you owe them.
  for (const p of payments) add(p.toMemberId, p.fromMemberId, p.amountMinor);

  const out: SettlementSuggestion[] = [];
  for (const { lo, hi, minor } of pairs.values()) {
    if (minor > 0) out.push({ fromMemberId: lo, toMemberId: hi, amountMinor: minor });
    else if (minor < 0) out.push({ fromMemberId: hi, toMemberId: lo, amountMinor: -minor });
  }
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort(
    (a, b) =>
      b.amountMinor - a.amountMinor || byId(a.fromMemberId, b.fromMemberId) || byId(a.toMemberId, b.toMemberId),
  );
}

/**
 * A `SplitMathError` in words for the person who made it — the specifics the
 * neutral message leaves out. `format` renders minor units in the group's
 * currency. For the expense dialog; never logged.
 */
export function describeSplitError(err: SplitMathError, format: (minor: number) => string): string {
  const d = err.details;
  if (d?.sumMinor !== undefined && d.totalMinor !== undefined) {
    return `Shares add up to ${format(d.sumMinor)}, but the expense is ${format(d.totalMinor)}`;
  }
  if (d?.paidSumMinor !== undefined && d.totalMinor !== undefined) {
    return `Amounts paid add up to ${format(d.paidSumMinor)}, but the expense is ${format(d.totalMinor)}`;
  }
  if (d?.bpSum !== undefined) return `Percents add up to ${fromBasisPoints(d.bpSum)}%, not 100%`;
  return err.message;
}

/**
 * A percent (in basis points) as an input string in the viewer's number
 * format — "33,33" for de-DE — with Latin digits, so it round-trips through
 * `parseAmountInput` exactly as `minorToInputString` does for amounts.
 */
export function percentToInputString(bp: number, locale = "en-US"): string {
  const value = fromBasisPoints(bp);
  try {
    return new Intl.NumberFormat(locale, {
      numberingSystem: "latn",
      useGrouping: false,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
}
