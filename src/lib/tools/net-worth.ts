import { isSupportedCurrency } from "@/lib/currencies";
import { parseNumber } from "@/lib/tools/format";

/**
 * Net worth maths for `/tools/net-worth-calculator`: the grouped lists of what
 * you own and what you owe, their totals, and the dated snapshots a visitor can
 * keep in their own browser to see how the number moves.
 *
 * Net worth is a sum of amounts people typed, so it must add up exactly: every
 * amount is turned into integer minor units (cents, or the currency's own
 * precision) before it's added, and only converted back for display.
 */

export type Side = "asset" | "liability";

export type GroupId =
  | "cash"
  | "investments"
  | "retirement"
  | "property"
  | "vehicles"
  | "otherAssets"
  | "homeLoan"
  | "loans"
  | "cards"
  | "otherDebts";

export type Group = {
  id: GroupId;
  side: Side;
  /** Heading on the form. */
  label: string;
  /** Its key in the URL fragment — short and stable, it's in every shared link. */
  key: string;
  /** Example shown in an empty name field. */
  placeholder: string;
  /** The add button, after "Add ". */
  addLabel: string;
};

export const GROUPS: readonly Group[] = [
  { id: "cash", side: "asset", label: "Cash & bank", key: "ca", placeholder: "Savings account", addLabel: "account" },
  { id: "investments", side: "asset", label: "Investments", key: "iv", placeholder: "Index fund", addLabel: "investment" },
  { id: "retirement", side: "asset", label: "Retirement", key: "rt", placeholder: "Pension", addLabel: "retirement account" },
  { id: "property", side: "asset", label: "Property", key: "pr", placeholder: "Home", addLabel: "property" },
  { id: "vehicles", side: "asset", label: "Vehicles", key: "vh", placeholder: "Car", addLabel: "vehicle" },
  { id: "otherAssets", side: "asset", label: "Other assets", key: "oa", placeholder: "Gold", addLabel: "asset" },
  { id: "homeLoan", side: "liability", label: "Home loan", key: "hl", placeholder: "Mortgage", addLabel: "home loan" },
  { id: "loans", side: "liability", label: "Other loans", key: "ln", placeholder: "Car loan", addLabel: "loan" },
  { id: "cards", side: "liability", label: "Credit cards", key: "cc", placeholder: "Card balance", addLabel: "card" },
  { id: "otherDebts", side: "liability", label: "Other debts", key: "od", placeholder: "Money owed", addLabel: "debt" },
];

/** Most rows one group holds — and reads back from a link. */
export const MAX_ROWS = 10;
/** Longest name kept for a row. */
export const MAX_NAME = 40;
/**
 * Largest single amount. With `MAX_ROWS` per group, even every row at the cap
 * sums to under 2^53 cents, so the totals stay exact integers.
 */
export const MAX_AMOUNT = 1e12;
/** Most snapshots kept — two years of monthly check-ins. */
export const MAX_SNAPSHOTS = 24;

// ---------------------------------------------------------------------------
// A group's rows in one fragment parameter: `Savings account~12000|~3000`
// ---------------------------------------------------------------------------

/**
 * One row as typed. Both fields stay the raw text, so a half-typed "1,"
 * survives the round trip through the URL.
 */
export type Row = { name: string; amount: string };

const ROW_SEP = "|";
const FIELD_SEP = "~";
/** Longest amount text kept — a number, not a payload. */
const MAX_AMOUNT_TEXT = 20;

/**
 * Strip the two separators so typed text can't break the encoding. Nothing
 * else is touched — not even trailing spaces, or "Savings " would lose its
 * space before the next word is typed.
 */
function clean(value: string, max: number): string {
  return value.replace(/[|~]/g, "").slice(0, max);
}

export function encodeRows(rows: readonly Row[]): string {
  return rows
    .slice(0, MAX_ROWS)
    .map((r) => `${clean(r.name, MAX_NAME)}${FIELD_SEP}${clean(r.amount, MAX_AMOUNT_TEXT)}`)
    .join(ROW_SEP);
}

/**
 * Read a group back from a (possibly hand-edited) link: missing fields become
 * blanks, over-long ones are cut, anything past `MAX_ROWS` is dropped. Never
 * throws.
 */
export function decodeRows(param: string): Row[] {
  if (!param) return [];
  return param
    .split(ROW_SEP)
    .slice(0, MAX_ROWS)
    .map((chunk) => {
      const [name = "", amount = ""] = chunk.split(FIELD_SEP);
      return { name: clean(name, MAX_NAME), amount: clean(amount, MAX_AMOUNT_TEXT) };
    });
}

// ---------------------------------------------------------------------------
// Reading amounts and adding them up
// ---------------------------------------------------------------------------

export type AmountRead = { value: number | null; error: string | null };

/**
 * One typed amount. Blank is "not filled in yet" — no value and no error, so
 * the row is simply left out of the totals.
 */
export function readAmount(raw: string, locale: string): AmountRead {
  if (!raw.trim()) return { value: null, error: null };
  const n = parseNumber(raw, locale);
  if (n === null) return { value: null, error: "That doesn't look like a number." };
  if (n < 0) return { value: null, error: "Enter it without a minus sign." };
  if (n > MAX_AMOUNT) return { value: null, error: "That's more than this calculator can handle." };
  return { value: n, error: null };
}

/** An amount as integer minor units at `decimals` places. */
export function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals);
}

export type Entry = { group: GroupId; amount: number };

export type NetWorth = {
  assets: number;
  liabilities: number;
  /** Assets minus liabilities — negative when you owe more than you own. */
  netWorth: number;
  /** Subtotal of every group, zero for an empty one. */
  byGroup: Record<GroupId, number>;
  /** Liabilities as a percentage of assets; null when there are no assets to divide by. */
  debtToAsset: number | null;
};

