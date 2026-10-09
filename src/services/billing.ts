import "server-only";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  aiTopups,
  billingCheckoutSessions,
  billingPayments,
  users,
  workspaceMembers,
  workspaceSubscriptions,
  workspaces,
  type BillingHold,
  type WorkspaceSubscription,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { planSku } from "@/lib/billing-catalog";
import { requireBillingConfig } from "@/lib/billing-config";
import {
  LIVE_STATUSES,
  TRIAL_WINDOW_DAYS,
  entitlesPlan,
  planChangeKind,
  planChangeRequest,
  trialDaysFor,
  type PlanChangeKind,
} from "@/lib/billing-rules";
import {
  checkoutCurrency,
  checkoutQuote,
  checkoutRefusal,
  topUpQuote,
} from "@/lib/checkout";
import * as dodo from "@/lib/dodo";
import { ApiError, badRequest, conflict, notFound, rateLimited } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  billingCountryFor,
  createCheckoutSession,
  returnOrigin,
  type CheckoutOrder,
} from "@/lib/payments";
import { checkoutDescription, checkoutRefusalMessage, pricingCurrencyFor } from "@/lib/plan-copy";
import type { PersonalPlan } from "@/lib/plans";
import { isCurrency, quote, type PaidPersonalPlan, type Period } from "@/lib/pricing";
import { changePlanSchema, startCheckoutSchema } from "@/lib/validation";
import { readOnlyWorkspaceSql, requireWorkspaceRole } from "@/lib/workspaces";

/**
 * Buying and managing a workspace's plan — the server half of checkout and of
 * Settings → Billing. The checkout page and the billing page call it through
 * `actions/billing.ts`.
 *
 * Everything that matters about an order is decided here, never by the
 * client: who may buy (a workspace admin, whose purchases aren't blocked — B2),
 * what (a plan above the current one with no plan already running, or a
 * top-up on a paid plan), the trial (B1), and the price (`lib/checkout.ts` →
 * `lib/pricing.ts`). The order goes to the provider's hosted checkout
 * (`lib/payments.ts`), and the session is recorded so the webhook can tie the
 * payment back to this workspace and check its amount (A3).
 *
 * **Nothing here changes a plan.** The plan moves only when the provider's
 * webhook confirms it (`services/billing-webhook.ts`) — not on the return
 * page, and not when a change is requested.
 */

const workspaceIdSchema = z.string().uuid("That workspace isn't valid");

/** Where the request came from — `cf-ipcountry`, for the currency and billing-country rules. */
export type CheckoutRequestContext = { country: string | null };

/** Checkouts one person may open in an hour, across workspaces — a cheap cap on provider calls. */
export const CHECKOUT_SESSIONS_PER_HOUR = 10;

/** Pending trial checkouts count toward B1 for this long (a session's link lives 24 h). */
const PENDING_TRIAL_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The return page a purchase lands on, polling until the webhook has landed. */
export function returnPath(workspaceId: string, expect?: { plan: PaidPersonalPlan; period: Period }): string {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (expect) {
    params.set("plan", expect.plan);
    params.set("period", expect.period);
  }
  return `/app/upgrade/return?${params.toString()}`;
}

