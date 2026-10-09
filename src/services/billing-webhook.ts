import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiTopups,
  billingCheckoutSessions,
  billingPayments,
  billingWebhookEvents,
  users,
  workspaceSubscriptions,
  workspaces,
  type BillingCheckoutSession,
  type WorkspaceSubscription,
} from "@/db/schema";
import { planOfProduct } from "@/lib/billing-catalog";
import { readBillingConfig, type BillingConfig } from "@/lib/billing-config";
import {
  DISPUTES_BEFORE_BLOCK,
  LIVE_STATUSES,
  checkTopUpPayment,
  disputeHolds,
  entitlesPlan,
  failedPaymentHold,
  isFailingStatus,
  isLiveStatus,
  workspacePlanFor,
} from "@/lib/billing-rules";
import { afterResponse } from "@/lib/defer";
import * as dodo from "@/lib/dodo";
import {
  disputeSchema,
  eventSchema,
  metaString,
  paymentSchema,
  refundSchema,
  subscriptionSchema,
  type DodoEvent,
  type DodoPayment,
  type DodoSubscription,
} from "@/lib/dodo-payloads";
import { describeError, logger } from "@/lib/logger";
import { setLogContext } from "@/lib/log-context";
import { TOPUP } from "@/lib/plans";
import { verifyStandardWebhook } from "@/lib/webhook-signature";

/**
 * The payment provider's webhooks — **the only place a workspace's plan
 * changes**, a top-up is granted, or billing makes a workspace view-only.
 *
 * Each delivery is:
 *  1. verified (Standard Webhooks HMAC over the raw body, 5-minute tolerance)
 *     — anything else is refused with no detail;
 *  2. applied **once**: the event id is recorded in `billing_webhook_events`
 *     in the same transaction as its change, so a retry of an applied event
 *     changes nothing, and a failed one leaves no trace and is applied in full
 *     when the provider retries;
 *  3. mapped to a workspace through **our** rows — the checkout session we
 *     recorded, or the subscription or payment we already know — never through
 *     the provider's metadata alone (metadata is only trusted when it names a
 *     checkout we opened for that workspace, buyer and product). A
 *     subscription we can't place yet is answered 503 so the provider retries
 *     after the payment event that ties it to its checkout.
 *
 * Done synchronously (a few queries, well inside the 30 s delivery timeout):
 * an error must reach the provider as a non-2xx, or it would never retry.
 *
 * Subscription events carry the subscription's full current state and are
 * applied as a snapshot; one older than the newest applied is skipped, since
 * deliveries can arrive out of order.
 *
 * Abuse rules applied here: A3 (a top-up is granted only for at least the
 * amount we priced, for the workspace we priced it for), B2 (a dispute holds
 * the workspace view-only at once; a person's second blocks their purchases),
 * B3 (a renewal that finally fails leaves 7 days — once per 3 months — before
 * view-only), C3 (a downgrade arrives as a `plan_changed` at the renewal), C4
 * (top-ups: 500 actions for 12 months; a refund or dispute takes back what's
 * left).
 */

/** A delivery to answer 503 so the provider retries it later. */
export class RetryLater extends Error {}

/** Advisory-lock namespace for one workspace's billing changes (see the list in `email-quota.ts`). */
const BILLING_LOCK_NAMESPACE = 90;

/** How old a checkout may be and still claim a subscription through its metadata. */
const SESSION_CLAIM_MS = 3 * 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type Ctx = { tx: Tx; config: BillingConfig; event: DodoEvent; eventId: string; eventAt: Date };

const respond = (status: number, text = "") =>
  new Response(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });

/**
 * Verify, de-duplicate and apply one delivery; the HTTP answer for the
 * provider. 200 = applied or deliberately ignored, 401 = not from the
 * provider, 400 = signed but unreadable, 503 = retry later.
 */
