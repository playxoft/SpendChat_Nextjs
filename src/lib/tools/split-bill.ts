import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { fromMinorUnits } from "@/lib/money";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import {
  BASIS_POINTS_TOTAL,
  computeShares,
  fromBasisPoints,
  netBalances,
  SplitMathError,
  suggestSettlements,
  type ShareAmount,
  type ShareSpec,
} from "@/lib/split-math";
import {
  SPLIT_DRAFT_REF_PATTERN,
  SPLIT_IMPORT_EXPENSES_MAX,
  type SplitImportExpense,
  type SplitImportInput,
} from "@/lib/split-import";

/**
 * The free split calculator's model (`/tools/split-bill-calculator`): a group
 * kept in the visitor's browser — a name, people by name only, and expenses —
 * and everything worked out from it with the app's own maths
 * (`lib/split-math.ts`), so the numbers on the tool are the numbers the app
 * would store.
 *
 * Amounts are integer minor units of the draft's currency, never floats. The
 * currency can only change while there are no expenses, as in the app.
 *
 * **Tie-breaking matches the app.** `computeShares` breaks ties by member id,
 * and in the app a group's member ids run in the order people were added, the
 * creator first. The ledger here therefore never sorts by the draft's own ids:
 * it keys everyone by their *position* in a given order — the draft's order on
 * the tool, "you" first on the import page — so a leftover cent lands on the
 * same person in both places.
 */

/**
 * The stored shape's version. v2 added an optional email per person; a v1
 * draft is read as v2 with no emails (`sanitizeDraft` migrates it). Bump when
 * the shape changes, and teach `sanitizeDraft` to read the old one.
 */
export const SPLIT_DRAFT_VERSION = 2;
/** Versions `sanitizeDraft` can still read. */
const READABLE_VERSIONS = new Set([1, 2]);

/** The same caps the app enforces — `tests/unit/tools/split-bill.test.ts` pins them to `validation.ts`. */
export const DRAFT_NAME_MAX = 40;
export const DRAFT_PERSON_NAME_MAX = 40;
/** Same as the app's invite email cap. */
export const DRAFT_EMAIL_MAX = 100;
export const DRAFT_TITLE_MAX = 40;
/** Largest amount, in major units (9 whole digits). */
export const DRAFT_AMOUNT_MAX = 999_999_999.99;
export const DRAFT_PEOPLE_MAX = SPLIT_GROUP_MAX_PEOPLE;
export const DRAFT_EXPENSES_MAX = SPLIT_IMPORT_EXPENSES_MAX;

/**
 * Someone in the group. `email` is optional and kept as typed: with one, the
 * person is invited automatically when the group is brought into the app.
 */
export type DraftPerson = { id: string; name: string; email?: string };

/** How an expense is divided — the inputs, in minor units / basis points. */
export type DraftSplit =
  | { type: "equal"; ids: string[] }
  | { type: "exact"; shares: { id: string; minor: number }[] }
  | { type: "percent"; shares: { id: string; bp: number }[] };

export type DraftExpense = {
  id: string;
  title: string;
  amountMinor: number;
  paidBy: string;
  /** `YYYY-MM-DD`. */
  on: string;
  split: DraftSplit;
};