// ── Reads ──────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The live subscription of a workspace — at most one (the partial unique index) — or null. */
export async function getLiveSubscription(
  workspaceId: string,
  db: Pick<Db, "select"> | Tx = getDb(),
): Promise<WorkspaceSubscription | null> {
  const [row] = await db
    .select()
    .from(workspaceSubscriptions)
    .where(
      and(
        eq(workspaceSubscriptions.workspaceId, workspaceId),
        inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
        isNull(workspaceSubscriptions.supersededAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Is this subscription still inside its free trial? */
export function inTrialNow(sub: Pick<WorkspaceSubscription, "trialEndsAt" | "status">, now: Date = new Date()): boolean {
  return sub.status === "active" && Boolean(sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime());
}

/**
 * The trial a plan bought for this workspace now would start with (B1): only
 * a Free workspace's first paid plan, and only while the buyer has started
 * fewer than two trials elsewhere in the last year. Trial checkouts still open
 * (under a day old, not completed) count too, so opening several at once
 * doesn't get round it.
 */
export async function trialDaysForPurchase(
  userId: string,
  workspaceId: string,
  currentPlan: PersonalPlan,
  now: Date = new Date(),
): Promise<number> {
  if (currentPlan !== "free") return 0;
  const db = getDb();
  const since = new Date(now.getTime() - TRIAL_WINDOW_DAYS * DAY_MS);
  const pendingSince = new Date(now.getTime() - PENDING_TRIAL_HOURS * HOUR_MS);
  const result = await db.execute<{ had_plan: boolean; elsewhere: string }>(sql`
    select
      exists (
        select 1 from ${workspaceSubscriptions}
        where ${workspaceSubscriptions.workspaceId} = ${workspaceId}
          and ${workspaceSubscriptions.activatedAt} is not null
      ) as had_plan,
      (
        select count(distinct w)::text from (
          select ${workspaceSubscriptions.workspaceId} as w from ${workspaceSubscriptions}
          where ${workspaceSubscriptions.buyerUserId} = ${userId}
            and ${workspaceSubscriptions.trialDays} > 0
            and ${workspaceSubscriptions.activatedAt} >= ${since}
            and ${workspaceSubscriptions.workspaceId} <> ${workspaceId}
          union
          select ${billingCheckoutSessions.workspaceId} from ${billingCheckoutSessions}
          where ${billingCheckoutSessions.buyerUserId} = ${userId}
            and ${billingCheckoutSessions.trialDays} > 0
            and ${billingCheckoutSessions.completedAt} is null
            and ${billingCheckoutSessions.createdAt} >= ${pendingSince}
            and ${billingCheckoutSessions.workspaceId} <> ${workspaceId}
        ) trials
      ) as elsewhere
  `);
  const row = result.rows[0];
  return trialDaysFor({
    workspaceHadPlan: Boolean(row?.had_plan),
    buyerTrialsElsewhere: Number(row?.elsewhere ?? 0),
  });
}

// ── Purchase guards ────────────────────────────────────────────────────────

/** 403 `purchases_blocked` — a second disputed payment (B2). Support lifts it by hand. */
export function purchasesBlocked(): ApiError {
  return new ApiError(
    403,
    "purchases_blocked",
    "Purchases are turned off for this account after a disputed payment. Contact support to sort it out.",
  );
}

/** A workspace on a billing hold can't buy anything until the hold is sorted out. */
function heldError(hold: BillingHold): ApiError {
  return hold === "dispute"
    ? new ApiError(
        403,
        "purchases_blocked",
        "This workspace has a disputed payment. Contact support before buying anything for it.",
      )
    : conflict("This workspace's plan payment didn't go through — update the payment method in Settings → Billing first.");
}

async function purchaseContext(userId: string, workspaceId: string) {
  const db = getDb();
  const [[ws], [buyer]] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        plan: workspaces.plan,
        currency: workspaces.currency,
        billingHold: workspaces.billingHold,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    db
      .select({ email: users.email, name: users.name, purchasesBlockedAt: users.purchasesBlockedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);
  if (!ws) throw notFound("Workspace not found");
  if (buyer?.purchasesBlockedAt) throw purchasesBlocked();
  // Any hold — even a payment hold still in its grace — stops new purchases:
  // fix the payment (or settle the dispute) before buying more.
  if (ws.billingHold) throw heldError(ws.billingHold);
  return { ws, buyer };
}

// ── Checkout ───────────────────────────────────────────────────────────────

export async function startCheckout(
  userId: string,
  workspaceId: string,
  input: unknown,
  ctx: CheckoutRequestContext = { country: null },
): Promise<{ url: string }> {
  const order = await buildCheckoutOrder(userId, workspaceId, input, ctx);
  await assertCheckoutCap(userId);
  const session = await createCheckoutSession(order);
  // Recorded before the buyer is sent anywhere: a URL we didn't record would be
  // a payment the webhook couldn't tie to a workspace.
  await getDb()
    .insert(billingCheckoutSessions)
    .values({
      sessionId: session.sessionId,
      workspaceId: order.workspace.id,
      buyerUserId: userId,
      item: order.line.kind,
      plan: order.line.kind === "plan" ? order.line.plan : null,
      period: order.line.kind === "plan" ? order.line.period : null,
      productId: session.productId,
      expectedAmountMinor: order.amountMinor,
      currency: order.currency,
      trialDays: order.line.kind === "plan" ? order.line.trialDays : 0,
    });
  logger.info(`Checkout opened for a ${order.line.kind === "plan" ? `${order.line.plan} plan` : "top-up"}`, {
    event: "billing.checkout_opened",
    workspaceId: order.workspace.id,
    sessionId: session.sessionId,
    item: order.line.kind,
    currency: order.currency,
    trialDays: order.line.kind === "plan" ? order.line.trialDays : 0,
  });
  return { url: session.url };
}

/** At most `CHECKOUT_SESSIONS_PER_HOUR` checkouts a person opens in an hour. */
async function assertCheckoutCap(userId: string, now: Date = new Date()): Promise<void> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(billingCheckoutSessions)
    .where(
      and(
        eq(billingCheckoutSessions.buyerUserId, userId),
        gte(billingCheckoutSessions.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    );
  if (Number(row?.n ?? 0) >= CHECKOUT_SESSIONS_PER_HOUR) {
    throw rateLimited("You've opened checkout a lot in the last hour — try again a little later.", {
      bucket: "create",
      window: "1h",
      retryAfterSeconds: 15 * 60,
    });
  }
}

/**
 * Everything `startCheckout` checks and prices, up to the provider call —
 * split out so the order it would send can be tested without one.
 */
export async function buildCheckoutOrder(
  userId: string,
  workspaceId: string,
  input: unknown,
  ctx: CheckoutRequestContext = { country: null },
): Promise<CheckoutOrder> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const item = parseOrThrow(startCheckoutSchema, input);
  await requireWorkspaceRole(userId, id, "admin");
  const { ws, buyer } = await purchaseContext(userId, id);

  const refusal = checkoutRefusal(ws.plan, item);
  if (refusal) {
    throw badRequest(checkoutRefusalMessage(refusal, ws.plan, item.item === "plan" ? item.plan : undefined));
  }
  // A checkout always starts a *new* subscription: a workspace that has one
  // changes it instead (`changePlan`), or it would be billed twice.
  if (item.item === "plan" && (await getLiveSubscription(id))) {
    throw conflict("This workspace already has a plan. Change it from Settings → Billing.");
  }

  // The client's (or the workspace's) currency is a preference; the request's
  // country decides whether the rupee list may be used (`checkoutCurrency`).
  const currency = checkoutCurrency(item.currency ?? pricingCurrencyFor(ws.currency), ctx.country);
  // The page showed `item.currency`; if the request's country no longer allows
  // it (a VPN toggled, roaming), charging something else silently would bill a
  // currency the buyer never saw — ask them to reload instead.
  if (item.currency && currency !== item.currency) {
    throw badRequest("Prices for your location have changed — reload the page to see them.");
  }
  if (!buyer?.email) throw badRequest("Your account needs an email address before you can buy a plan.");

  const base = {
    workspace: { id: ws.id, name: ws.name },
    buyer: { userId, email: buyer.email, name: buyer.name ?? null },
    currency,
    country: billingCountryFor(currency, ctx.country),
    returnPath: returnPath(ws.id),
    cancelPath: "/app/upgrade",
  };

  if (item.item === "topup") {
    const q = topUpQuote(currency);
    return {
      ...base,
      line: { kind: "topup", actions: q.actions, validityMonths: q.validityMonths },
      amountMinor: q.amountMinor,
      description: checkoutDescription({ kind: "topup" }, ws.name),
    };
  }

  const q = checkoutQuote(item.plan, item.period, currency);
  const trialDays = await trialDaysForPurchase(userId, id, ws.plan);
  return {
    ...base,
    line: { kind: "plan", plan: item.plan, period: item.period, trialDays },
    amountMinor: q.amountMinor,
    description: checkoutDescription({ kind: "plan", plan: item.plan, period: item.period }, ws.name),
  };
}

// ── Plan changes ───────────────────────────────────────────────────────────

/** The live subscription an admin is about to change, refusing what the provider would. */
async function changeableSubscription(userId: string, workspaceId: string): Promise<WorkspaceSubscription> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const live = await getLiveSubscription(workspaceId);
  if (!live) throw conflict("This workspace has no plan to change yet.");
  if (live.status !== "active") {
    throw conflict(
      "This plan's payment needs sorting out before it can change — use Manage payment method to fix it.",
    );
  }
  return live;
}

export type PlanChangeResult = {
  kind: Exclude<PlanChangeKind, "same"> | "undone";
  plan: PaidPersonalPlan;
  period: Period;
  /** When a downgrade takes effect (the next billing date). */
  effectiveAt: string | null;
};

/**
 * Move a paid workspace to another plan or period (C3):
 *  - **up** (a bigger plan, or a longer period) now, prorated — the unused
 *    part of this period is credited, the new plan charged today, and the
 *    renewal date moves to today; a running trial ends and is charged;
 *  - **down** at the next billing date, charging nothing now — the workspace
 *    keeps the plan it paid for until then, usage carries over, no refunds;
 *  - choosing the current plan while a downgrade is waiting cancels it.
 *
 * The plan itself changes when the provider's webhook says so.
 */
export async function changePlan(userId: string, workspaceId: string, input: unknown): Promise<PlanChangeResult> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const target = parseOrThrow(changePlanSchema, input);
  const live = await changeableSubscription(userId, id);
  await purchaseContext(userId, id);
  const kind = planChangeKind(
    { plan: live.plan as PaidPersonalPlan, period: live.period },
    { plan: target.plan, period: target.period },
  );
  if (kind === "same") {
    if (live.scheduledPlan) {
      await undoScheduledChange(userId, id);
      return { kind: "undone", ...target, effectiveAt: null };
    }
    throw badRequest("This workspace is already on that plan.");
  }
  const config = requireBillingConfig();
  await dodo.changePlan(config, live.subscriptionId, {
    product_id: config.products[planSku(target.plan, target.period)],
    quantity: 1,
    ...planChangeRequest(kind),
    // An upgrade whose charge fails leaves the current plan in place instead of
    // putting the subscription on hold.
    ...(kind === "upgrade" ? { on_payment_failure: "prevent_change" as const } : {}),
    // A new choice replaces a downgrade already waiting.
    ...(live.scheduledPlan ? { cancel_scheduled_change_plan: true } : {}),
  });
  const effectiveAt = kind === "downgrade" ? live.nextBillingDate : null;
  if (kind === "downgrade") {
    // Display only — the webhook's snapshot confirms (or corrects) it.
    await getDb()
      .update(workspaceSubscriptions)
      .set({ scheduledPlan: target.plan, scheduledPeriod: target.period, scheduledAt: effectiveAt, updatedAt: new Date() })
      .where(eq(workspaceSubscriptions.id, live.id));
  }
  logger.info(`Plan ${kind} requested for a workspace`, {
    event: "billing.plan_change_requested",
    workspaceId: id,
    subscriptionId: live.subscriptionId,
    kind,
    plan: target.plan,
    period: target.period,
  });
  return { kind, ...target, effectiveAt: effectiveAt?.toISOString() ?? null };
}

/** Drop a downgrade waiting for the renewal. */
export async function undoScheduledChange(userId: string, workspaceId: string): Promise<void> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const live = await changeableSubscription(userId, id);
  if (!live.scheduledPlan) throw badRequest("There's no plan change waiting for this workspace.");
  await dodo.cancelScheduledPlanChange(requireBillingConfig(), live.subscriptionId);
  await getDb()
    .update(workspaceSubscriptions)
    .set({ scheduledPlan: null, scheduledPeriod: null, scheduledAt: null, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.id, live.id));
  logger.info("Scheduled plan change cancelled for a workspace", {
    event: "billing.plan_change_undone",
    workspaceId: id,
    subscriptionId: live.subscriptionId,
  });
}

/**
 * Cancel at the end of the period: the plan runs to the date already paid for,
 * then the workspace goes back to Free (the webhook moves it). Nothing is
 * deleted, and a trial cancelled now is never charged.
 */
export async function cancelPlan(userId: string, workspaceId: string): Promise<{ endsAt: string | null }> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  await requireWorkspaceRole(userId, id, "admin");
  const live = await getLiveSubscription(id);
  if (!live || !entitlesPlan(live.status)) throw conflict("This workspace has no plan to cancel.");
  if (live.cancelAtPeriodEnd) return { endsAt: live.nextBillingDate?.toISOString() ?? null };
  await dodo.updateSubscription(requireBillingConfig(), live.subscriptionId, { cancel_at_next_billing_date: true });
  await getDb()
    .update(workspaceSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.id, live.id));
  logger.info("Plan set to cancel at the end of its period", {
    event: "billing.cancel_requested",
    workspaceId: id,
    subscriptionId: live.subscriptionId,
  });
  return { endsAt: live.nextBillingDate?.toISOString() ?? null };
}

