import { planAtLeast, type PersonalPlan } from "@/lib/plans";
import { PERIOD_MONTHS, TRIAL_DAYS, type PaidPersonalPlan, type Period } from "@/lib/pricing";

/**
 * The billing decisions, as pure functions — what the checkout and the webhook
 * apply, written once so they can be tested without a provider or a database.
 * The abuse rules they carry (`abuse-prevention.md`): B1 trials, B2 disputes,
 * B3 failed payments, A3 top-up amounts, C3 downgrades at renewal.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Subscription status ────────────────────────────────────────────────────

/**
 * The provider's subscription statuses that still hold a place: one of these
 * per workspace at a time (the `workspace_subscriptions_live_uq` index).
 */
export const LIVE_STATUSES = ["pending", "active", "on_hold", "paused", "past_due"] as const;

export function isLiveStatus(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Does this status give the workspace its paid plan? `active` (a trial too),
 * `past_due` (a renewal failed and the provider is retrying — the workspace
 * keeps working, B3) and `on_hold` (all retries failed — the plan stays, and
 * the hold below makes it view-only). `pending` isn't paid yet; `paused`,
 * `cancelled`, `expired` and `failed` are Free.
 */
export function entitlesPlan(status: string): boolean {
  return status === "active" || status === "past_due" || status === "on_hold";
}

/** A status that means "a payment is failing" (B3). */
export function isFailingStatus(status: string): boolean {
  return status === "past_due" || status === "on_hold";
}

// ── Failed payments (B3) ───────────────────────────────────────────────────

/** Days a workspace keeps working after its renewal finally fails. */
export const PAYMENT_GRACE_DAYS = 7;
/** That grace is given once in this many days per workspace. */
export const PAYMENT_GRACE_EVERY_DAYS = 90;

/**
 * When a workspace whose renewal finally failed (`on_hold`) turns view-only.
 * The first time in 3 months it gets `PAYMENT_GRACE_DAYS`; inside that window
 * it's view-only at once — so letting the renewal fail every month doesn't buy
 * a free week every month (B3). While the debit is pending (UPI ≈ 48 h) and
 * while the provider retries (`past_due`) nothing is held at all.
 */
export function failedPaymentHold(now: Date, graceUsedAt: Date | null): { holdFrom: Date; graceGranted: boolean } {
  const recent = graceUsedAt && now.getTime() - graceUsedAt.getTime() < PAYMENT_GRACE_EVERY_DAYS * DAY_MS;
  if (recent) return { holdFrom: now, graceGranted: false };
  return { holdFrom: new Date(now.getTime() + PAYMENT_GRACE_DAYS * DAY_MS), graceGranted: true };
}

// ── Plan changes (C3) ──────────────────────────────────────────────────────

export type PlanPeriod = { plan: PaidPersonalPlan; period: Period };
export type PlanChangeKind = "upgrade" | "downgrade" | "same";

/**
 * A move up — a bigger plan, or the same plan for a longer period — happens
 * now; a move down waits for the renewal. A bigger plan for a shorter period
 * is still an upgrade (the plan decides what the workspace can do), and a
 * smaller one for a longer period still waits.
 */
export function planChangeKind(from: PlanPeriod, to: PlanPeriod): PlanChangeKind {
  if (from.plan !== to.plan) return planAtLeast(to.plan, from.plan) ? "upgrade" : "downgrade";
  const a = PERIOD_MONTHS[from.period];
  const b = PERIOD_MONTHS[to.period];
  if (a === b) return "same";
  return b > a ? "upgrade" : "downgrade";
}

/**
 * How the provider is asked to make each kind of change:
 *  - an upgrade is immediate and prorated — the unused part of the current
 *    period is credited and the new plan is charged now, so the renewal date
 *    moves to today, and **a running trial ends** (it's charged at once);
 *  - a downgrade is scheduled for the next billing date and bills nothing now:
 *    the workspace keeps (and has paid for) the bigger plan until then, and
 *    usage carries over (C3). No refunds.
 */
export function planChangeRequest(kind: Exclude<PlanChangeKind, "same">): {
  proration_billing_mode: "prorated_immediately" | "do_not_bill";
  effective_at: "immediately" | "next_billing_date";
} {
  return kind === "upgrade"
    ? { proration_billing_mode: "prorated_immediately", effective_at: "immediately" }
    : // verify in test mode: how `proration_billing_mode` applies to a change
      // scheduled for the renewal isn't documented; `do_not_bill` is the one
      // mode that can't charge anything now.
      { proration_billing_mode: "do_not_bill", effective_at: "next_billing_date" };
}

// ── Trials (B1) ────────────────────────────────────────────────────────────

/** Trials one person may start in `TRIAL_WINDOW_DAYS` (B1). */
export const TRIALS_PER_PERSON = 2;
export const TRIAL_WINDOW_DAYS = 365;

/**
 * The free-trial days a plan bought now starts with (B1): the full trial only
 * for a workspace's **first** paid plan, and only while the buyer has started
 * fewer than `TRIALS_PER_PERSON` trials — on *other* workspaces — in the last
 * year. Counted by the person who starts the checkout. Otherwise 0, and the
 * order summary says the plan is charged today.
 */
export function trialDaysFor(input: { workspaceHadPlan: boolean; buyerTrialsElsewhere: number }): number {
  if (input.workspaceHadPlan) return 0;
  if (input.buyerTrialsElsewhere >= TRIALS_PER_PERSON) return 0;
  return TRIAL_DAYS;
}

// ── Top-up payments (A3) ───────────────────────────────────────────────────

export type TopUpCheck =
  | { ok: true }
  | { ok: false; reason: "not_topup" | "workspace_mismatch" | "currency_mismatch" | "amount_short" };

/**
 * May this payment grant the top-up its checkout session was opened for? Only
 * if the session is a top-up for this very workspace and the money received —
 * before tax, which the provider adds on top of our tax-exclusive price — is
 * at least what we priced it at, in the same currency (A3). Anything else
 * grants nothing; the caller logs a warning.
 */
export function checkTopUpPayment(
  session: { item: "plan" | "topup"; workspaceId: string; expectedAmountMinor: number; currency: string },
  payment: { workspaceId: string; totalAmountMinor: number; taxMinor: number | null; currency: string },
): TopUpCheck {
  if (session.item !== "topup") return { ok: false, reason: "not_topup" };
  if (session.workspaceId !== payment.workspaceId) return { ok: false, reason: "workspace_mismatch" };
  if (session.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }
  const preTax = payment.totalAmountMinor - Math.max(0, payment.taxMinor ?? 0);
  if (preTax < session.expectedAmountMinor) return { ok: false, reason: "amount_short" };
  return { ok: true };
}

// ── Disputes (B2) ──────────────────────────────────────────────────────────

/**
 * After a dispute's latest status, does it still hold the workspace view-only?
 * Opened, challenged, accepted, lost and expired (a dispute nobody answered is
 * lost) keep it held; won or cancelled lift it.
 */
export function disputeHolds(status: string): boolean {
  return !(status === "dispute_won" || status === "dispute_cancelled" || status === "won" || status === "cancelled");
}

/** A person whose payments have been disputed this many times can't buy any more (B2). */
export const DISPUTES_BEFORE_BLOCK = 2;

// ── Workspace plan ─────────────────────────────────────────────────────────

/** The plan a workspace is on given its live subscription (Free with none). */
export function workspacePlanFor(sub: { status: string; plan: PersonalPlan } | null): PersonalPlan {
  return sub && entitlesPlan(sub.status) ? sub.plan : "free";
}