export async function handleDodoWebhook(rawBody: string, headers: Pick<Headers, "get">): Promise<Response> {
  const configResult = readBillingConfig();
  if (!configResult.ok) {
    logger.error("A billing webhook arrived but billing isn't configured on this server", {
      event: "billing.webhook_unconfigured",
    });
    return respond(503);
  }
  const config = configResult.config;

  if (!(await verifyStandardWebhook(rawBody, headers, config.webhookKey))) {
    logger.warn("Refused a billing webhook whose signature didn't verify", { event: "billing.webhook_bad_signature" });
    return respond(401);
  }
  const eventId = headers.get("webhook-id")!;

  let event: DodoEvent;
  try {
    event = eventSchema.parse(JSON.parse(rawBody));
  } catch {
    logger.error("A signed billing webhook couldn't be read", { event: "billing.webhook_unreadable", eventId });
    return respond(400);
  }
  const eventAt = new Date(event.timestamp);
  if (Number.isNaN(eventAt.getTime())) {
    logger.error("A signed billing webhook had no usable timestamp", { event: "billing.webhook_unreadable", eventId });
    return respond(400);
  }

  const db = getDb();
  const [seen] = await db
    .select({ id: billingWebhookEvents.id })
    .from(billingWebhookEvents)
    .where(eq(billingWebhookEvents.id, eventId))
    .limit(1);
  if (seen) {
    logger.info(`Billing webhook ${event.type} was already applied — ignored the repeat`, {
      event: "billing.webhook_duplicate",
      eventId,
      type: event.type,
    });
    return respond(200);
  }

  try {
    const applied = await db.transaction(async (tx) => {
      // Two copies of one delivery racing: the second waits on this insert and
      // then finds it taken, so it applies nothing.
      const [claimed] = await tx
        .insert(billingWebhookEvents)
        .values({ id: eventId, type: event.type })
        .onConflictDoNothing()
        .returning({ id: billingWebhookEvents.id });
      if (!claimed) return false;
      await dispatch({ tx, config, event, eventId, eventAt });
      return true;
    });
    if (!applied) {
      logger.info(`Billing webhook ${event.type} was applied by a parallel delivery`, {
        event: "billing.webhook_duplicate",
        eventId,
        type: event.type,
      });
    }
    return respond(200);
  } catch (err) {
    if (err instanceof RetryLater) {
      logger.warn(`Billing webhook ${event.type} can't be placed yet — asked the provider to retry: ${err.message}`, {
        event: "billing.webhook_retry",
        eventId,
        type: event.type,
      });
      return respond(503);
    }
    logger.error(`Billing webhook ${event.type} failed: ${describeError(err)}`, {
      event: "billing.webhook_failed",
      eventId,
      type: event.type,
      error: err instanceof Error ? err : String(err),
    });
    return respond(500);
  }
}

async function dispatch(ctx: Ctx): Promise<void> {
  const type = ctx.event.type;
  if (type.startsWith("subscription.")) return applySubscription(ctx, subscriptionSchema.parse(ctx.event.data));
  if (type.startsWith("payment.")) return applyPayment(ctx, paymentSchema.parse(ctx.event.data));
  if (type === "refund.succeeded") return applyRefund(ctx);
  if (type.startsWith("dispute.")) return applyDispute(ctx);
  logger.info(`Billing webhook ${type} needs nothing from us — acknowledged`, {
    event: "billing.webhook_ignored",
    eventId: ctx.eventId,
    type,
  });
}