/**
 * Keep a plan that was set to cancel at the end of its period.
 * verify in test mode: the provider documents "revoking" a scheduled
 * cancellation only in its customer portal; `cancel_at_next_billing_date:
 * false` is the API's nullable flag for it. If the provider refuses, the error
 * points to Manage payment method (the portal), which can.
 */
export async function resumePlan(userId: string, workspaceId: string): Promise<void> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  await requireWorkspaceRole(userId, id, "admin");
  const live = await getLiveSubscription(id);
  if (!live || !live.cancelAtPeriodEnd) throw badRequest("This plan isn't set to cancel.");
  try {
    await dodo.updateSubscription(requireBillingConfig(), live.subscriptionId, { cancel_at_next_billing_date: false });
  } catch (err) {
    if (err instanceof dodo.DodoError && err.status === 409) {
      throw conflict("Couldn't undo the cancellation here — open Manage payment method and choose to keep the plan.");
    }
    throw err;
  }
  await getDb()
    .update(workspaceSubscriptions)
    .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.id, live.id));
  logger.info("Plan cancellation undone", {
    event: "billing.cancel_undone",
    workspaceId: id,
    subscriptionId: live.subscriptionId,
  });
}

/**
 * A link to the provider's customer portal for this workspace's billing
 * customer: payment methods (and recovering a failed renewal), invoices.
 * The newest subscription the workspace has had names the customer.
 */
