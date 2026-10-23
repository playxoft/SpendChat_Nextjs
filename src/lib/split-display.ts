import { integerDigitCount, stripNonAmountChars } from "./parse-amount";
import { expenseDebts } from "./split-math";
import { AMOUNT_INTEGER_DIGITS_MAX } from "./validation";

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

/** Someone on the other side of the viewer's part in one expense. */
export type Counterpart = { memberId: string; amountMinor: number };

/** Where the viewer stands on one expense — the line under its title. */
export type MyPart =
  | { kind: "lent"; amountMinor: number; people: Counterpart[] }
  | { kind: "owe"; amountMinor: number; people: Counterpart[] }
  | { kind: "own" }
  | { kind: "even" }
  | { kind: "none" };

/**
 * Where you stand on one expense, and with whom (`expenseDebts` — the same
 * matching the group's settle-up plan is built from): "lent" when people owe
 * you for it, "owe" when you owe someone, the most first; "own" when you paid
 * it all just for yourself; "even" when you paid exactly your share of a
 * shared one; "none" ("Not involved") otherwise.
 */
export function myPart(
  expense: {
    amountMinor: number;
    payers: readonly { memberId: string; amountMinor: number }[];
    shares: readonly { memberId: string; amountMinor: number }[];
  },
  myMemberId: string,
): MyPart {
  const debts = expenseDebts(expense.payers, expense.shares);
  const total = (people: Counterpart[]) => people.reduce((acc, p) => acc + p.amountMinor, 0);
  const lent = debts
    .filter((d) => d.toMemberId === myMemberId)
    .map((d) => ({ memberId: d.fromMemberId, amountMinor: d.amountMinor }));
  if (lent.length > 0) return { kind: "lent", amountMinor: total(lent), people: lent };
  const owe = debts
    .filter((d) => d.fromMemberId === myMemberId)
    .map((d) => ({ memberId: d.toMemberId, amountMinor: d.amountMinor }));
  if (owe.length > 0) return { kind: "owe", amountMinor: total(owe), people: owe };
  const paid = expense.payers.some((p) => p.memberId === myMemberId && p.amountMinor > 0);
  if (!paid) return { kind: "none" };
  const mine = expense.shares.find((s) => s.memberId === myMemberId)?.amountMinor ?? 0;
  return mine === expense.amountMinor ? { kind: "own" } : { kind: "even" };
}

/**
 * The words for `myPart`, naming the other side — "You owe Senthil ₹500",
 * "Asha and Ben owe you ₹600", "3 people owe you ₹750" — for the bubble's
 * spoken label and anywhere a plain string is needed.
 */
export function myPartText(part: MyPart, format: (minor: number) => string, nameOf: (memberId: string) => string): string {
  switch (part.kind) {
    case "lent": {
      const [a, b] = part.people;
      if (part.people.length === 1) return `${nameOf(a!.memberId)} owes you ${format(part.amountMinor)}`;
      if (part.people.length === 2) {
        return `${nameOf(a!.memberId)} and ${nameOf(b!.memberId)} owe you ${format(part.amountMinor)}`;
      }
      return `${part.people.length} people owe you ${format(part.amountMinor)}`;
    }
    case "owe": {
      const [a, b] = part.people;
      if (part.people.length === 1) return `You owe ${nameOf(a!.memberId)} ${format(part.amountMinor)}`;
      if (part.people.length === 2) {
        return `You owe ${nameOf(a!.memberId)} ${format(a!.amountMinor)} and ${nameOf(b!.memberId)} ${format(b!.amountMinor)}`;
      }
      return `You owe ${part.people.length} people ${format(part.amountMinor)}`;
    }
    case "own":
      return "Just you";
    case "even":
      return "You paid your share";
    default:
      return "Not involved";
  }
}

/**
 * Who paid, as one subject: "You", "Asha", "Asha and you", "Asha and Ben",
 * "You and 2 others". `payers` the most first, as the views list them.
 */
