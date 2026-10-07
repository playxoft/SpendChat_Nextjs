import { integerDigitCount, stripNonAmountChars } from "./parse-amount";
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

/** Where the viewer stands on one expense — the line under its title. */
export type MyPart =
  | { kind: "lent"; amountMinor: number }
  | { kind: "owe"; amountMinor: number }
  | { kind: "own" }
  | { kind: "even" }
  | { kind: "none" };

/**
 * Where you stand: what you paid towards it less your share. "You lent ₹X"
 * when you paid more than your share; "You owe ₹Y" when you paid less (or
 * nothing) and you're in it; "own" when you paid it all just for yourself;
 * "even" when you paid exactly your share of a shared one; "none" ("Not
 * involved") otherwise.
 */
export function myPart(
  expense: {
    amountMinor: number;
    payers: readonly { memberId: string; amountMinor: number }[];
    myShare: { amountMinor: number } | null;
  },
  myMemberId: string,
): MyPart {
  const mine = expense.myShare?.amountMinor ?? 0;
  const paid = expense.payers.reduce((acc, p) => acc + (p.memberId === myMemberId ? p.amountMinor : 0), 0);
  const net = paid - mine;
  if (net > 0) return { kind: "lent", amountMinor: net };
  if (net < 0) return { kind: "owe", amountMinor: -net };
  if (paid > 0) return mine === expense.amountMinor ? { kind: "own" } : { kind: "even" };
  return { kind: "none" };
}

/** The words for `myPart` — the bubble's line, and its spoken label. */
export function myPartText(part: MyPart, format: (minor: number) => string): string {
  switch (part.kind) {
    case "lent":
      return `You lent ${format(part.amountMinor)}`;
    case "owe":
      return `You owe ${format(part.amountMinor)}`;
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

/** A balance as a status: "You're owed ₹X", "You owe ₹Y" or "Settled Up" (Title Case on purpose). */
export function balanceStatus(netMinor: number): "owed" | "owe" | "settled" {
  return netMinor > 0 ? "owed" : netMinor < 0 ? "owe" : "settled";
}

/** The status label for a settled balance — Title Case, as a chip. */
export const SETTLED_UP = "Settled Up";

/**
 * The balance chip's words — full ("You're owed ₹1,200") for its accessible
 * name and wide screens, short ("+₹1,200", "−₹300") where a phone has room for
 * little else. `amount` is the formatted absolute amount.
 */
export function balanceChipText(netMinor: number, amount: string): { full: string; short: string } {
  const status = balanceStatus(netMinor);
  if (status === "owed") return { full: `You're owed ${amount}`, short: `+${amount}` };
  if (status === "owe") return { full: `You owe ${amount}`, short: `−${amount}` };
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