export async function billingPortalUrl(userId: string, workspaceId: string): Promise<{ url: string }> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  await requireWorkspaceRole(userId, id, "admin");
  const [sub] = await getDb()
    .select({ customerId: workspaceSubscriptions.customerId })
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, id))
    .orderBy(desc(workspaceSubscriptions.createdAt))
    .limit(1);
  if (!sub) throw notFound("This workspace hasn't had a paid plan yet.");
  const url = await dodo.createPortalSession(
    requireBillingConfig(),
    sub.customerId,
    `${await returnOrigin()}/app/settings/billing`,
  );
  return { url };
}

// ── Billing page ───────────────────────────────────────────────────────────

export type BillingInvoice = {
  paymentId: string;
  kind: "plan" | "topup";
  status: string;
  totalAmountMinor: number;
  currency: string;
  paidAt: string;
  invoiceUrl: string | null;
  refundedMinor: number;
  disputed: boolean;
};

export type BillingWorkspace = {
  id: string;
  name: string;
  icon: string | null;
  plan: PersonalPlan;
  readOnly: boolean;
  /** The billing hold — `active` once in force; not yet while a B3 grace runs. */
  hold: { reason: BillingHold; from: string; active: boolean } | null;
  subscription: {
    plan: PersonalPlan;
    period: Period;
    status: string;
    currency: string;
    trialEndsAt: string | null;
    inTrial: boolean;
    nextBillingDate: string | null;
    cancelAtPeriodEnd: boolean;
    scheduled: { plan: PersonalPlan; period: Period; at: string | null } | null;
    /** The price the next charge is quoted at (our list price, before tax and discounts). */
    nextChargeMinor: number | null;
  } | null;
  /** Whether a customer exists for "Manage payment method". */
  hasBillingAccount: boolean;
  topUps: { remaining: number; expiresAt: string }[];
  invoices: BillingInvoice[];
};