export function payersLabel(payers: readonly { name: string; isYou: boolean }[]): string {
  const you = payers.some((p) => p.isYou);
  const others = payers.filter((p) => !p.isYou).map((p) => p.name || "Someone");
  if (others.length === 0) return you ? "You" : "Someone";
  if (payers.length === 1) return others[0]!;
  if (payers.length === 2) return you ? `${others[0]} and you` : `${others[0]} and ${others[1]}`;
  return `${you ? "You" : others[0]} and ${payers.length - 1} others`;
}

/**
 * A balance as a status: owed, owe, or settled — and "open" at a zero balance
 * that still has payments to make or receive (owing one person what another
 * owes you), which isn't settled at all.
 */
export function balanceStatus(netMinor: number, openPayments = 0): "owed" | "owe" | "open" | "settled" {
  if (netMinor > 0) return "owed";
  if (netMinor < 0) return "owe";
  return openPayments > 0 ? "open" : "settled";
}

/** The status label for a settled balance — Title Case, as a chip. */
export const SETTLED_UP = "Settled Up";

/** How many lines of a settle-up plan are someone's to pay or receive. */
export function openPaymentsOf(
  plan: readonly { fromMemberId: string; toMemberId: string }[],
  memberId: string,
): number {
  return plan.filter((d) => d.fromMemberId === memberId || d.toMemberId === memberId).length;
}

/** "1 payment" / "3 payments" — to settle at a zero balance. */
function paymentsToSettle(n: number): string {
  return `${n} ${n === 1 ? "payment" : "payments"} to settle`;
}

/**
 * The balance chip's words — full ("You're owed ₹1,200") for its accessible
 * name and wide screens, short ("+₹1,200", "−₹300") where a phone has room for
 * little else. `amount` is the formatted absolute amount; `openPayments` the
 * viewer's lines in the settle-up plan, which a zero balance can still have.
 */
export function balanceChipText(
  netMinor: number,
  amount: string,
  openPayments = 0,
): { full: string; short: string } {
  const status = balanceStatus(netMinor, openPayments);
  if (status === "owed") return { full: `You're owed ${amount}`, short: `+${amount}` };
  if (status === "owe") return { full: `You owe ${amount}`, short: `−${amount}` };
  if (status === "open") return { full: `Even overall, ${paymentsToSettle(openPayments)}`, short: `${openPayments} to settle` };
  return { full: SETTLED_UP, short: SETTLED_UP };
}

/**
 * The composer's amount field on each keystroke: keep digits (in any script
 * the keypad types — Devanagari, Arabic-Indic, Bengali…) and the locale's
 * separators, and refuse the keystroke past 9 whole-number digits — the same
 * rules as the tracker's amount fields.
 */
export function acceptAmountInput(previous: string, typed: string, locale: string): string {
  const next = stripNonAmountChars(typed, locale);
  return integerDigitCount(next, locale) > AMOUNT_INTEGER_DIGITS_MAX ? previous : next;
}

/**
 * The calendar day an instant falls on in the viewer's timezone (YYYY-MM-DD) —
 * to tell whether a bubble's clock time belongs under its date divider.
 */
export function dayInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** What places an item in a split chat — the server's feed order. */
type FeedPlaced = { id: string; date: string; at: Date };

/** The feed's order: by date, then when it was added, then id (ascending). */
export function compareFeed(a: FeedPlaced, b: FeedPlaced): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const t = a.at.getTime() - b.at.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The keyset "Show earlier" asks from: the oldest item on screen. */
export function feedCursor(item: FeedPlaced): { day: string; at: string; id: string } {
  return { day: item.date, at: item.at.toISOString(), id: item.id };
}

/**
 * Lay a fresh page over what's already loaded. The page is the whole truth
 * from its oldest item up — the newest page has everything newer, and a page
 * re-read down from it has everything in between — so only what's strictly
 * older than it survives from before. An empty page means nothing is left.
 */
export function mergeFeed<T extends FeedPlaced>(previous: readonly T[], page: readonly T[]): T[] {
  const oldest = page[0];
  if (!oldest) return [];
  const onPage = new Set(page.map((i) => i.id));
  return [...previous.filter((i) => !onPage.has(i.id) && compareFeed(i, oldest) < 0), ...page];
}

/**
 * At a refresh, fold the page that was newest into what "Show earlier" loaded,
 * until the re-read behind the new newest page lands. An item the new page
 * pushed off is otherwise in neither list — and if that re-read fails, it
 * would stay gone, with "Show earlier" paging from below it.
 */