export type SplitDraft = {
  v: typeof SPLIT_DRAFT_VERSION;
  name: string;
  currency: string;
  people: DraftPerson[];
  expenses: DraftExpense[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A fresh group: no name, two people to fill in, nothing spent. */
export function defaultDraft(currency = "USD"): SplitDraft {
  return {
    v: SPLIT_DRAFT_VERSION,
    name: "",
    currency: isSupportedCurrency(currency) ? currency : "USD",
    people: [
      { id: "p0001", name: "" },
      { id: "p0002", name: "" },
    ],
    expenses: [],
  };
}

/** True when there's nothing worth keeping — no expense and nobody named. */
export function isBlankDraft(draft: SplitDraft): boolean {
  return (
    draft.expenses.length === 0 &&
    !draft.name.trim() &&
    draft.people.every((p) => !p.name.trim() && !p.email?.trim())
  );
}

/**
 * A worked example for "Try an example": a weekend away, three people, one
 * expense of each kind. Amounts are the same numbers in any currency.
 */
export function exampleDraft(currency: string, today: string): SplitDraft {
  const base = defaultDraft(currency);
  const scale = 10 ** getCurrency(base.currency).decimals;
  const minor = (major: number) => major * scale;
  return {
    ...base,
    name: "Weekend away",
    people: [
      { id: "p0001", name: "Asha" },
      { id: "p0002", name: "Ben" },
      { id: "p0003", name: "Chloe" },
    ],
    expenses: [
      {
        id: "e0001",
        title: "Cabin",
        amountMinor: minor(300),
        paidBy: "p0001",
        on: today,
        split: { type: "equal", ids: ["p0001", "p0002", "p0003"] },
      },
      {
        id: "e0002",
        title: "Groceries",
        amountMinor: minor(90),
        paidBy: "p0002",
        on: today,
        split: {
          type: "exact",
          shares: [
            { id: "p0001", minor: minor(20) },
            { id: "p0002", minor: minor(40) },
            { id: "p0003", minor: minor(30) },
          ],
        },
      },
      {
        id: "e0003",
        title: "Fuel",
        amountMinor: minor(60),
        paidBy: "p0003",
        on: today,
        split: {
          type: "percent",
          shares: [
            { id: "p0001", bp: 5000 },
            { id: "p0003", bp: 5000 },
          ],
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------------- */
/* Ids and labels                                                             */
/* ------------------------------------------------------------------------- */

/** The next id with `prefix`: one past the highest in use, zero-padded so ids sort in add order. */
export function nextId(prefix: "p" | "e", taken: readonly { id: string }[]): string {
  let max = 0;
  for (const { id } of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** The name someone is shown under: what was typed, else "Person 2". */
export function personLabel(people: readonly DraftPerson[], id: string): string {
  const i = people.findIndex((p) => p.id === id);
  if (i === -1) return "Someone";
  return people[i]!.name.trim() || `Person ${i + 1}`;
}

/** Everyone who paid for or shares in an expense — they can't be removed while it stands. */
export function peopleInUse(draft: SplitDraft): Set<string> {
  const used = new Set<string>();
  for (const e of draft.expenses) {
    used.add(e.paidBy);
    for (const id of splitIds(e.split)) used.add(id);
  }
  return used;
}

function splitIds(split: DraftSplit): string[] {
  return split.type === "equal" ? split.ids : split.shares.map((s) => s.id);
}

/* ------------------------------------------------------------------------- */
/* Reading a stored draft                                                     */
/* ------------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isRef = (v: unknown): v is string => typeof v === "string" && SPLIT_DRAFT_REF_PATTERN.test(v);
const isMinor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function readSplit(raw: unknown, people: Set<string>): DraftSplit | null {
  if (!isObject(raw)) return null;
  if (raw.type === "equal") {
    if (!Array.isArray(raw.ids)) return null;
    const ids = [...new Set(raw.ids.filter((id): id is string => isRef(id) && people.has(id)))];
    return ids.length ? { type: "equal", ids } : null;
  }
  if (raw.type === "exact" || raw.type === "percent") {
    if (!Array.isArray(raw.shares)) return null;
    const seen = new Set<string>();
    const key = raw.type === "exact" ? "minor" : "bp";
    const shares: { id: string; value: number }[] = [];
    for (const s of raw.shares) {
      if (!isObject(s) || !isRef(s.id) || !people.has(s.id) || seen.has(s.id)) continue;
      const value = s[key];
      if (!isMinor(value) || (key === "bp" && value > BASIS_POINTS_TOTAL)) continue;
      seen.add(s.id);
      shares.push({ id: s.id, value });
    }
    if (!shares.length) return null;
    return raw.type === "exact"
      ? { type: "exact", shares: shares.map((s) => ({ id: s.id, minor: s.value })) }
      : { type: "percent", shares: shares.map((s) => ({ id: s.id, bp: s.value })) };
  }
  return null;
}

/**
 * A draft read back from storage (or anywhere untrusted), or `null` when it
 * isn't one. Lenient below the top level: a person or expense that doesn't
 * parse is dropped and the rest kept, so one bad row never costs the visitor
 * their whole group. Caps match the app's.
 */
export function sanitizeDraft(raw: unknown): SplitDraft | null {
  if (!isObject(raw) || typeof raw.v !== "number" || !READABLE_VERSIONS.has(raw.v)) return null;
  if (typeof raw.currency !== "string" || !isSupportedCurrency(raw.currency)) return null;
  if (!Array.isArray(raw.people) || !Array.isArray(raw.expenses)) return null;

  const people: DraftPerson[] = [];
  const ids = new Set<string>();
  for (const p of raw.people) {
    if (people.length >= DRAFT_PEOPLE_MAX) break;
    if (!isObject(p) || !isRef(p.id) || ids.has(p.id)) continue;
    ids.add(p.id);
    // v1 had no emails; reading one as v2 just leaves them out.
    const email = text(p.email, DRAFT_EMAIL_MAX);
    people.push({ id: p.id, name: text(p.name, DRAFT_PERSON_NAME_MAX), ...(email ? { email } : {}) });
  }
  if (people.length === 0) return null;

  const expenses: DraftExpense[] = [];
  const expenseIds = new Set<string>();
  for (const e of raw.expenses) {
    if (expenses.length >= DRAFT_EXPENSES_MAX) break;
    if (!isObject(e) || !isRef(e.id) || expenseIds.has(e.id)) continue;
    if (!isMinor(e.amountMinor) || e.amountMinor === 0) continue;
    if (!isRef(e.paidBy) || !ids.has(e.paidBy)) continue;
    if (typeof e.on !== "string" || !DATE.test(e.on)) continue;
    const split = readSplit(e.split, ids);
    if (!split) continue;
    expenseIds.add(e.id);
    expenses.push({
      id: e.id,
      title: text(e.title, DRAFT_TITLE_MAX),
      amountMinor: e.amountMinor,
      paidBy: e.paidBy,
      on: e.on,
      split,
    });
  }

  return {
    v: SPLIT_DRAFT_VERSION,
    name: text(raw.name, DRAFT_NAME_MAX),
    currency: raw.currency,
    people,
    expenses,
  };
}

/* ------------------------------------------------------------------------- */
/* The maths                                                                  */
/* ------------------------------------------------------------------------- */

/** The split inputs as `computeShares` takes them, people renamed by `key`. */
export function shareSpecOf(split: DraftSplit, key: (id: string) => string = (id) => id): ShareSpec {
  if (split.type === "equal") return { type: "equal", memberIds: split.ids.map(key) };
  if (split.type === "exact") {
    return { type: "exact", shares: split.shares.map((s) => ({ memberId: key(s.id), amountMinor: s.minor })) };
  }
  return { type: "percent", shares: split.shares.map((s) => ({ memberId: key(s.id), bp: s.bp })) };
}

/** One expense's shares (by draft id), or the reason it doesn't add up. */
export function expenseShares(
  expense: Pick<DraftExpense, "amountMinor" | "paidBy" | "split">,
  order?: readonly string[],
): ShareAmount[] | SplitMathError {
  const { toKey, fromKey } = positionalKeys(order ?? collectIds(expense));
  try {
    return computeShares(expense.amountMinor, toKey(expense.paidBy), shareSpecOf(expense.split, toKey)).map(
      (s) => ({ memberId: fromKey(s.memberId), amountMinor: s.amountMinor }),
    );
  } catch (err) {
    if (err instanceof SplitMathError) return err;
    throw err;
  }
}

function collectIds(expense: Pick<DraftExpense, "paidBy" | "split">): string[] {
  return [...new Set([expense.paidBy, ...splitIds(expense.split)])].sort();
}

/**
 * Stand-in keys that sort in `order` — `k0000`, `k0001`… — so `computeShares`'
 * id tie-break follows that order rather than the draft's own ids. Anyone not
 * in `order` sorts after everyone who is.
 */
function positionalKeys(order: readonly string[]) {
  const rank = new Map(order.map((id, i) => [id, i]));
  const extra = new Map<string, string>();
  const back = new Map<string, string>();
  const toKey = (id: string) => {
    const at = rank.get(id);
    const key = at !== undefined ? `k${String(at).padStart(4, "0")}` : (extra.get(id) ?? `z${id}`);
    if (at === undefined) extra.set(id, key);
    back.set(key, id);
    return key;
  };
  return { toKey, fromKey: (key: string) => back.get(key) ?? key };
}

export type PersonBalance = {
  id: string;
  /** What they paid for. */
  paidMinor: number;
  /** Their shares of everything. */
  shareMinor: number;
  /** Positive: gets money back. Negative: owes. */
  netMinor: number;
};

export type Payment = { from: string; to: string; amountMinor: number };

export type DraftLedger = {
  totalMinor: number;
  /** Per person, in draft order. Nets sum to zero. */
  balances: PersonBalance[];
  /** Who pays whom to settle everyone (at most n − 1 payments, not a guaranteed minimum), largest first. */
  payments: Payment[];
  /** Expenses that don't add up and were left out (shouldn't happen — the form checks). */
  invalid: string[];
};

/**
 * Balances and the payments that settle them. `order` is the tie-break order
 * (see the note at the top): the draft's own order by default; the import
 * page passes "you" first, the order the app will create people in.
 */
export function computeLedger(draft: SplitDraft, order?: readonly string[]): DraftLedger {
  const ids = draft.people.map((p) => p.id);
  const { toKey, fromKey } = positionalKeys(order ?? ids);
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  const invalid: string[] = [];
  let totalMinor = 0;
  for (const e of draft.expenses) {
    let shares: ShareAmount[];
    try {
      shares = computeShares(e.amountMinor, toKey(e.paidBy), shareSpecOf(e.split, toKey));
    } catch (err) {
      if (!(err instanceof SplitMathError)) throw err;
      invalid.push(e.id);
      continue;
    }
    totalMinor += e.amountMinor;
    const payer = toKey(e.paidBy);
    paid[payer] = (paid[payer] ?? 0) + e.amountMinor;
    for (const s of shares) owed[s.memberId] = (owed[s.memberId] ?? 0) + s.amountMinor;
  }
  const keys = ids.map(toKey);
  const nets = netBalances(keys, { paid, owed, sent: {}, received: {} });
  return {
    totalMinor,
    balances: nets.map((b) => ({
      id: fromKey(b.memberId),
      paidMinor: paid[b.memberId] ?? 0,
      shareMinor: owed[b.memberId] ?? 0,
      netMinor: b.netMinor,
    })),
    payments: suggestSettlements(nets).map((s) => ({
      from: fromKey(s.fromMemberId),
      to: fromKey(s.toMemberId),
      amountMinor: s.amountMinor,
    })),
    invalid,
  };
}

/** The order the app creates people in on import: you first, then everyone else as listed. */
export function importOrder(draft: SplitDraft, meId: string): string[] {
  return [meId, ...draft.people.map((p) => p.id).filter((id) => id !== meId)];
}

/* ------------------------------------------------------------------------- */
/* Emails                                                                     */
/* ------------------------------------------------------------------------- */

/** An email as the app compares it: trimmed and lowercased. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * A light check — something@something.tld — enough to catch a typo before
 * the server's stricter one. The app's `inviteEmailSchema` has the last word.
 */
export function looksLikeEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= DRAFT_EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * What's wrong with each person's email, by person id: not an email, or the
 * same inbox as someone listed earlier. Blank emails are fine (they're
 * optional) and aren't listed. `skip` leaves one person out — "you", whose
 * own address doesn't matter.
 */
export function emailProblems(
  people: readonly DraftPerson[],
  { skip, mine }: { skip?: string | null; mine?: string | null } = {},
): Record<string, string> {
  const problems: Record<string, string> = {};
  const seen = new Map<string, string>();
  const self = normalizeEmail(mine);
  for (const p of people) {
    if (p.id === skip) continue;
    const email = normalizeEmail(p.email);
    if (!email) continue;
    if (!looksLikeEmail(email)) problems[p.id] = "Check this email";
    else if (self && email === self) problems[p.id] = "That's you — pick this row as “you” instead";
    else if (seen.has(email)) problems[p.id] = `Same email as ${personLabel(people, seen.get(email)!)}`;
    else seen.set(email, p.id);
  }
  return problems;
}

/**
 * Which person in the draft is the signed-in account, or `null` when that
 * can't be told and the page should ask:
 * - the person whose email is the account's own, when exactly one is;
 * - otherwise the first person — the row the calculator labels "You" — as
 *   long as it has no email (an address there that isn't yours means it may
 *   not be you).
 */
export function resolveMe(draft: SplitDraft, myEmail: string | null | undefined): string | null {
  const mine = normalizeEmail(myEmail);
  if (mine) {
    const matches = draft.people.filter((p) => normalizeEmail(p.email) === mine);
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) return null;
  }
  const first = draft.people[0];
  return first && !normalizeEmail(first.email) ? first.id : null;
}

/**
 * Whether the group can be brought in with no form at all: "you" is known,
 * everyone else has a valid email that's unique and isn't yours, and every
 * expense adds up (so nothing would be left out).
 */
export function readyToImport(
  draft: SplitDraft,
  meId: string | null,
  myEmail: string | null | undefined,
): boolean {
  if (!meId || !draft.people.some((p) => p.id === meId)) return false;
  const others = draft.people.filter((p) => p.id !== meId);
  if (others.some((p) => !normalizeEmail(p.email))) return false;
  if (Object.keys(emailProblems(draft.people, { skip: meId, mine: myEmail })).length) return false;
  return computeLedger(draft).invalid.length === 0;
}

/** What a group with no name is called once it's in the app, which needs one. */
export const UNNAMED_GROUP = "Our group";

/* ------------------------------------------------------------------------- */
/* Import                                                                     */
/* ------------------------------------------------------------------------- */

function toImportExpense(e: DraftExpense, currency: string, title: string): SplitImportExpense {
  const amount = fromMinorUnits(e.amountMinor, currency);
  const base = { title, amount, paidBy: e.paidBy, occurredOn: e.on };
  if (e.split.type === "equal") return { ...base, splitType: "equal", memberIds: [...e.split.ids] };
  if (e.split.type === "exact") {
    return {
      ...base,
      splitType: "exact",
      shares: e.split.shares.map((s) => ({ memberId: s.id, amount: fromMinorUnits(s.minor, currency) })),
    };
  }
  return {
    ...base,
    splitType: "percent",
    shares: e.split.shares.map((s) => ({ memberId: s.id, percent: fromBasisPoints(s.bp) })),
  };
}

/** What an untitled expense is called once it's in the app, which needs a title. */
export const UNTITLED_EXPENSE = "Expense";

/**
 * The draft as the import action takes it: `meId` becomes the group's creator,
 * everyone else is invited at the email typed for them (trimmed, lowercased),
 * in draft order. Expenses that don't add up are left out (`computeLedger`
 * reports the same ones as `invalid`).
 */
export function buildImportInput({
  draft,
  name,
  meId,
  emails = {},
  icon = null,
}: {
  draft: SplitDraft;
  name: string;
  meId: string;
  /** Overrides by person id; anyone not in it uses the email saved in the draft. */
  emails?: Readonly<Record<string, string>>;
  icon?: string | null;
}): SplitImportInput {
  const invalid = new Set(computeLedger(draft).invalid);
  return {
    name: name.trim() || UNNAMED_GROUP,
    icon,
    currency: draft.currency,
    me: { ref: meId, name: personLabel(draft.people, meId) },
    people: draft.people
      .filter((p) => p.id !== meId)
      .map((p) => ({
        ref: p.id,
        name: personLabel(draft.people, p.id),
        email: normalizeEmail(emails?.[p.id] ?? p.email),
      })),
    expenses: draft.expenses
      .filter((e) => !invalid.has(e.id))
      .map((e) => toImportExpense(e, draft.currency, e.title.trim() || UNTITLED_EXPENSE)),
  };
}

/* ------------------------------------------------------------------------- */
/* Words                                                                      */
/* ------------------------------------------------------------------------- */

/** "Split equally between 3", "Exact amounts", "By percent" — the expense list's summary. */
export function splitSummary(split: DraftSplit): string {
  if (split.type === "equal") return `split equally between ${split.ids.length}`;
  if (split.type === "exact") return `exact amounts for ${split.shares.filter((s) => s.minor > 0).length}`;
  return `by percent for ${split.shares.filter((s) => s.bp > 0).length}`;
}

/**
 * The settle-up as a message someone would paste into the group chat. Names
 * and amounts only — `format` renders minor units in the draft's currency.
 */
export function settleUpText(
  draft: SplitDraft,
  ledger: DraftLedger,
  format: (minor: number) => string,
  link: string,
): string {
  const title = draft.name.trim() || "Our group";
  const label = (id: string) => personLabel(draft.people, id);
  const lines = ledger.payments.length
    ? ledger.payments.map((p) => `${label(p.from)} pays ${label(p.to)} ${format(p.amountMinor)}`)
    : ["Everyone is settled up."];
  return [`${title} — ${format(ledger.totalMinor)} in total. To settle up:`, ...lines, "", `Worked out with ${link}`].join(
    "\n",
  );
}