export type BillingOverview = { workspaces: BillingWorkspace[]; purchasesBlocked: boolean };

/** Invoices shown per workspace (newest first). */
const INVOICES_SHOWN = 24;

/** Every workspace this person administers, with its plan, billing state, top-ups and invoices. */
export async function getBillingOverview(userId: string, now: Date = new Date()): Promise<BillingOverview> {
  const db = getDb();
  const [rows, [me]] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        icon: workspaces.icon,
        plan: workspaces.plan,
        billingHold: workspaces.billingHold,
        billingHoldFrom: workspaces.billingHoldFrom,
        // Qualified by hand: see `readOnlyWorkspaceSql` on bare columns.
        readOnly: readOnlyWorkspaceSql(sql`${workspaces}."id"`),
      })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.role, "admin"),
        ),
      )
      .orderBy(workspaces.createdAt),
    db.select({ blocked: users.purchasesBlockedAt }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { workspaces: [], purchasesBlocked: Boolean(me?.blocked) };

  const [subs, payments, topUps] = await Promise.all([
    db
      .select()
      .from(workspaceSubscriptions)
      .where(and(inArray(workspaceSubscriptions.workspaceId, ids), isNull(workspaceSubscriptions.supersededAt)))
      .orderBy(desc(workspaceSubscriptions.createdAt)),
    db
      .select()
      .from(billingPayments)
      .where(and(inArray(billingPayments.workspaceId, ids), ne(billingPayments.totalAmountMinor, 0)))
      .orderBy(desc(billingPayments.paidAt)),
    db
      .select({
        workspaceId: aiTopups.workspaceId,
        remaining: aiTopups.remaining,
        expiresAt: aiTopups.expiresAt,
      })
      .from(aiTopups)
      .where(
        and(
          inArray(aiTopups.workspaceId, ids),
          gt(aiTopups.remaining, 0),
          gt(aiTopups.expiresAt, now),
          isNull(aiTopups.revokedAt),
        ),
      )
      .orderBy(aiTopups.expiresAt),
  ]);

  return {
    purchasesBlocked: Boolean(me?.blocked),
    workspaces: rows.map((w) => {
      const mine = subs.filter((s) => s.workspaceId === w.id);
      const live = mine.find((s) => (LIVE_STATUSES as readonly string[]).includes(s.status)) ?? null;
      const shown = live ?? null;
      const inTrial = shown ? inTrialNow(shown, now) : false;
      const nextChargeMinor =
        shown && entitlesPlan(shown.status) && !shown.cancelAtPeriodEnd && isCurrency(shown.currency)
          ? quote(
              (shown.scheduledPlan ?? shown.plan) as PaidPersonalPlan,
              shown.scheduledPeriod ?? shown.period,
              shown.currency,
            ).priceMinor
          : null;
      return {
        id: w.id,
        name: w.name,
        icon: w.icon,
        plan: w.plan,
        readOnly: Boolean(w.readOnly),
        hold:
          w.billingHold && w.billingHoldFrom
            ? {
                reason: w.billingHold,
                from: w.billingHoldFrom.toISOString(),
                active: w.billingHoldFrom.getTime() <= now.getTime(),
              }
            : null,
        subscription: shown
          ? {
              plan: shown.plan,
              period: shown.period,
              status: shown.status,
              currency: shown.currency,
              trialEndsAt: shown.trialEndsAt?.toISOString() ?? null,
              inTrial,
              nextBillingDate: shown.nextBillingDate?.toISOString() ?? null,
              cancelAtPeriodEnd: shown.cancelAtPeriodEnd,
              scheduled: shown.scheduledPlan
                ? {
                    plan: shown.scheduledPlan,
                    period: shown.scheduledPeriod ?? shown.period,
                    at: shown.scheduledAt?.toISOString() ?? null,
                  }
                : null,
              nextChargeMinor,
            }
          : null,
        hasBillingAccount: mine.length > 0,
        topUps: topUps
          .filter((t) => t.workspaceId === w.id)
          .map((t) => ({ remaining: t.remaining, expiresAt: t.expiresAt.toISOString() })),
        invoices: payments
          .filter((p) => p.workspaceId === w.id)
          .slice(0, INVOICES_SHOWN)
          .map((p) => ({
            paymentId: p.paymentId,
            kind: p.kind,
            status: p.status,
            totalAmountMinor: p.totalAmountMinor,
            currency: p.currency,
            paidAt: p.paidAt.toISOString(),
            invoiceUrl: p.invoiceUrl,
            refundedMinor: p.refundedMinor,
            disputed: Boolean(p.disputedAt),
          })),
      };
    }),
  };
}

