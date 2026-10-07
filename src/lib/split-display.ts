/**
 * How Split words things for the person looking — pure, so the chat, the
 * groups list and their tests agree.
 */

/** Up to two initials for an avatar: "Asha Rao" → "AR", "ravi" → "R". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Where the viewer stands on one expense — the line under its title. */
export type MyPart =
  | { kind: "lent"; amountMinor: number }
  | { kind: "owe"; amountMinor: number }
  | { kind: "own" }
  | { kind: "none" };

/**
 * "You lent ₹X" when you paid and others share it; "You owe ₹Y" when someone
 * else paid and you're in it; "own" when you paid only for yourself; "none"
 * ("Not involved") otherwise.
 */
export function myPart(
  expense: { amountMinor: number; paidBy: { memberId: string }; myShare: { amountMinor: number } | null },
  myMemberId: string,
): MyPart {
  const mine = expense.myShare?.amountMinor ?? 0;
  if (expense.paidBy.memberId === myMemberId) {
    const lent = expense.amountMinor - mine;
    return lent > 0 ? { kind: "lent", amountMinor: lent } : { kind: "own" };
  }
  return mine > 0 ? { kind: "owe", amountMinor: mine } : { kind: "none" };
}

/** A balance as a status: "You're owed ₹X", "You owe ₹Y" or "Settled Up" (Title Case on purpose). */
export function balanceStatus(netMinor: number): "owed" | "owe" | "settled" {
  return netMinor > 0 ? "owed" : netMinor < 0 ? "owe" : "settled";
}

/** The status label for a settled balance — Title Case, as a chip. */
export const SETTLED_UP = "Settled Up";