/** Serialize one workspace's billing changes (two events for it at once). */
async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${BILLING_LOCK_NAMESPACE}, hashtext(${workspaceId}))`);
}

// ── Subscriptions ──────────────────────────────────────────────────────────

type Placement = { workspaceId: string; buyerUserId: string; session: BillingCheckoutSession | null };

/**
 * Which workspace a subscription belongs to: the row we already have; else the
 * checkout a payment event tied it to; else its metadata, but only when it
 * names a plan checkout we opened for that workspace, buyer and product, not
 * yet claimed and under 3 days old.
 */
async function placeSubscription(
  tx: Tx,
  sub: DodoSubscription,
  existing: WorkspaceSubscription | undefined,
  now: Date,
): Promise<Placement | null> {
  if (existing) return { workspaceId: existing.workspaceId, buyerUserId: existing.buyerUserId, session: null };

  const [linked] = await tx
    .select()
    .from(billingCheckoutSessions)
    .where(eq(billingCheckoutSessions.subscriptionId, sub.subscription_id))
    .limit(1);
  if (linked) return { workspaceId: linked.workspaceId, buyerUserId: linked.buyerUserId, session: linked };

  const workspaceId = metaString(sub.metadata, "workspace_id");
  const buyerUserId = metaString(sub.metadata, "buyer_user_id");
  if (!workspaceId || !buyerUserId || !isUuid(workspaceId) || !isUuid(buyerUserId)) return null;
  const [claimable] = await tx
    .select()
    .from(billingCheckoutSessions)
    .where(
      and(
        eq(billingCheckoutSessions.workspaceId, workspaceId),
        eq(billingCheckoutSessions.buyerUserId, buyerUserId),
        eq(billingCheckoutSessions.item, "plan"),
        eq(billingCheckoutSessions.productId, sub.product_id),
        isNull(billingCheckoutSessions.subscriptionId),
        gte(billingCheckoutSessions.createdAt, new Date(now.getTime() - SESSION_CLAIM_MS)),
      ),
    )
    .orderBy(desc(billingCheckoutSessions.createdAt))
    .limit(1);
  return claimable ? { workspaceId, buyerUserId, session: claimable } : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function dateOrNull(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function applySubscription(ctx: Ctx, sub: DodoSubscription): Promise<void> {
  const { tx, config, eventAt } = ctx;
  const now = new Date();
  const [existing] = await tx
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.subscriptionId, sub.subscription_id))
    .limit(1);
  const placed = await placeSubscription(tx, sub, existing, now);
  if (!placed) throw new RetryLater("no checkout or subscription row matches it yet");
  setLogContext({ workspaceId: placed.workspaceId });
  await lockWorkspace(tx, placed.workspaceId);

  // Re-read under the lock: a parallel event may have just written it.
  const [current] = existing
    ? await tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.id, existing.id)).limit(1)
    : await tx
        .select()
        .from(workspaceSubscriptions)
        .where(eq(workspaceSubscriptions.subscriptionId, sub.subscription_id))
        .limit(1);
  if (current?.lastEventAt && eventAt.getTime() < current.lastEventAt.getTime()) {
    logger.info(`Skipped an out-of-order ${ctx.event.type} — a newer state is already applied`, {
      event: "billing.webhook_stale",
      eventId: ctx.eventId,
      subscriptionId: sub.subscription_id,
    });
    return;
  }

  const sells = planOfProduct(config.products, sub.product_id);
  if (!sells && !current) {
    // Not a product in DODO_PRODUCTS: nothing to grant. Retrying won't help —
    // fix the config, then replay the event from the provider's dashboard.
    logger.error(`A subscription for an unknown product arrived — nothing changed`, {
      event: "billing.unknown_product",
      eventId: ctx.eventId,
      subscriptionId: sub.subscription_id,
      productId: sub.product_id,
    });
    return;
  }
  const plan = sells?.plan ?? current!.plan;
  const period = sells?.period ?? current!.period;
  if (!sells) {
    logger.error(`A subscription moved to an unknown product — kept its last known plan`, {
      event: "billing.unknown_product",
      eventId: ctx.eventId,
      subscriptionId: sub.subscription_id,
      productId: sub.product_id,
    });
  }

  const status = sub.status;
  const scheduled = sub.scheduled_change ? planOfProduct(config.products, sub.scheduled_change.product_id) : null;
  const createdAt = dateOrNull(sub.created_at) ?? eventAt;
  const trialDays = current?.trialDays ?? sub.trial_period_days;
  if (!current && placed.session && placed.session.trialDays !== sub.trial_period_days) {
    // verify in test mode: the checkout's `subscription_data.trial_period_days`
    // should override the product's 21 days. The provider's number is what
    // happened, so it's the one kept (and counted for B1) — but say so.
    logger.warn(
      `A subscription started with a ${sub.trial_period_days}-day trial where its checkout asked for ${placed.session.trialDays}`,
      { event: "billing.trial_mismatch", eventId: ctx.eventId, subscriptionId: sub.subscription_id },
    );
  }
  const fields = {
    customerId: sub.customer.customer_id,
    productId: sub.product_id,
    plan,
    period,
    currency: sub.currency.toUpperCase(),
    status,
    nextBillingDate: dateOrNull(sub.next_billing_date),
    cancelAtPeriodEnd: sub.cancel_at_next_billing_date,
    scheduledPlan: scheduled?.plan ?? null,
    scheduledPeriod: scheduled?.period ?? null,
    scheduledAt: scheduled && sub.scheduled_change ? dateOrNull(sub.scheduled_change.effective_at) : null,
    activatedAt: current?.activatedAt ?? (entitlesPlan(status) ? eventAt : null),
    paymentFailedAt: isFailingStatus(status) ? (current?.paymentFailedAt ?? eventAt) : null,
    endedAt: isLiveStatus(status) ? null : (current?.endedAt ?? eventAt),
    lastEventAt: eventAt,
    updatedAt: now,
  };

  let row: WorkspaceSubscription;
  if (current) {
    [row] = (await tx
      .update(workspaceSubscriptions)
      .set(fields)
      .where(eq(workspaceSubscriptions.id, current.id))
      .returning()) as [WorkspaceSubscription];
  } else {
    // A second live subscription for a workspace that already has one (two
    // checkout tabs both paid): keep the first, record this one as superseded
    // and cancel it with the provider. The money is refunded by hand.
    const other = isLiveStatus(status)
      ? await tx
          .select({ id: workspaceSubscriptions.id })
          .from(workspaceSubscriptions)
          .where(
            and(
              eq(workspaceSubscriptions.workspaceId, placed.workspaceId),
              inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
              isNull(workspaceSubscriptions.supersededAt),
            ),
          )
          .limit(1)
      : [];
    const superseded = other.length > 0;
    [row] = (await tx
      .insert(workspaceSubscriptions)
      .values({
        ...fields,
        workspaceId: placed.workspaceId,
        buyerUserId: placed.buyerUserId,
        subscriptionId: sub.subscription_id,
        checkoutSessionId: placed.session?.sessionId ?? null,
        trialDays,
        trialEndsAt: trialDays > 0 ? new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
        supersededAt: superseded ? now : null,
      })
      .returning()) as [WorkspaceSubscription];
    if (placed.session && !placed.session.subscriptionId) {
      await tx
        .update(billingCheckoutSessions)
        .set({ subscriptionId: sub.subscription_id })
        .where(eq(billingCheckoutSessions.id, placed.session.id));
    }
    if (superseded) {
      logger.error("A workspace got a second subscription — cancelling it; refund it in the provider's dashboard", {
        event: "billing.duplicate_subscription",
        eventId: ctx.eventId,
        subscriptionId: sub.subscription_id,
      });
      const subscriptionId = sub.subscription_id;
      afterResponse("billing.cancel_duplicate", async () => {
        await dodo.updateSubscription(config, subscriptionId, { status: "cancelled", cancel_reason: "cancelled_by_merchant" });
      });
    }
  }

  if (row.supersededAt) return;
  if (entitlesPlan(status) && row.checkoutSessionId) {
    await tx
      .update(billingCheckoutSessions)
      .set({ completedAt: sql`coalesce(${billingCheckoutSessions.completedAt}, now())` })
      .where(eq(billingCheckoutSessions.sessionId, row.checkoutSessionId));
  }
  await settleWorkspace(ctx, placed.workspaceId);
  logger.info(`Subscription is now ${status} on ${plan} (${period})`, {
    event: "billing.subscription_applied",
    eventId: ctx.eventId,
    type: ctx.event.type,
    subscriptionId: sub.subscription_id,
    status,
    plan,
    period,
  });
}

/**
 * Bring the workspace row in line with its live subscription: the plan (Free
 * without an entitled one — limits gate adding only, nothing is deleted), and
 * the payment hold of B3 — set when the renewal finally fails (`on_hold`),
 * lifted once it's paid or the plan has ended. A dispute hold is left alone:
 * only the dispute's outcome lifts it.
 */
async function settleWorkspace(ctx: Ctx, workspaceId: string): Promise<void> {
  const { tx, eventAt } = ctx;
  const [ws] = await tx
    .select({
      plan: workspaces.plan,
      billingHold: workspaces.billingHold,
      paymentGraceUsedAt: workspaces.paymentGraceUsedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) {
    logger.warn("A billing event names a workspace that no longer exists — nothing to change", {
      event: "billing.workspace_gone",
      eventId: ctx.eventId,
    });
    return;
  }
  const [live] = await tx
    .select({ status: workspaceSubscriptions.status, plan: workspaceSubscriptions.plan })
    .from(workspaceSubscriptions)
    .where(
      and(
        eq(workspaceSubscriptions.workspaceId, workspaceId),
        inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
        isNull(workspaceSubscriptions.supersededAt),
      ),
    )
    .limit(1);
  const plan = workspacePlanFor(live ?? null);

  const patch: Partial<typeof workspaces.$inferInsert> = {};
  if (plan !== ws.plan) patch.plan = plan;
  if (live?.status === "on_hold") {
    if (!ws.billingHold) {
      const { holdFrom, graceGranted } = failedPaymentHold(eventAt, ws.paymentGraceUsedAt);
      patch.billingHold = "payment_failed";
      patch.billingHoldFrom = holdFrom;
      if (graceGranted) patch.paymentGraceUsedAt = eventAt;
      logger.info(
        graceGranted
          ? "A renewal failed for good — the workspace stays open for 7 more days"
          : "A renewal failed again within 3 months — the workspace is view-only now",
        { event: "billing.payment_hold", eventId: ctx.eventId, graceGranted, holdFrom: holdFrom.toISOString() },
      );
    }
  } else if (ws.billingHold === "payment_failed") {
    patch.billingHold = null;
    patch.billingHoldFrom = null;
    logger.info("The workspace's payment hold is lifted", { event: "billing.payment_hold_lifted", eventId: ctx.eventId });
  }
  if (Object.keys(patch).length === 0) return;
  await tx
    .update(workspaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  if (patch.plan) {
    logger.info(`Workspace plan changed from ${ws.plan} to ${patch.plan}`, {
      event: "billing.plan_changed",
      eventId: ctx.eventId,
      from: ws.plan,
      to: patch.plan,
    });
  }
}

// ── Payments ───────────────────────────────────────────────────────────────

/** Which workspace (and checkout) a payment belongs to — through our rows only. */
async function placePayment(
  tx: Tx,
  p: DodoPayment,
): Promise<{ workspaceId: string; buyerUserId: string | null; kind: "plan" | "topup"; session: BillingCheckoutSession | null } | null> {
  if (p.checkout_session_id) {
    const [session] = await tx
      .select()
      .from(billingCheckoutSessions)
      .where(eq(billingCheckoutSessions.sessionId, p.checkout_session_id))
      .limit(1);
    if (session) return { workspaceId: session.workspaceId, buyerUserId: session.buyerUserId, kind: session.item, session };
  }
  if (p.subscription_id) {
    const [sub] = await tx
      .select({ workspaceId: workspaceSubscriptions.workspaceId, buyerUserId: workspaceSubscriptions.buyerUserId })
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.subscriptionId, p.subscription_id))
      .limit(1);
    if (sub) return { ...sub, kind: "plan", session: null };
  }
  const [known] = await tx
    .select({ workspaceId: billingPayments.workspaceId, buyerUserId: billingPayments.buyerUserId, kind: billingPayments.kind })
    .from(billingPayments)
    .where(eq(billingPayments.paymentId, p.payment_id))
    .limit(1);
  return known ? { ...known, session: null } : null;
}

async function applyPayment(ctx: Ctx, p: DodoPayment): Promise<void> {
  const { tx, event } = ctx;
  const placed = await placePayment(tx, p);
  if (!placed) {
    // A renewal of a subscription we haven't placed yet will be placeable once
    // its subscription event lands; anything else isn't one of ours.
    if (p.subscription_id) throw new RetryLater("its subscription isn't known yet");
    logger.warn("A payment that matches none of our checkouts arrived — nothing changed", {
      event: "billing.payment_unplaced",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
    });
    return;
  }
  setLogContext({ workspaceId: placed.workspaceId });
  await lockWorkspace(tx, placed.workspaceId);

  const paidAt = dateOrNull(p.created_at) ?? ctx.eventAt;
  const values = {
    paymentId: p.payment_id,
    workspaceId: placed.workspaceId,
    buyerUserId: placed.buyerUserId,
    kind: placed.kind,
    subscriptionId: p.subscription_id,
    checkoutSessionId: p.checkout_session_id,
    status: p.status,
    totalAmountMinor: p.total_amount,
    taxMinor: p.tax,
    currency: p.currency.toUpperCase(),
    invoiceUrl: p.invoice_url,
    paidAt,
  };
  await tx
    .insert(billingPayments)
    .values(values)
    .onConflictDoUpdate({
      target: billingPayments.paymentId,
      set: {
        status: values.status,
        totalAmountMinor: values.totalAmountMinor,
        taxMinor: values.taxMinor,
        invoiceUrl: sql`coalesce(excluded.invoice_url, ${billingPayments.invoiceUrl})`,
        subscriptionId: sql`coalesce(excluded.subscription_id, ${billingPayments.subscriptionId})`,
        updatedAt: new Date(),
      },
    });

  const session = placed.session;
  if (session && p.subscription_id && !session.subscriptionId) {
    // The link a subscription event waiting to be placed retries against.
    await tx
      .update(billingCheckoutSessions)
      .set({ subscriptionId: p.subscription_id })
      .where(eq(billingCheckoutSessions.id, session.id));
  }
  if (event.type !== "payment.succeeded") return;
  if (session && !session.paymentId) {
    await tx
      .update(billingCheckoutSessions)
      .set({ paymentId: p.payment_id })
      .where(eq(billingCheckoutSessions.id, session.id));
  }
  if (placed.kind === "topup") await grantTopUp(ctx, p, placed.workspaceId, session, paidAt);
}

/**
 * A top-up's payment succeeded: grant `TOPUP.actions` for `TOPUP.validityMonths`
 * — but only if it's for the checkout we opened, for this workspace, and at
 * least the amount we priced (A3). Otherwise nothing is granted and a warning
 * says why. Once per payment (`ai_topups.payment_id` is unique).
 */
async function grantTopUp(
  ctx: Ctx,
  p: DodoPayment,
  workspaceId: string,
  session: BillingCheckoutSession | null,
  paidAt: Date,
): Promise<void> {
  if (!session) {
    logger.warn("A top-up payment arrived without a checkout we opened — nothing granted", {
      event: "billing.topup_rejected",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
      reason: "no_session",
    });
    return;
  }
  const check = checkTopUpPayment(session, {
    workspaceId: metaString(p.metadata, "workspace_id") ?? workspaceId,
    totalAmountMinor: p.total_amount,
    taxMinor: p.tax,
    currency: p.currency,
  });
  if (!check.ok) {
    logger.warn(`A top-up payment didn't match its checkout (${check.reason}) — nothing granted`, {
      event: "billing.topup_rejected",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
      reason: check.reason,
      expectedMinor: session.expectedAmountMinor,
      paidMinor: p.total_amount,
    });
    return;
  }
  const expiresAt = new Date(paidAt);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + TOPUP.validityMonths);
  const [granted] = await ctx.tx
    .insert(aiTopups)
    .values({
      workspaceId,
      paymentId: p.payment_id,
      checkoutSessionId: session.sessionId,
      buyerUserId: session.buyerUserId,
      actions: TOPUP.actions,
      remaining: TOPUP.actions,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: aiTopups.id });
  await ctx.tx
    .update(billingCheckoutSessions)
    .set({ completedAt: sql`coalesce(${billingCheckoutSessions.completedAt}, now())` })
    .where(eq(billingCheckoutSessions.id, session.id));
  if (granted) {
    logger.info(`Granted a top-up of ${TOPUP.actions} AI actions`, {
      event: "billing.topup_granted",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
      topUpId: granted.id,
    });
  }
}