// ── Return page ────────────────────────────────────────────────────────────

export type CheckoutReturnStatus =
  | { state: "waiting"; item: "plan" | "topup" | null }
  | { state: "done"; item: "plan"; plan: PersonalPlan; trialEndsAt: string | null }
  | { state: "done"; item: "topup"; actions: number }
  | { state: "failed" }
  | { state: "none" };

/** How long after opening a checkout the return page still looks for it. */
const RETURN_LOOKBACK_MS = 2 * DAY_MS;

/**
 * Has the purchase this person just made for `workspaceId` landed? The return
 * page polls this — our database, never the provider — until the webhook has
 * applied it. `expect` is a plan change (no checkout session): done once the
 * workspace's subscription is on that plan and period.
 */
export async function checkoutReturnStatus(
  userId: string,
  workspaceId: string,
  expect?: { plan?: unknown; period?: unknown },
  now: Date = new Date(),
): Promise<CheckoutReturnStatus> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  await requireWorkspaceRole(userId, id, "admin");
  const db = getDb();
  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!ws) throw notFound("Workspace not found");

  const target = changePlanSchema.safeParse(expect ?? {});
  if (target.success) {
    const live = await getLiveSubscription(id);
    const done =
      live && entitlesPlan(live.status) && live.plan === target.data.plan && live.period === target.data.period;
    return done && ws.plan === target.data.plan
      ? { state: "done", item: "plan", plan: ws.plan, trialEndsAt: null }
      : { state: "waiting", item: "plan" };
  }

  const [session] = await db
    .select()
    .from(billingCheckoutSessions)
    .where(
      and(
        eq(billingCheckoutSessions.workspaceId, id),
        eq(billingCheckoutSessions.buyerUserId, userId),
        gte(billingCheckoutSessions.createdAt, new Date(now.getTime() - RETURN_LOOKBACK_MS)),
      ),
    )
    .orderBy(desc(billingCheckoutSessions.createdAt))
    .limit(1);
  if (!session) return { state: "none" };

  if (session.item === "topup") {
    const [topUp] = await db
      .select({ actions: aiTopups.actions })
      .from(aiTopups)
      .where(eq(aiTopups.checkoutSessionId, session.sessionId))
      .limit(1);
    return topUp ? { state: "done", item: "topup", actions: topUp.actions } : { state: "waiting", item: "topup" };
  }

  const [sub] = await db
    .select()
    .from(workspaceSubscriptions)
    .where(
      session.subscriptionId
        ? eq(workspaceSubscriptions.subscriptionId, session.subscriptionId)
        : eq(workspaceSubscriptions.checkoutSessionId, session.sessionId),
    )
    .limit(1);
  if (sub?.status === "failed") return { state: "failed" };
  if (sub && entitlesPlan(sub.status) && !sub.supersededAt && ws.plan === sub.plan) {
    return { state: "done", item: "plan", plan: ws.plan, trialEndsAt: sub.trialEndsAt?.toISOString() ?? null };
  }
  return { state: "waiting", item: "plan" };
}

