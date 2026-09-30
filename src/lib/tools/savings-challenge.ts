import { addDays, daysBetween, parseDate } from "@/lib/tools/date-math";

/**
 * Savings challenges for `/tools/savings-challenge`: the 52-week challenge
 * (and its reverse), the 100-envelope challenge, and a custom goal split into
 * equal weekly steps.
 *
 * Every amount is an integer in the currency's minor units (cents, paise,
 * yen), so a challenge's steps add up to its total exactly — the tracker shows
 * a running total next to each tick, and "$1,377.99 of $1,378" from float
 * drift would read as a bug. Convert at the edges with `src/lib/money.ts`.
 */

export type ChallengeKind = "up" | "down" | "envelopes" | "custom";

/** Weeks in the classic challenge. */
export const CHALLENGE_WEEKS = 52;
/** Envelopes in the envelope challenge. */
export const ENVELOPES = 100;

/** Input bounds, in major units — wide enough for any real plan, small enough to stay exact. */
export const LIMITS = {
  /** Largest step amount (the week-1 or envelope-1 amount). */
  maxBase: 1e9,
  /** Largest custom goal. */
  maxGoal: 1e12,
  minWeeks: 1,
  /** Five years of weekly steps — past that a weekly tick box stops being useful. */
  maxWeeks: 260,
} as const;

export type ChallengeStep = {
  /** Week number or envelope number, from 1 — what a tick is stored against. */
  id: number;
  /** What to put aside for this step, in minor units. */
  amount: number;
};

export type Challenge = {
  kind: ChallengeKind;
  /** Weeks are done in order, one a week; envelopes in any order. */
  unit: "week" | "envelope";
  /** In display order: weeks by number, envelopes shuffled. */
  steps: ChallengeStep[];
  /** Sum of every step, in minor units. */
  total: number;
};