// ── Refunds ────────────────────────────────────────────────────────────────

/**
 * A refund went through (always our decision — B4). It's recorded against the
 * payment; a refunded top-up loses whatever is left of it. A refunded plan
 * payment changes nothing by itself: the plan ends only when the subscription
 * is cancelled (its own webhook), so a goodwill refund doesn't silently
 * downgrade anyone.
 */
async function applyRefund(ctx: Ctx): Promise<void> {
  const r = refundSchema.parse(ctx.event.data);
  const [payment] = await ctx.tx
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.paymentId, r.payment_id))
    .limit(1);
  if (!payment) {
    logger.warn("A refund for a payment we never recorded arrived — nothing changed", {
      event: "billing.refund_unplaced",
      eventId: ctx.eventId,
      paymentId: r.payment_id,
    });
    return;
  }
  setLogContext({ workspaceId: payment.workspaceId });
  await lockWorkspace(ctx.tx, payment.workspaceId);
  const amount = r.amount ?? payment.totalAmountMinor;
  await ctx.tx
    .update(billingPayments)
    .set({
      refundedMinor: sql`least(${billingPayments.refundedMinor} + ${amount}, ${billingPayments.totalAmountMinor})`,
      updatedAt: new Date(),
    })
    .where(eq(billingPayments.id, payment.id));
  if (payment.kind === "topup") await revokeTopUp(ctx, payment.paymentId, "refund");
  logger.info(`Recorded a refund on a ${payment.kind === "topup" ? "top-up" : "plan"} payment`, {
    event: "billing.refund_recorded",
    eventId: ctx.eventId,
    paymentId: r.payment_id,
    kind: payment.kind,
    partial: r.is_partial,
  });
}