// ── Account deletion ───────────────────────────────────────────────────────

/**
 * Before an account is erased: cancel, at once, every live subscription of a
 * workspace it owns — nothing may keep charging for a workspace that's gone.
 * A cancel the provider refuses stops the deletion (the caller turns it into
 * "try again"). No refund is made for the unused part (B4).
 */
export async function cancelSubscriptionsForAccountDeletion(userId: string): Promise<number> {
  const db = getDb();
  const live = await db
    .select({ id: workspaceSubscriptions.id, subscriptionId: workspaceSubscriptions.subscriptionId })
    .from(workspaceSubscriptions)
    .innerJoin(workspaces, eq(workspaces.id, workspaceSubscriptions.workspaceId))
    .where(
      and(
        eq(workspaces.ownerId, userId),
        inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
        isNotNull(workspaceSubscriptions.subscriptionId),
      ),
    );
  if (live.length === 0) return 0;
  const config = requireBillingConfig();
  for (const sub of live) {
    await dodo.updateSubscription(config, sub.subscriptionId, {
      status: "cancelled",
      cancel_reason: "cancelled_by_customer",
    });
    await db
      .update(workspaceSubscriptions)
      .set({ status: "cancelled", endedAt: new Date(), updatedAt: new Date() })
      .where(eq(workspaceSubscriptions.id, sub.id));
  }
  logger.info(`Cancelled ${live.length} subscription(s) before an account deletion`, {
    event: "billing.cancelled_for_deletion",
    count: live.length,
  });
  return live.length;
}