function assertMinor(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive whole number of minor units: ${value}`);
  }
}

/** 1 + 2 + … + n. */
export function triangular(n: number): number {
  return (n * (n + 1)) / 2;
}

/**
 * The 52-week challenge: week n saves n × `base` (1, 2, … 52 — 1,378 × base in
 * all). `down` runs it in reverse, starting with the biggest week, so the
 * steps shrink as the year goes on.
 */
export function weeklyChallenge(base: number, direction: "up" | "down", weeks = CHALLENGE_WEEKS): Challenge {
  assertMinor(base, "base");
  const steps = Array.from({ length: weeks }, (_, i) => ({
    id: i + 1,
    amount: (direction === "up" ? i + 1 : weeks - i) * base,
  }));
  return { kind: direction, unit: "week", steps, total: triangular(weeks) * base };
}

/** Fixed, so the server's HTML and the browser draw the envelopes in the same order. */
export const ENVELOPE_SEED = 0x5ca1ab1e;

/** A small seeded PRNG (mulberry32): the same seed always gives the same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1…`count` in a shuffled order that depends only on `seed` (Fisher–Yates). */
export function shuffledOrder(count: number, seed = ENVELOPE_SEED): number[] {
  const order = Array.from({ length: count }, (_, i) => i + 1);
  const random = mulberry32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * The 100-envelope challenge: envelope n holds n × `base` (5,050 × base in
 * all). The envelopes come back in a stable shuffled order — laid out like a
 * pile to draw from, not a list to work down — but every visitor, and the
 * server render, sees the same order.
 */
export function envelopeChallenge(base: number, count = ENVELOPES, seed = ENVELOPE_SEED): Challenge {
  assertMinor(base, "base");
  const steps = shuffledOrder(count, seed).map((id) => ({ id, amount: id * base }));
  return { kind: "envelopes", unit: "envelope", steps, total: triangular(count) * base };
}

/**
 * A goal split into `weeks` equal weekly steps, rounded to a tidy figure with
 * the last week taking up the difference — or null when the goal is too small
 * to give every week at least one minor unit.
 *
 * The rounding unit is the largest power of ten (in minor units) no bigger
 * than a step ÷ (2 × weeks). That keeps the last week within a quarter of a
 * step of the others while rounding as coarsely as that allows: 1,000 over 52
 * weeks is 19.20 a week and 20.80 in the last; 10,000 is 192 and 208.
 */
export function customSteps(goal: number, weeks: number): { step: number; last: number } | null {
  assertMinor(goal, "goal");
  if (!Number.isInteger(weeks) || weeks < 1) throw new RangeError(`weeks must be a whole number ≥ 1: ${weeks}`);
  if (weeks === 1) return { step: goal, last: goal };
  const ideal = goal / weeks;
  let unit = 1;
  while (unit * 10 <= ideal / (2 * weeks)) unit *= 10;
  let step = Math.round(ideal / unit) * unit;
  let last = goal - step * (weeks - 1);
  if (step <= 0 || last <= 0) {
    // A goal of only a few minor units a week: round down instead, so the
    // last week is the one that's bigger.
    step = Math.floor(ideal);
    last = goal - step * (weeks - 1);
  }
  return step > 0 ? { step, last } : null;
}

/** The custom challenge as steps — see `customSteps`. Null when the goal is too small for that many weeks. */
export function customChallenge(goal: number, weeks: number): Challenge | null {
  const split = customSteps(goal, weeks);
  if (!split) return null;
  const steps = Array.from({ length: weeks }, (_, i) => ({
    id: i + 1,
    amount: i === weeks - 1 ? split.last : split.step,
  }));
  return { kind: "custom", unit: "week", steps, total: goal };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type Progress = {
  /** Sum of the ticked steps, minor units. */
  saved: number;
  remaining: number;
  /** Steps ticked, and steps in all. */
  done: number;
  count: number;
  /** saved ÷ total, 0–1. */
  fraction: number;
  /** The first unticked week, for a week challenge — null when all are done, and for envelopes. */
  next: ChallengeStep | null;
};

/** How far through `challenge` the ticks in `ticked` are. Ids that aren't steps are ignored. */
export function challengeProgress(challenge: Challenge, ticked: ReadonlySet<number>): Progress {
  let saved = 0;
  let done = 0;
  let next: ChallengeStep | null = null;
  for (const step of challenge.steps) {
    if (ticked.has(step.id)) {
      saved += step.amount;
      done += 1;
    } else if (challenge.unit === "week" && (next === null || step.id < next.id)) {
      next = step;
    }
  }
  return {
    saved,
    remaining: challenge.total - saved,
    done,
    count: challenge.steps.length,
    fraction: challenge.total > 0 ? saved / challenge.total : 0,
    next,
  };
}

/**
 * A fraction as a whole percentage for a progress label — never 0% once
 * something is saved, never 100% until everything is (99.96% reads "99%").
 */
export function percentDone(fraction: number): number {
  if (!(fraction > 0)) return 0;
  if (fraction >= 1) return 100;
  return Math.min(99, Math.max(1, Math.floor(fraction * 100)));
}

/** Running totals by step id, in id order: what's saved once each step is done in turn. */
export function runningTotals(challenge: Challenge): Map<number, number> {
  const byId = [...challenge.steps].sort((a, b) => a.id - b.id);
  const totals = new Map<number, number>();
  let sum = 0;
  for (const step of byId) {
    sum += step.amount;
    totals.set(step.id, sum);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** The day week `id` (1-based) is due: the start date, then every 7 days. Null past the year 9999. */
export function weekDate(start: string, id: number): string | null {
  return addDays(start, (id - 1) * 7);
}

/**
 * When the challenge is done: the last week's date, or — for envelopes, which
 * have no schedule of their own — the last of `count` days at one a day.
 */
export function finishDate(challenge: Challenge, start: string): string | null {
  return challenge.unit === "week"
    ? weekDate(start, challenge.steps.length)
    : addDays(start, challenge.steps.length - 1);
}

/** The 0-based index of the week `today` falls in, or null before the start or after the last week. */
export function currentWeekIndex(start: string, today: string, weeks: number): number | null {
  const days = daysBetween(start, today);
  if (days < 0) return null;
  const index = Math.floor(days / 7);
  return index < weeks ? index : null;
}

// ---------------------------------------------------------------------------
// Saved trackers (localStorage shape)
// ---------------------------------------------------------------------------

/**
 * A challenge's ticks as stored in the browser. `start` pins the date the
 * challenge began, so a tracker started "today" doesn't slide forward a day
 * every time the page is opened.
 */
export type SavedTracker = { ticks: number[]; start: string | null; at: number };

/** How many challenge configurations one browser remembers — the oldest go first. */
export const MAX_TRACKERS = 20;

/**
 * The tracker a set of ticks belongs to. The currency and start date are left
 * out on purpose: switching the currency to compare, or moving the start date,
 * shouldn't make weeks already ticked disappear.
 */
export function trackerKey(kind: ChallengeKind, amount: number, weeks?: number): string {
  return kind === "custom" ? `custom:${amount}:${weeks ?? 0}` : `${kind}:${amount}`;
}

/** Stored JSON → trackers, dropping anything malformed. Never throws. */
export function sanitizeTrackers(raw: unknown): Record<string, SavedTracker> {
  const out: Record<string, SavedTracker> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 80 || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (!Array.isArray(v.ticks)) continue;
    const ticks = [
      ...new Set(
        v.ticks.filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= 1000),
      ),
    ].sort((a, b) => a - b);
    const start = typeof v.start === "string" && parseDate(v.start) ? v.start : null;
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0;
    out[key] = { ticks, start, at };
  }
  return pruneTrackers(out);
}

/** Keep the `max` most recently used trackers. */
export function pruneTrackers(
  trackers: Record<string, SavedTracker>,
  max = MAX_TRACKERS,
): Record<string, SavedTracker> {
  const entries = Object.entries(trackers);
  if (entries.length <= max) return trackers;
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, max));
}