async function revokeTopUp(ctx: Ctx, paymentId: string, why: "refund" | "dispute"): Promise<void> {
  const revoked = await ctx.tx
    .update(aiTopups)
    .set({ remaining: 0, revokedAt: new Date() })
    .where(and(eq(aiTopups.paymentId, paymentId), isNull(aiTopups.revokedAt)))
    .returning({ id: aiTopups.id });
  if (revoked.length > 0) {
    logger.info(`Took back what was left of a top-up after a ${why}`, {
      event: "billing.topup_revoked",
      eventId: ctx.eventId,
      paymentId,
      why,
    });
  }
}

// ── Disputes (B2) ──────────────────────────────────────────────────────────

/**
 * A payment was disputed. While it holds (`disputeHolds`), the workspace is
 * view-only — data kept, nothing new — and a disputed top-up loses what's
 * left. The buyer's **second** disputed payment blocks their purchases for
 * good ("contact support"). Won or cancelled lifts the workspace's hold once
 * none of its payments is still disputed.
 */
async function applyDispute(ctx: Ctx): Promise<void> {
  const d = disputeSchema.parse(ctx.event.data);
  const { tx } = ctx;
  const [payment] = await tx
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.paymentId, d.payment_id))
    .limit(1);
  // A dispute is too important to drop: wait for its payment to be recorded.
  if (!payment) throw new RetryLater("its payment isn't recorded yet");
  setLogContext({ workspaceId: payment.workspaceId });
  await lockWorkspace(tx, payment.workspaceId);

  const holds = disputeHolds(d.dispute_status) && ctx.event.type !== "dispute.won" && ctx.event.type !== "dispute.cancelled";
  const firstTime = !payment.disputedAt;
  await tx
    .update(billingPayments)
    .set({
      disputedAt: payment.disputedAt ?? ctx.eventAt,
      disputeStatus: d.dispute_status,
      updatedAt: new Date(),
    })
    .where(eq(billingPayments.id, payment.id));

  if (holds) {
    await tx
      .update(workspaces)
      .set({ billingHold: "dispute", billingHoldFrom: ctx.eventAt, updatedAt: new Date() })
      .where(and(eq(workspaces.id, payment.workspaceId), sql`${workspaces.billingHold} is distinct from 'dispute'`));
    if (payment.kind === "topup") await revokeTopUp(ctx, payment.paymentId, "dispute");
    if (firstTime && payment.buyerUserId) {
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(billingPayments)
        .where(and(eq(billingPayments.buyerUserId, payment.buyerUserId), isNotNull(billingPayments.disputedAt)));
      if (Number(count?.n ?? 0) >= DISPUTES_BEFORE_BLOCK) {
        const blocked = await tx
          .update(users)
          .set({ purchasesBlockedAt: ctx.eventAt, updatedAt: new Date() })
          .where(and(eq(users.id, payment.buyerUserId), isNull(users.purchasesBlockedAt)))
          .returning({ id: users.id });
        if (blocked.length > 0) {
          logger.warn("A person's second disputed payment — their purchases are now blocked", {
            event: "billing.purchases_blocked",
            eventId: ctx.eventId,
            buyerUserId: payment.buyerUserId,
          });
        }
      }
    }
    logger.warn(`A payment was disputed (${d.dispute_status}) — the workspace is view-only`, {
      event: "billing.dispute_hold",
      eventId: ctx.eventId,
      paymentId: d.payment_id,
      disputeStatus: d.dispute_status,
    });
    return;
  }

  // Won or cancelled: lift the hold unless another of its payments is still disputed.
  const [still] = await tx
    .select({ id: billingPayments.id })
    .from(billingPayments)
    .where(
      and(
        eq(billingPayments.workspaceId, payment.workspaceId),
        ne(billingPayments.id, payment.id),
        isNotNull(billingPayments.disputedAt),
        sql`${billingPayments.disputeStatus} not in ('dispute_won', 'dispute_cancelled')`,
      ),
    )
    .limit(1);
  if (still) return;
  await tx
    .update(workspaces)
    .set({ billingHold: null, billingHoldFrom: null, updatedAt: new Date() })
    .where(and(eq(workspaces.id, payment.workspaceId), eq(workspaces.billingHold, "dispute")));
  // A renewal that failed meanwhile still holds the workspace (B3).
  await settleWorkspace(ctx, payment.workspaceId);
  logger.info(`A dispute ended (${d.dispute_status}) — the workspace's dispute hold is lifted`, {
    event: "billing.dispute_lifted",
    eventId: ctx.eventId,
    paymentId: d.payment_id,
  });
}