export function keepThroughRefresh<T extends FeedPlaced>(older: readonly T[], previousPage: readonly T[]): T[] {
  return previousPage.length > 0 ? mergeFeed(older, previousPage) : [...older];
}

/** One payment of a group's settle-up plan (`pairwiseSettlements`), as the server sends it. */
type Transfer = { fromMemberId: string; toMemberId: string; amountMinor: number };

/** The viewer's part in a payment: they pay it, they get it, or it's between others. */
export type TransferRole = "pay" | "receive" | "other";

export function transferRole(t: Transfer, viewerMemberId: string): TransferRole {
  return t.fromMemberId === viewerMemberId ? "pay" : t.toMemberId === viewerMemberId ? "receive" : "other";
}

/**
 * The settle-up plan as one viewer reads it: their own payments first, then
 * everyone else's, each part keeping the plan's order — which is the same for
 * every member, so two people comparing their screens see the same lines.
 */
export function transfersForViewer<T extends Transfer>(
  transfers: readonly T[],
  viewerMemberId: string,
): (T & { role: TransferRole })[] {
  const withRole = transfers.map((t) => ({ ...t, role: transferRole(t, viewerMemberId) }));
  return [...withRole.filter((t) => t.role !== "other"), ...withRole.filter((t) => t.role === "other")];
}

/** One side of the viewer's part in a settle-up plan: the people, in the plan's order, and the total. */
export type PlanSide = { memberIds: string[]; amountMinor: number };

/**
 * The viewer's part of a group's settle-up plan, summed per side — whom they
 * pay, who pays them — and how many payments are between other people: what
 * the bar above a group's chat says before it's opened.
 */
export function planSummary(
  transfers: readonly Transfer[],
  viewerMemberId: string,
): { pay: PlanSide; receive: PlanSide; others: number } {
  const pay: PlanSide = { memberIds: [], amountMinor: 0 };
  const receive: PlanSide = { memberIds: [], amountMinor: 0 };
  let others = 0;
  for (const t of transfers) {
    const role = transferRole(t, viewerMemberId);
    if (role === "pay") {
      pay.memberIds.push(t.toMemberId);
      pay.amountMinor += t.amountMinor;
    } else if (role === "receive") {
      receive.memberIds.push(t.fromMemberId);
      receive.amountMinor += t.amountMinor;
    } else {
      others += 1;
    }
  }
  return { pay, receive, others };
}

/** A side's people by name: "Ravi", "Ravi and Asha", "Ravi and 2 others". */
export function peopleNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * The plan summary in words, for the bar's accessible name: "You pay Ravi ₹500,
 * Asha and Ben pay you ₹300", "You're settled up, 2 payments between others",
 * "All settled up — nobody owes anyone". Commas where the bar shows dots, which
 * a screen reader would read out.
 */
export function planSummaryText(
  summary: ReturnType<typeof planSummary>,
  format: (minor: number) => string,
  nameOf: (memberId: string) => string,
): string {
  const { pay, receive, others } = summary;
  const parts: string[] = [];
  if (pay.memberIds.length > 0) {
    parts.push(`You pay ${peopleNames(pay.memberIds.map(nameOf))} ${format(pay.amountMinor)}`);
  }
  if (receive.memberIds.length > 0) {
    const verb = receive.memberIds.length === 1 ? "pays" : "pay";
    parts.push(`${peopleNames(receive.memberIds.map(nameOf))} ${verb} you ${format(receive.amountMinor)}`);
  }
  if (parts.length > 0) return parts.join(", ");
  if (others > 0) return `You're settled up, ${others} ${others === 1 ? "payment" : "payments"} between others`;
  return "All settled up — nobody owes anyone";
}

/**
 * A payment in words from the viewer's side, before the amount: "You pay
 * Ravi", "Asha pays you", "Ravi pays Asha".
 */
export function transferSentence(role: TransferRole, fromName: string, toName: string): string {
  if (role === "pay") return `You pay ${toName}`;
  if (role === "receive") return `${fromName} pays you`;
  return `${fromName} pays ${toName}`;
}
