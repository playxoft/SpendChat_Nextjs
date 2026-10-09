import "server-only";
import { and, desc, eq, gt, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  aiTopups,
  billingCheckoutSessions,
  billingPayments,
  billingRequestLog,
  billingTrialLedger,
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
  STALE_PENDING_HOURS,
  TRIAL_WINDOW_DAYS,
  cancelModeFor,
  entitlesPlan,
  planChangeKind,
  planChangeRequest,
  trialDaysFor,
  type CancelWanted,
  type PlanChangeKind,
} from "@/lib/billing-rules";
import { checkoutCurrency, checkoutQuote, checkoutRefusal, topUpQuote } from "@/lib/checkout";
import { afterResponse } from "@/lib/defer";
import * as dodo from "@/lib/dodo";
import { recipientHash } from "@/lib/email-key";
import { ApiError, badRequest, conflict, forbidden, notFound, rateLimited } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import { billingCountryFor, createCheckoutSession, returnOrigin, type CheckoutOrder } from "@/lib/payments";
import { checkoutRefusalMessage, pricingCurrencyFor } from "@/lib/plan-copy";
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
 * **Who manages a running plan.** The subscription is paid by its *buyer*
 * (whoever opened the checkout), on their card, under a provider customer of
 * their own. Only the buyer opens the payment portal, sees invoice PDFs (they
 * carry the buyer's name and address), and makes a change that could charge
 * that card (an upgrade, keeping a cancelled plan, undoing a downgrade). Any
 * admin can lower the bill — downgrade at renewal, or cancel — and so can the
 * buyer after leaving the workspace: someone removed from a workspace they pay
 * for keeps paying (the workspace keeps its plan), and their Billing page lists
 * it under "Plans you pay for" with a cancel button.
 *
 * **Nothing here changes a plan.** The plan moves only when the provider's
 * webhook confirms it (`services/billing-webhook.ts`) — not on the return
 * page, and not when a change is requested.
 */

const workspaceIdSchema = z.string().uuid("That workspace isn't valid");

/** Where the request came from — `cf-ipcountry`, for the currency and billing-country rules. */
export type CheckoutRequestContext = { country: string | null };

/** Checkouts one person may open in an hour, across workspaces. */
export const CHECKOUT_SESSIONS_PER_HOUR = 10;

/**
 * Billing actions that call the provider (checkout, plan change, cancel, keep,
 * undo, payment page) one person may make in an hour. The provider's own limit
 * (240 a minute) is for the whole business, so one person mustn't spend it.
 */
export const BILLING_CALLS_PER_HOUR = 30;

/**
 * Advisory-lock namespace for one person's billing (see the list beside
 * `BUDGET_ALERT_LOCK_NAMESPACE` in `email-quota.ts`; 90 is the webhook's
 * per-workspace lock): the hourly caps, and the trial decision through to the
 * recorded checkout, so two checkouts at once can't both take a trial (B1).
 */
const BUYER_LOCK_NAMESPACE = 91;

/** Pending trial checkouts count toward B1 for this long (a session's link lives 24 h). */
const PENDING_TRIAL_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Reader = Pick<Db, "select" | "execute"> | Tx;

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

/** The live subscription of a workspace — at most one (the partial unique index) — or null. */
export async function getLiveSubscription(workspaceId: string, db: Reader = getDb()): Promise<WorkspaceSubscription | null> {
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

/** A `pending` subscription nobody completed in a day: it no longer holds the workspace's place. */
export function isStalePending(sub: Pick<WorkspaceSubscription, "status" | "createdAt">, now: Date = new Date()): boolean {
  return sub.status === "pending" && now.getTime() - sub.createdAt.getTime() > STALE_PENDING_HOURS * HOUR_MS;
}

/** The trial ledger's key for an email — `recipientHash` (see `billing_trial_ledger`). */
export function trialLedgerKey(email: string): Promise<string> {
  return recipientHash(email);
}

/**
 * The trial a plan bought for this workspace now would start with (B1): only
 * a Free workspace's first paid plan, and only while the buyer has started
 * fewer than two trials elsewhere in the last year — counted from the trial
 * ledger by their email (it outlives a deleted account), from their own
 * subscriptions, and from trial checkouts still open (under a day old, not
 * completed), so opening several at once doesn't get round it. `startCheckout`
 * decides it again under the buyer's lock.
 */
export async function trialDaysForPurchase(
  userId: string,
  workspaceId: string,
  currentPlan: PersonalPlan,
  now: Date = new Date(),
  db: Reader = getDb(),
): Promise<number> {
  if (currentPlan !== "free") return 0;
  const [buyer] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const key = buyer?.email ? await trialLedgerKey(buyer.email) : null;
  const since = new Date(now.getTime() - TRIAL_WINDOW_DAYS * DAY_MS);
  const pendingSince = new Date(now.getTime() - PENDING_TRIAL_HOURS * HOUR_MS);
  const result = await db.execute<{ had_plan: boolean; elsewhere: string }>(sql`
    select
      (
        exists (
          select 1 from ${workspaceSubscriptions}
          where ${workspaceSubscriptions.workspaceId} = ${workspaceId}
            and ${workspaceSubscriptions.activatedAt} is not null
            and ${workspaceSubscriptions.supersededAt} is null
        )
        or exists (select 1 from ${billingTrialLedger} where ${billingTrialLedger.workspaceId} = ${workspaceId})
      ) as had_plan,
      (
        select count(distinct w)::text from (
          select ${billingTrialLedger.workspaceId} as w from ${billingTrialLedger}
          where ${billingTrialLedger.emailKey} = ${key ?? ""}
            and ${billingTrialLedger.createdAt} >= ${since}
            and ${billingTrialLedger.workspaceId} <> ${workspaceId}
          union
          select ${workspaceSubscriptions.workspaceId} from ${workspaceSubscriptions}
          where ${workspaceSubscriptions.buyerUserId} = ${userId}
            and ${workspaceSubscriptions.trialDays} > 0
            and ${workspaceSubscriptions.supersededAt} is null
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

// ── Caps ───────────────────────────────────────────────────────────────────

async function lockBuyer(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${BUYER_LOCK_NAMESPACE}, hashtext(${userId}))`);
}

function capRefusal(message: string): ApiError {
  return rateLimited(message, { bucket: "create", window: "1h", retryAfterSeconds: 15 * 60 });
}

/**
 * Count one provider-calling billing action against the person's hourly cap,
 * or refuse it (429). Counted and recorded under the person's lock, in its own
 * transaction before the provider is called — so it's exact under concurrency,
 * and a call the provider then fails still counts.
 */
export async function reserveBillingCall(userId: string, action: string, now: Date = new Date()): Promise<void> {
  await getDb().transaction(async (tx) => {
    await lockBuyer(tx, userId);
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(billingRequestLog)
      .where(and(eq(billingRequestLog.userId, userId), gte(billingRequestLog.createdAt, new Date(now.getTime() - HOUR_MS))));
    if (Number(row?.n ?? 0) >= BILLING_CALLS_PER_HOUR) {
      throw capRefusal("You've made a lot of billing changes in the last hour — try again a little later.");
    }
    await tx.insert(billingRequestLog).values({ userId, action });
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

/** Why a workspace's live subscription stops a new checkout, in words that say what to do. */
function liveRefusal(live: WorkspaceSubscription): ApiError {
  if (live.status === "paused") {
    return conflict("This workspace's plan is paused. Cancel it in Settings → Billing, then buy a new one.");
  }
  if (live.status === "pending") {
    return conflict("A payment for this workspace is still being confirmed — try again in a few minutes.");
  }
  return conflict("This workspace already has a plan. Change it from Settings → Billing.");
}

// ── Checkout ───────────────────────────────────────────────────────────────

export async function startCheckout(
  userId: string,
  workspaceId: string,
  input: unknown,
  ctx: CheckoutRequestContext = { country: null },
): Promise<{ url: string }> {
  const order = await buildCheckoutOrder(userId, workspaceId, input, ctx);
  requireBillingConfig();
  await reserveBillingCall(userId, "startCheckout");
  const now = new Date();
  let replaced: string | null = null;
  // Under the buyer's lock from the trial decision to the recorded session:
  // two checkouts at once can't both see "no trial yet" (B1), and the hourly
  // checkout cap is exact. The provider is called inside it; it's one person's
  // own request racing itself, held for one round trip.
  const session = await getDb().transaction(async (tx) => {
    await lockBuyer(tx, userId);
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(billingCheckoutSessions)
      .where(
        and(
          eq(billingCheckoutSessions.buyerUserId, userId),
          gte(billingCheckoutSessions.createdAt, new Date(now.getTime() - HOUR_MS)),
        ),
      );
    if (Number(row?.n ?? 0) >= CHECKOUT_SESSIONS_PER_HOUR) {
      throw capRefusal("You've opened checkout a lot in the last hour — try again a little later.");
    }
    if (order.line.kind === "plan") {
      const live = await getLiveSubscription(order.workspace.id, tx);
      if (live && !isStalePending(live, now)) throw liveRefusal(live);
      if (live) {
        // A `pending` subscription nobody finished in a day gives its place up.
        await tx
          .update(workspaceSubscriptions)
          .set({ supersededAt: now, voidReason: "stale_pending", cancelWanted: "now", updatedAt: now })
          .where(eq(workspaceSubscriptions.id, live.id));
        replaced = live.subscriptionId;
      }
      const [ws] = await tx.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, order.workspace.id));
      order.line.trialDays = await trialDaysForPurchase(userId, order.workspace.id, ws?.plan ?? "free", now, tx);
    }
    const created = await createCheckoutSession(order);
    // Recorded before the buyer is sent anywhere: a URL we didn't record would
    // be a payment the webhook couldn't tie to a workspace.
    await tx.insert(billingCheckoutSessions).values({
      sessionId: created.sessionId,
      workspaceId: order.workspace.id,
      buyerUserId: userId,
      item: order.line.kind,
      plan: order.line.kind === "plan" ? order.line.plan : null,
      period: order.line.kind === "plan" ? order.line.period : null,
      productId: created.productId,
      expectedAmountMinor: order.amountMinor,
      currency: order.currency,
      trialDays: order.line.kind === "plan" ? order.line.trialDays : 0,
    });
    return created;
  });
  if (replaced) cancelLater(replaced, "now", "a stale pending subscription a new checkout replaced");
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

/**
 * Everything `startCheckout` checks and prices, up to the provider call —
 * split out so the order it would send can be tested without one. The trial
 * here is what the page shows; `startCheckout` decides it again under the
 * buyer's lock.
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
  if (item.item === "plan") {
    const live = await getLiveSubscription(id);
    if (live && !isStalePending(live)) throw liveRefusal(live);
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
    };
  }

  const q = checkoutQuote(item.plan, item.period, currency);
  return {
    ...base,
    line: { kind: "plan", plan: item.plan, period: item.period, trialDays: await trialDaysForPurchase(userId, id, ws.plan) },
    amountMinor: q.amountMinor,
  };
}

// ── Asking the provider to cancel ──────────────────────────────────────────

/** The provider call for a cancellation, by how it's wanted (`cancelModeFor`). */
export async function cancelWithProvider(subscriptionId: string, mode: CancelWanted): Promise<void> {
  await dodo.updateSubscription(
    requireBillingConfig(),
    subscriptionId,
    mode === "now" ? { status: "cancelled", cancel_reason: "cancelled_by_merchant" } : { cancel_at_next_billing_date: true },
  );
}

/**
 * A cancellation we owe the provider, tried once the response is sent. It's
 * also recorded on the row (`cancel_wanted`), and the webhook tries again on
 * every later event for the subscription until it's no longer live — so a
 * failure here is retried, never lost.
 */
export function cancelLater(subscriptionId: string, mode: CancelWanted, why: string): void {
  afterResponse("billing.cancel", async () => {
    try {
      await cancelWithProvider(subscriptionId, mode);
      logger.info(`Asked the provider to cancel a subscription: ${why}`, {
        event: "billing.cancel_sent",
        subscriptionId,
        mode,
      });
    } catch (err) {
      logger.warn(`Couldn't cancel a subscription (${why}) — the next event for it retries: ${describeError(err)}`, {
        event: "billing.cancel_failed",
        subscriptionId,
        mode,
      });
    }
  });
}

// ── Who manages a subscription ─────────────────────────────────────────────

/** The buyer's display name, or null when their account is gone. */
async function buyerName(sub: WorkspaceSubscription): Promise<string | null> {
  if (!sub.buyerUserId) return null;
  const [row] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, sub.buyerUserId));
  return row?.name?.trim() || row?.email || null;
}

/** 403 for an admin who isn't the buyer: the card, portal and invoices are the buyer's. */
async function notTheBuyer(sub: WorkspaceSubscription, what: string): Promise<ApiError> {
  const name = await buyerName(sub);
  return forbidden(
    name
      ? `Billing for this workspace is managed by ${name} — only they can ${what}, since it's their payment method.`
      : `The person who paid for this plan no longer has an account, so its payment can't be ${what === "open the payment page" ? "managed" : "changed"} here. Cancel it, then buy the plan again.`,
  );
}

/** The buyer only — for anything that could charge their card or shows their payment details. */
async function requireBuyer(userId: string, sub: WorkspaceSubscription, what: string): Promise<void> {
  if (sub.buyerUserId !== userId) throw await notTheBuyer(sub, what);
}

/** A workspace admin, or the subscription's buyer (who may have left the workspace). */
async function requireAdminOrBuyer(userId: string, workspaceId: string, sub: WorkspaceSubscription | null): Promise<void> {
  if (sub?.buyerUserId === userId) return;
  await requireWorkspaceRole(userId, workspaceId, "admin");
}

// ── Plan changes ───────────────────────────────────────────────────────────

/** The live subscription an admin is about to change, refusing what the provider would. */
async function changeableSubscription(userId: string, workspaceId: string): Promise<WorkspaceSubscription> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const live = await getLiveSubscription(workspaceId);
  if (!live) throw conflict("This workspace has no plan to change yet.");
  if (live.status !== "active") {
    throw conflict(
      live.status === "paused" || live.status === "pending"
        ? "This plan isn't running, so it can't change — cancel it in Settings → Billing and buy the plan you want."
        : "This plan's payment needs sorting out before it can change — use Manage payment method to fix it.",
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
 *    renewal date moves to today; a running trial ends and is charged. It
 *    charges the buyer's card, so only the buyer can;
 *  - **down** at the next billing date, charging nothing now — the workspace
 *    keeps the plan it paid for until then, usage carries over, no refunds.
 *    Any admin can;
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
  if (kind === "upgrade") await requireBuyer(userId, live, "upgrade it");
  const config = requireBillingConfig();
  await reserveBillingCall(userId, "changePlan");
  const now = new Date();
  if (kind === "upgrade") {
    // Before the call: a failed charge that lands after it is the upgrade failing (the return page).
    await getDb()
      .update(workspaceSubscriptions)
      .set({ changeRequestedAt: now, updatedAt: now })
      .where(eq(workspaceSubscriptions.id, live.id));
  }
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
      .set({ scheduledPlan: target.plan, scheduledPeriod: target.period, scheduledAt: effectiveAt, updatedAt: now })
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

/** Drop a downgrade waiting for the renewal — it raises the next charge, so the buyer only. */
export async function undoScheduledChange(userId: string, workspaceId: string): Promise<void> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const live = await changeableSubscription(userId, id);
  if (!live.scheduledPlan) throw badRequest("There's no plan change waiting for this workspace.");
  await requireBuyer(userId, live, "keep the current plan");
  const config = requireBillingConfig();
  await reserveBillingCall(userId, "undoScheduledPlanChange");
  await dodo.cancelScheduledPlanChange(config, live.subscriptionId);
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
 * Cancel a workspace's plan. An `active` plan runs to the end of the period
 * already paid for, then the workspace goes back to Free (the webhook moves
 * it); a trial cancelled now is never charged. A plan that isn't running —
 * payment failed (`on_hold`, `past_due`), `paused`, `pending` — has no paid
 * period left to run out, so it ends **now**. Nothing in the workspace is
 * deleted. Any admin may, and so may the buyer after leaving the workspace.
 */
export async function cancelPlan(
  userId: string,
  workspaceId: string,
): Promise<{ endsAt: string | null; immediate: boolean }> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const live = await getLiveSubscription(id);
  await requireAdminOrBuyer(userId, id, live);
  if (!live) throw conflict("This workspace has no plan to cancel.");
  const mode = cancelModeFor(live.status);
  if (mode === "period_end" && live.cancelAtPeriodEnd) {
    return { endsAt: live.nextBillingDate?.toISOString() ?? null, immediate: false };
  }
  requireBillingConfig();
  await reserveBillingCall(userId, "cancelPlan");
  await cancelWithProvider(live.subscriptionId, mode);
  await getDb()
    .update(workspaceSubscriptions)
    .set(mode === "now" ? { cancelWanted: "now", updatedAt: new Date() } : { cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.id, live.id));
  logger.info(mode === "now" ? "Plan cancelled now (it wasn't running)" : "Plan set to cancel at the end of its period", {
    event: "billing.cancel_requested",
    workspaceId: id,
    subscriptionId: live.subscriptionId,
    mode,
  });
  return { endsAt: mode === "now" ? null : (live.nextBillingDate?.toISOString() ?? null), immediate: mode === "now" };
}

/**
 * Keep a plan that was set to cancel at the end of its period — it charges
 * again at renewal, so the buyer only.
 * verify in test mode: the provider documents "revoking" a scheduled
 * cancellation only in its customer portal; `cancel_at_next_billing_date:
 * false` is the API's nullable flag for it. If the provider refuses, the error
 * points to Manage payment method (the portal), which can.
 */
export async function resumePlan(userId: string, workspaceId: string): Promise<void> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  await requireWorkspaceRole(userId, id, "admin");
  const live = await getLiveSubscription(id);
  if (!live || !live.cancelAtPeriodEnd || live.status !== "active") throw badRequest("This plan isn't set to cancel.");
  if (live.cancelWanted) throw conflict("This plan is being cancelled and can't be kept — buy it again once it ends.");
  await requireBuyer(userId, live, "keep the plan");
  const config = requireBillingConfig();
  await reserveBillingCall(userId, "resumePlan");
  try {
    await dodo.updateSubscription(config, live.subscriptionId, { cancel_at_next_billing_date: false });
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
 * A link to the provider's customer portal for this workspace's plan: payment
 * method (and recovering a failed renewal), invoices. **The buyer's only** —
 * it shows their cards and billing address. Each checkout makes its own
 * provider customer, so the portal never shows another workspace's billing.
 */
export async function billingPortalUrl(userId: string, workspaceId: string): Promise<{ url: string }> {
  const id = parseOrThrow(workspaceIdSchema, workspaceId);
  const [sub] = await getDb()
    .select()
    .from(workspaceSubscriptions)
    .where(and(eq(workspaceSubscriptions.workspaceId, id), isNull(workspaceSubscriptions.supersededAt)))
    .orderBy(desc(workspaceSubscriptions.createdAt))
    .limit(1);
  await requireAdminOrBuyer(userId, id, sub ?? null);
  if (!sub) throw notFound("This workspace hasn't had a paid plan yet.");
  await requireBuyer(userId, sub, "open the payment page");
  const config = requireBillingConfig();
  await reserveBillingCall(userId, "openBillingPortal");
  const url = await dodo.createPortalSession(config, sub.customerId, `${await returnOrigin()}/app/settings/billing`);
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
  /** The PDF — the buyer's name and address are on it, so only the buyer gets the link. */
  invoiceUrl: string | null;
  refundedMinor: number;
  disputed: boolean;
};

export type BillingSubscriptionView = {
  plan: PersonalPlan;
  period: Period;
  status: string;
  currency: string;
  trialEndsAt: string | null;
  inTrial: boolean;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  /** A cancellation already on its way (account deletion, a lost dispute, a void plan). */
  cancelling: boolean;
  scheduled: { plan: PersonalPlan; period: Period; at: string | null } | null;
  /**
   * The next charge before tax: what the provider bills each renewal (discounts
   * included) — or, with a change waiting, the new plan's list price.
   */
  nextCharge: { amountMinor: number; beforeDiscounts: boolean } | null;
  /** Who pays: this person, or someone else (null name: their account is gone). */
  buyer: { isMe: boolean; name: string | null; inWorkspace: boolean };
};

export type BillingWorkspace = {
  id: string;
  name: string;
  icon: string | null;
  plan: PersonalPlan;
  readOnly: boolean;
  /** The billing hold — `active` once in force; not yet while a B3 grace runs. */
  hold: { reason: BillingHold; from: string; active: boolean } | null;
  subscription: BillingSubscriptionView | null;
  topUps: { remaining: number; expiresAt: string }[];
  invoices: BillingInvoice[];
};

/** A plan this person pays for in a workspace they no longer administer. */
export type PaidElsewhere = { workspaceId: string; workspaceName: string; subscription: BillingSubscriptionView };

export type BillingOverview = {
  workspaces: BillingWorkspace[];
  paidElsewhere: PaidElsewhere[];
  purchasesBlocked: boolean;
};

/** Invoices shown per workspace (newest first). */
const INVOICES_SHOWN = 24;

/**
 * Every workspace this person administers, with its plan, billing state,
 * top-ups and invoices — plus any plan they pay for in a workspace they no
 * longer administer (removed, or demoted), so it's never paid for unseen.
 */
export async function getBillingOverview(userId: string, now: Date = new Date()): Promise<BillingOverview> {
  const db = getDb();
  const [rows, [me], mine] = await Promise.all([
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
    // Live plans this person pays for, anywhere.
    db
      .select({ sub: workspaceSubscriptions, workspaceName: workspaces.name })
      .from(workspaceSubscriptions)
      .innerJoin(workspaces, eq(workspaces.id, workspaceSubscriptions.workspaceId))
      .where(
        and(
          eq(workspaceSubscriptions.buyerUserId, userId),
          inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
          isNull(workspaceSubscriptions.supersededAt),
        ),
      ),
  ]);
  const ids = rows.map((r) => r.id);
  const elsewhere = mine.filter((m) => !ids.includes(m.sub.workspaceId));

  const [subs, payments, topUps, members] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(workspaceSubscriptions)
          .where(
            and(
              inArray(workspaceSubscriptions.workspaceId, ids),
              inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
              isNull(workspaceSubscriptions.supersededAt),
            ),
          )
      : Promise.resolve([] as WorkspaceSubscription[]),
    ids.length
      ? db
          .select()
          .from(billingPayments)
          .where(and(inArray(billingPayments.workspaceId, ids), ne(billingPayments.totalAmountMinor, 0)))
          .orderBy(desc(billingPayments.paidAt))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ workspaceId: aiTopups.workspaceId, remaining: aiTopups.remaining, expiresAt: aiTopups.expiresAt })
          .from(aiTopups)
          .where(
            and(
              inArray(aiTopups.workspaceId, ids),
              gt(aiTopups.remaining, 0),
              gt(aiTopups.expiresAt, now),
              isNull(aiTopups.revokedAt),
            ),
          )
          .orderBy(aiTopups.expiresAt)
      : Promise.resolve([]),
    // Buyers of these plans: their names, and whether they're still members.
    ids.length
      ? db
          .select({ workspaceId: workspaceSubscriptions.workspaceId, userId: users.id, name: users.name, email: users.email, member: workspaceMembers.userId })
          .from(workspaceSubscriptions)
          .innerJoin(users, eq(users.id, workspaceSubscriptions.buyerUserId))
          .leftJoin(
            workspaceMembers,
            and(eq(workspaceMembers.workspaceId, workspaceSubscriptions.workspaceId), eq(workspaceMembers.userId, users.id)),
          )
          .where(
            and(
              inArray(workspaceSubscriptions.workspaceId, ids),
              inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
              isNull(workspaceSubscriptions.supersededAt),
            ),
          )
      : Promise.resolve([]),
  ]);

  const view = (s: WorkspaceSubscription): BillingSubscriptionView => {
    const buyer = members.find((m) => m.workspaceId === s.workspaceId && m.userId === s.buyerUserId);
    const scheduled = s.scheduledPlan
      ? { plan: s.scheduledPlan, period: s.scheduledPeriod ?? s.period, at: s.scheduledAt?.toISOString() ?? null }
      : null;
    const charging = entitlesPlan(s.status) && !s.cancelAtPeriodEnd && !s.cancelWanted;
    let nextCharge: BillingSubscriptionView["nextCharge"] = null;
    if (charging && scheduled && isCurrency(s.currency)) {
      nextCharge = { amountMinor: quote(scheduled.plan as PaidPersonalPlan, scheduled.period, s.currency).priceMinor, beforeDiscounts: true };
    } else if (charging && s.recurringAmountMinor != null) {
      nextCharge = { amountMinor: s.recurringAmountMinor, beforeDiscounts: false };
    } else if (charging && isCurrency(s.currency)) {
      nextCharge = { amountMinor: quote(s.plan as PaidPersonalPlan, s.period, s.currency).priceMinor, beforeDiscounts: true };
    }
    return {
      plan: s.plan,
      period: s.period,
      status: s.status,
      currency: s.currency,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
      inTrial: inTrialNow(s, now),
      nextBillingDate: s.nextBillingDate?.toISOString() ?? null,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      cancelling: Boolean(s.cancelWanted),
      scheduled,
      nextCharge,
      buyer: {
        isMe: s.buyerUserId === userId,
        name: s.buyerUserId === userId ? null : buyer?.name?.trim() || buyer?.email || null,
        inWorkspace: s.buyerUserId === userId ? true : Boolean(buyer?.member),
      },
    };
  };

  return {
    purchasesBlocked: Boolean(me?.blocked),
    paidElsewhere: elsewhere.map((m) => ({
      workspaceId: m.sub.workspaceId,
      workspaceName: m.workspaceName,
      subscription: view(m.sub),
    })),
    workspaces: rows.map((w) => {
      const live = subs.find((s) => s.workspaceId === w.id) ?? null;
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
        subscription: live ? view(live) : null,
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
            invoiceUrl: p.buyerUserId === userId ? p.invoiceUrl : null,
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
  | { state: "failed"; reason: "payment" | "amount" | "change" }
  | { state: "none" };

/** How long after opening a checkout the return page still looks for it. */
const RETURN_LOOKBACK_MS = 2 * DAY_MS;

/** Payment states that mean "this didn't go through". */
const FAILED_PAYMENT = ["failed", "cancelled"];

/**
 * Has the purchase this person just made for `workspaceId` landed? The return
 * page polls this — our database, never the provider — until the webhook has
 * applied it, or says it failed: a payment that failed or was cancelled, a
 * top-up whose amount didn't match (A3), a subscription whose first mandate
 * failed, or an upgrade whose charge failed (it keeps the old plan). `expect`
 * is a plan change (no checkout session): done once the workspace's
 * subscription is on that plan and period.
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
    if (done && ws.plan === target.data.plan) return { state: "done", item: "plan", plan: ws.plan, trialEndsAt: null };
    if (live?.changeRequestedAt) {
      const [failed] = await db
        .select({ id: billingPayments.id })
        .from(billingPayments)
        .where(
          and(
            eq(billingPayments.subscriptionId, live.subscriptionId),
            inArray(billingPayments.status, FAILED_PAYMENT),
            gte(billingPayments.updatedAt, live.changeRequestedAt),
          ),
        )
        .limit(1);
      if (failed) return { state: "failed", reason: "change" };
    }
    return { state: "waiting", item: "plan" };
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

  const payments = await db
    .select({ status: billingPayments.status })
    .from(billingPayments)
    .where(eq(billingPayments.checkoutSessionId, session.sessionId));
  const paid = payments.some((p) => p.status === "succeeded");
  const paymentFailed = !paid && payments.some((p) => FAILED_PAYMENT.includes(p.status));

  if (session.item === "topup") {
    const [topUp] = await db
      .select({ actions: aiTopups.actions })
      .from(aiTopups)
      .where(eq(aiTopups.checkoutSessionId, session.sessionId))
      .limit(1);
    if (topUp) return { state: "done", item: "topup", actions: topUp.actions };
    if (paymentFailed) return { state: "failed", reason: "payment" };
    // Paid, recorded, and still nothing granted: the amount didn't match (A3).
    if (paid && session.completedAt) return { state: "failed", reason: "amount" };
    return { state: "waiting", item: "topup" };
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
  if (sub && (sub.status === "failed" || sub.supersededAt)) return { state: "failed", reason: "payment" };
  if (sub && entitlesPlan(sub.status) && ws.plan === sub.plan) {
    return { state: "done", item: "plan", plan: ws.plan, trialEndsAt: sub.trialEndsAt?.toISOString() ?? null };
  }
  if (paymentFailed) return { state: "failed", reason: "payment" };
  return { state: "waiting", item: "plan" };
}

// ── Account deletion ───────────────────────────────────────────────────────

/** Live subscriptions an account deletion must stop: the ones this person pays for, and their own workspaces'. */
async function subscriptionsToStopFor(userId: string): Promise<WorkspaceSubscription[]> {
  const db = getDb();
  const owned = db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId));
  return db
    .select()
    .from(workspaceSubscriptions)
    .where(
      and(
        inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
        isNull(workspaceSubscriptions.supersededAt),
        or(eq(workspaceSubscriptions.buyerUserId, userId), inArray(workspaceSubscriptions.workspaceId, owned)),
      ),
    );
}

/**
 * Step one of erasing an account: stop every plan it pays for (in anyone's
 * workspace) and every plan on a workspace it owns — **before** anything is
 * deleted, and only in a way that's safe if the deletion then fails.
 *
 * A running (`active`) plan is set to cancel **at the end of its period**:
 * nothing more is charged, the period already paid for runs out, and it's
 * reversible — if the deletion's transaction fails, the account is still
 * there with its plans merely "cancelling", which "Keep plan" undoes; nothing
 * irreversible happened to an account that still exists. It's idempotent, so
 * a retried deletion just asks again. A plan that isn't running (payment
 * failed, paused, pending) has nothing to run out and can't be cancelled "at
 * period end", so it's marked `cancel_wanted = 'now'` in the deletion's own
 * transaction and cancelled once that commits (`cancelLater`) — and on every
 * later event for it until it's gone, so a failed call is never lost.
 *
 * A provider refusal stops the deletion here ("try again"), before anything
 * is erased. No refund is made for the unused part (B4).
 */
export async function prepareBillingForAccountDeletion(userId: string): Promise<WorkspaceSubscription[]> {
  const subs = await subscriptionsToStopFor(userId);
  const running = subs.filter((s) => s.status === "active" && !s.cancelAtPeriodEnd);
  if (running.length > 0) {
    requireBillingConfig();
    for (const sub of running) {
      await cancelWithProvider(sub.subscriptionId, "period_end");
      await getDb()
        .update(workspaceSubscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(workspaceSubscriptions.id, sub.id));
    }
  }
  if (subs.length > 0) {
    logger.info(`Stopping ${subs.length} plan(s) before an account deletion`, {
      event: "billing.stopping_for_deletion",
      count: subs.length,
    });
  }
  return subs;
}

/**
 * Step two, inside the deletion's transaction: mark every plan from step one
 * as cancelling (`cancel_wanted` — the durable record that it must end), and
 * forget the buyer. The rows stay, so the webhook can still place them and
 * settle each workspace back to Free when its plan ends; a workspace that
 * survives (someone else's) keeps its history, with nobody's name on it.
 */
export async function forgetBuyerInTransaction(tx: Tx, userId: string, subs: WorkspaceSubscription[]): Promise<void> {
  for (const sub of subs) {
    await tx
      .update(workspaceSubscriptions)
      .set({ cancelWanted: cancelModeFor(sub.status, sub.cancelWanted === "now" ? "now" : "period_end"), updatedAt: new Date() })
      .where(eq(workspaceSubscriptions.id, sub.id));
  }
  await tx
    .update(workspaceSubscriptions)
    .set({ buyerUserId: null, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.buyerUserId, userId));
  await tx.update(billingPayments).set({ buyerUserId: null }).where(eq(billingPayments.buyerUserId, userId));
}

/** Step three, after the deletion commits: end the plans that weren't running. */
export function finishBillingAfterAccountDeletion(subs: WorkspaceSubscription[]): void {
  for (const sub of subs) {
    if (sub.status !== "active") cancelLater(sub.subscriptionId, "now", "an account deletion");
  }
}