const SIDE: Record<GroupId, Side> = Object.fromEntries(GROUPS.map((g) => [g.id, g.side])) as Record<GroupId, Side>;

/**
 * Totals for a list of amounts, added in integer minor units so that
 * 0.10 + 0.20 is 0.30 exactly, however many rows there are.
 */
export function netWorth(entries: readonly Entry[], decimals = 2): NetWorth {
  const minor = Object.fromEntries(GROUPS.map((g) => [g.id, 0])) as Record<GroupId, number>;
  for (const e of entries) minor[e.group] += toMinor(e.amount, decimals);

  let assets = 0;
  let liabilities = 0;
  for (const g of GROUPS) {
    if (g.side === "asset") assets += minor[g.id];
    else liabilities += minor[g.id];
  }

  const scale = 10 ** decimals;
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g.id, minor[g.id] / scale])) as Record<GroupId, number>;
  return {
    assets: assets / scale,
    liabilities: liabilities / scale,
    netWorth: (assets - liabilities) / scale,
    byGroup,
    debtToAsset: assets > 0 ? (liabilities / assets) * 100 : null,
  };
}

/** Which side a group is on. */
export function sideOf(group: GroupId): Side {
  return SIDE[group];
}

/**
 * The own-vs-owe bar. Its full width is whichever side is bigger:
 * - own more than you owe → assets, split into what's owed on them and what's yours;
 * - owe more than you own → debts, split into what your assets cover and the shortfall.
 * Null when both sides are zero. Percentages add up to 100.
 */
export type Split =
  | { whole: "assets"; owed: number; yours: number }
  | { whole: "liabilities"; covered: number; shortfall: number };

export function netWorthSplit(assets: number, liabilities: number): Split | null {
  if (assets <= 0 && liabilities <= 0) return null;
  if (assets >= liabilities) {
    const owed = (liabilities / assets) * 100;
    return { whole: "assets", owed, yours: 100 - owed };
  }
  const covered = (assets / liabilities) * 100;
  return { whole: "liabilities", covered, shortfall: 100 - covered };
}

// ---------------------------------------------------------------------------
// Snapshots — {date, totals, the form} kept in the visitor's own browser
// ---------------------------------------------------------------------------

export type Snapshot = {
  /** The visitor's local date, `YYYY-MM-DD`. One snapshot per day. */
  date: string;
  currency: string;
  assets: number;
  liabilities: number;
  /** Derived, never stored — so it can't disagree with the two totals. */
  netWorth: number;
  /** The form as it was (group key → encoded rows), so it can be loaded back. */
  inputs: Record<string, string>;
};

/** What goes into storage: short keys, no derived fields. */
type StoredSnapshot = { d: string; c: string; a: number; l: number; i: Record<string, string> };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `YYYY-MM-DD` form (no 30 February). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** The totals a snapshot may hold: finite, not negative, and within what the form can produce. */
const MAX_TOTAL = MAX_AMOUNT * MAX_ROWS * GROUPS.length;
function isTotal(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_TOTAL;
}

const GROUP_KEYS = new Set(GROUPS.map((g) => g.key));

/** Only known group keys, each re-encoded through `decodeRows` so it's capped like a link. */
function sanitizeInputs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (GROUP_KEYS.has(key) && typeof value === "string") out[key] = encodeRows(decodeRows(value));
  }
  return out;
}

function fromStored(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StoredSnapshot>;
  if (!isIsoDate(s.d) || typeof s.c !== "string" || !isSupportedCurrency(s.c)) return null;
  if (!isTotal(s.a) || !isTotal(s.l)) return null;
  return { date: s.d, currency: s.c, assets: s.a, liabilities: s.l, netWorth: s.a - s.l, inputs: sanitizeInputs(s.i) };
}

/** A snapshot in its storage form. */
export function toStored(s: Snapshot): StoredSnapshot {
  return { d: s.date, c: s.currency, a: s.assets, l: s.liabilities, i: s.inputs };
}

/**
 * Snapshots read back from storage (or anything else): invalid entries are
 * dropped, one per date (the last one wins), oldest first, at most
 * `MAX_SNAPSHOTS`. Never throws.
 */
export function sanitizeSnapshots(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, Snapshot>();
  for (const item of raw.slice(-MAX_SNAPSHOTS * 4)) {
    const s = fromStored(item);
    if (s) byDate.set(s.date, s);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS);
}

/** The list with `snap` added — replacing any snapshot from the same day — capped to the newest `MAX_SNAPSHOTS`. */
export function withSnapshot(list: readonly Snapshot[], snap: Snapshot): Snapshot[] {
  return [...list.filter((s) => s.date !== snap.date), snap]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS);
}

/**
 * What "since last time" compares against: the newest snapshot from before
 * today, in the same currency. Today's own snapshot is skipped, so saving
 * doesn't turn the change into zero.
 */
export function baselineSnapshot(list: readonly Snapshot[], today: string, currency: string): Snapshot | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.date < today && s.currency === currency) return s;
  }
  return null;
}

export type Change = {
  /** Current minus the snapshot, in money. */
  amount: number;
  /** The change as a percentage of the snapshot's size; null when that was zero. */
  percent: number | null;
};

/** How far net worth has moved from `from` to `to`. Percent is against |from|, so a debt shrinking reads as a rise. */
export function changeBetween(from: number, to: number): Change {
  const amount = to - from;
  return { amount, percent: from === 0 ? null : (amount / Math.abs(from)) * 100 };
}
