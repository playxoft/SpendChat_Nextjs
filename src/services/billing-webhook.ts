import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiTopups,
  billingCheckoutSessions,
  billingPayments,
  billingTrialLedger,
  billingWebhookEvents,
  users,
  workspaceSubscriptions,
  workspaces,
  type BillingCheckoutSession,
  type WorkspaceSubscription,
} from "@/db/schema";
import { BILLING_APP, planOfProduct } from "@/lib/billing-catalog";
import { readBillingConfig, type BillingConfig } from "@/lib/billing-config";
import { getPayment } from "@/lib/dodo";
import {
  DISPUTES_BEFORE_BLOCK,
  LIVE_STATUSES,
  cancelModeFor,
  checkTopUpPayment,
  disputeEndsPlan,
  disputeHolds,
  entitlesPlan,
  failedPaymentHold,
  isFailingStatus,
  isLiveStatus,
  workspacePlanFor,
  type CancelWanted,
} from "@/lib/billing-rules";
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
import { cancelLater, trialLedgerKey } from "@/services/billing";

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
 *     checkout we opened for that workspace, buyer and product).
 *
 * **Another brand's events are acknowledged and dropped.** One provider
 * account can sell for several brands, and its webhook endpoints filter by
 * event type only, so their subscriptions and payments arrive here too
 * (`isOurs`). They get a 200 and nothing is recorded — a 503 would have the
 * provider retry each for a day, and log it as our failure.
 *
 * **Anything of ours we can't apply yet is answered 503 and not recorded** — a
 * subscription or payment we can't place, a product that isn't in
 * `DODO_PRODUCTS`, a refund or dispute for a payment we haven't seen — so the
 * provider retries it, and once the cause is fixed a replay from the
 * provider's dashboard is applied too. (`pnpm billing:reprocess:*` forgets an
 * event that *was* applied, for a replay after a fix.)
 *
 * Done synchronously (a few queries, well inside the 30 s delivery timeout):
 * an error must reach the provider as a non-2xx, or it would never retry.
 * Calls back to the provider (cancelling) happen after the response, and are
 * retried on every later event for that subscription (`cancel_wanted`).
 *
 * Subscription events carry the subscription's full current state and are
 * applied as a snapshot; one older than the newest applied is skipped, since
 * deliveries can arrive out of order.
 *
 * Abuse rules applied here: A3 (a top-up is granted only for at least the
 * amount we priced, for the workspace we priced it for), B1 (a trial no
 * checkout granted is refused and cancelled; every trial is written to the
 * ledger that outlives the account), B2 (a dispute holds the workspace
 * view-only at once; a person's second blocks their purchases; a lost or
 * accepted one cancels the plan), B3 (a renewal that finally fails leaves 7
 * days — once per 3 months — before view-only), C3 (a downgrade arrives as a
 * `plan_changed` at the renewal), C4 (top-ups: 500 actions for 12 months; a
 * refund or dispute takes back what's left).
 */

/** A delivery to answer 503 so the provider retries it later; `after` runs once the transaction has rolled back. */
export class RetryLater extends Error {
  readonly after?: () => Promise<void>;
  constructor(message: string, after?: () => Promise<void>) {
    super(message);
    this.after = after;
  }
}

/** Advisory-lock namespace for one workspace's billing changes (see the list in `email-quota.ts`). */
const BILLING_LOCK_NAMESPACE = 90;

/** How old a checkout may be and still claim a subscription through its metadata. */
const SESSION_CLAIM_MS = 3 * 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type Ctx = { tx: Tx; config: BillingConfig; event: DodoEvent; eventId: string; eventAt: Date };

const respond = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// ── Refusal logging, throttled ─────────────────────────────────────────────

/**
 * A refused delivery logs at most once a minute per isolate (with how many
 * were suppressed): anyone can POST junk at the endpoint, and on a server
 * without keys every delivery is refused — neither may flood the logs.
 */
const REFUSAL_LOG_EVERY_MS = 60_000;
const refusalLog = new Map<string, { at: number; suppressed: number }>();

function logRefusal(level: "warn" | "error", event: string, message: string): void {
  const now = Date.now();
  const last = refusalLog.get(event);
  if (last && now - last.at < REFUSAL_LOG_EVERY_MS) {
    last.suppressed += 1;
    return;
  }
  const suppressed = last?.suppressed ?? 0;
  refusalLog.set(event, { at: now, suppressed: 0 });
  logger[level](suppressed > 0 ? `${message} (and ${suppressed} more in the last minute)` : message, {
    event,
    suppressed,
  });
}

/**
 * Verify, de-duplicate and apply one delivery; the HTTP answer for the
 * provider. 200 = applied or deliberately ignored, 401 = not from the
 * provider, 400 = signed but unreadable, 503 = retry later.
 */
export async function handleDodoWebhook(rawBody: string, headers: Pick<Headers, "get">): Promise<Response> {
  const configResult = readBillingConfig();
  if (!configResult.ok) {
    logRefusal("error", "billing.webhook_unconfigured", "A billing webhook arrived but billing isn't configured on this server");
    return respond(503);
  }
  const config = configResult.config;

  if (!(await verifyStandardWebhook(rawBody, headers, config.webhookKey))) {
    logRefusal("warn", "billing.webhook_bad_signature", "Refused a billing webhook whose signature didn't verify");
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

  if (!(await isOurs(event, config))) {
    logger.info(`Billing webhook ${event.type} is for another brand on the account — acknowledged and dropped`, {
      event: "billing.webhook_foreign",
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
      logger.warn(`Billing webhook ${event.type} can't be applied yet — asked the provider to retry: ${err.message}`, {
        event: "billing.webhook_retry",
        eventId,
        type: event.type,
      });
      if (err.after) {
        await err.after().catch((e: unknown) =>
          logger.warn(`A billing fallback failed: ${describeError(e)}`, { event: "billing.fallback_failed", eventId }),
        );
      }
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

/**
 * Whether an event is ours, judged before anything is written. Ours: whatever
 * our rows already know; anything from a checkout of ours (each carries
 * `metadata.app`, and the subscription and payments it makes inherit it); a
 * subscription to one of our products. A refund or dispute names only its
 * payment, so one we haven't recorded is looked up at the provider. If that
 * lookup fails we can't tell, and it counts as ours — it's retried, which is
 * better than dropping our own refund.
 */
async function isOurs(event: DodoEvent, config: BillingConfig): Promise<boolean> {
  const { type, data } = event;
  if (type.startsWith("subscription.")) {
    if (isMarked(data.metadata)) return true;
    if (typeof data.product_id === "string" && planOfProduct(config.products, data.product_id)) return true;
    return typeof data.subscription_id === "string" && (await knowsSubscription(data.subscription_id));
  }
  if (type.startsWith("payment.")) return isMarked(data.metadata) || (await knowsPayment(data));
  if (type === "refund.succeeded" || type.startsWith("dispute.")) {
    // Malformed — counts as ours, so parsing it fails the delivery as before.
    if (typeof data.payment_id !== "string") return true;
    if (await knowsPayment({ payment_id: data.payment_id })) return true;
    try {
      const payment = await getPayment(config, data.payment_id);
      const fields = payment && typeof payment === "object" ? (payment as Record<string, unknown>) : {};
      return isMarked(fields.metadata) || (await knowsPayment(fields));
    } catch {
      return true;
    }
  }
  return true;
}

function isMarked(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).app === BILLING_APP;
}

async function knowsSubscription(subscriptionId: string): Promise<boolean> {
  const db = getDb();
  const [[sub], [session]] = await Promise.all([
    db
      .select({ id: workspaceSubscriptions.id })
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.subscriptionId, subscriptionId))
      .limit(1),
    db
      .select({ id: billingCheckoutSessions.id })
      .from(billingCheckoutSessions)
      .where(eq(billingCheckoutSessions.subscriptionId, subscriptionId))
      .limit(1),
  ]);
  return !!sub || !!session;
}

/** A payment we've recorded, from a checkout we opened, or for a subscription we know. */
async function knowsPayment(p: Record<string, unknown>): Promise<boolean> {
  const db = getDb();
  if (typeof p.payment_id === "string") {
    const [row] = await db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(eq(billingPayments.paymentId, p.payment_id))
      .limit(1);
    if (row) return true;
  }
  if (typeof p.checkout_session_id === "string") {
    const [row] = await db
      .select({ id: billingCheckoutSessions.id })
      .from(billingCheckoutSessions)
      .where(eq(billingCheckoutSessions.sessionId, p.checkout_session_id))
      .limit(1);
    if (row) return true;
  }
  return typeof p.subscription_id === "string" && (await knowsSubscription(p.subscription_id));
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

type Placement = { workspaceId: string; buyerUserId: string | null; session: BillingCheckoutSession | null };

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

/**
 * The safety net for a subscription event we can't place: if its metadata
 * names a workspace that is on a paid plan **no live subscription of ours
 * backs** (its rows were lost), that plan is something nobody is paying for —
 * settle the workspace to Free. Runs after the event's own transaction rolled
 * back; the event itself is still retried. A workspace with a live
 * subscription, or on Free, is left alone.
 */
function orphanFallback(sub: DodoSubscription, eventId: string): (() => Promise<void>) | undefined {
  const workspaceId = metaString(sub.metadata, "workspace_id");
  if (!workspaceId || !isUuid(workspaceId)) return undefined;
  return async () => {
    const db = getDb();
    const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws || ws.plan === "free") return;
    const [live] = await db
      .select({ id: workspaceSubscriptions.id })
      .from(workspaceSubscriptions)
      .where(
        and(
          eq(workspaceSubscriptions.workspaceId, workspaceId),
          inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
          isNull(workspaceSubscriptions.supersededAt),
        ),
      )
      .limit(1);
    if (live) return;
    await db.update(workspaces).set({ plan: "free", updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
    logger.warn("A paid workspace had no subscription behind it — settled it to Free", {
      event: "billing.orphan_settled",
      eventId,
      workspaceId,
      from: ws.plan,
    });
  };
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
  if (!placed) {
    throw new RetryLater("no checkout or subscription row matches it yet", orphanFallback(sub, ctx.eventId));
  }
  setLogContext({ workspaceId: placed.workspaceId });
  await lockWorkspace(tx, placed.workspaceId);

  // Re-read under the lock: a parallel event may have just written it.
  const [current] = await tx
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
    // A new subscription for a product that isn't in DODO_PRODUCTS (a config
    // mistake, or another product on the same account): nothing to grant, and
    // nothing recorded — fix the config and the provider's retry (or a
    // dashboard replay) applies it.
    logger.error("A subscription for a product that isn't in DODO_PRODUCTS arrived — asked for a retry", {
      event: "billing.unknown_product",
      eventId: ctx.eventId,
      subscriptionId: sub.subscription_id,
      productId: sub.product_id,
    });
    throw new RetryLater("its product isn't in DODO_PRODUCTS");
  }
  if (!sells) {
    // One we already have, moved to a product we don't know: its status (and
    // any cancellation we owe) still apply, on the last plan we knew.
    logger.error("A subscription moved to a product that isn't in DODO_PRODUCTS — kept its last known plan", {
      event: "billing.unknown_product",
      eventId: ctx.eventId,
      subscriptionId: sub.subscription_id,
      productId: sub.product_id,
    });
  }
  const plan = sells?.plan ?? current!.plan;
  const period = sells?.period ?? current!.period;

  const status = sub.status;
  const scheduled = sub.scheduled_change ? planOfProduct(config.products, sub.scheduled_change.product_id) : null;
  const createdAt = dateOrNull(sub.created_at) ?? eventAt;
  const trialDays = current?.trialDays ?? sub.trial_period_days;
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
    recurringAmountMinor: sub.recurring_pre_tax_amount,
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
    // A subscription that must never entitle anything is recorded as void and
    // cancelled with the provider:
    //  - B1 fails closed: a trial no checkout of ours granted (the products
    //    carry none, so the checkout's `trial_period_days` is the only source);
    //  - a second live subscription for a workspace that already has one (two
    //    checkout tabs both paid) — the first is kept; the money is refunded by hand.
    //  - a checkout paid after (or during) its buyer's account deletion, or
    //    for a workspace that's gone — a link stays payable for 24 hours:
    //    nobody to grant it to, so it's cancelled (refund by hand).
    const [wsRow] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, placed.workspaceId));
    const [buyerRow] = placed.buyerUserId
      ? await tx.select({ id: users.id }).from(users).where(eq(users.id, placed.buyerUserId))
      : [];
    let voidReason: "workspace_gone" | "buyer_gone" | "unearned_trial" | "duplicate" | null = null;
    if (!wsRow) {
      voidReason = "workspace_gone";
    } else if (!buyerRow) {
      voidReason = "buyer_gone";
    } else if (placed.session && placed.session.trialDays === 0 && sub.trial_period_days > 0) {
      voidReason = "unearned_trial";
    } else if (isLiveStatus(status)) {
      const [other] = await tx
        .select({ id: workspaceSubscriptions.id })
        .from(workspaceSubscriptions)
        .where(
          and(
            eq(workspaceSubscriptions.workspaceId, placed.workspaceId),
            inArray(workspaceSubscriptions.status, [...LIVE_STATUSES]),
            isNull(workspaceSubscriptions.supersededAt),
          ),
        )
        .limit(1);
      if (other) voidReason = "duplicate";
    }
    [row] = (await tx
      .insert(workspaceSubscriptions)
      .values({
        ...fields,
        workspaceId: placed.workspaceId,
        buyerUserId: buyerRow ? placed.buyerUserId : null,
        subscriptionId: sub.subscription_id,
        checkoutSessionId: placed.session?.sessionId ?? null,
        trialDays,
        trialEndsAt: trialDays > 0 ? new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
        supersededAt: voidReason ? now : null,
        voidReason,
        cancelWanted: voidReason ? "now" : null,
      })
      .returning()) as [WorkspaceSubscription];
    if (placed.session && !placed.session.subscriptionId) {
      await tx
        .update(billingCheckoutSessions)
        .set({ subscriptionId: sub.subscription_id })
        .where(eq(billingCheckoutSessions.id, placed.session.id));
    }
    if (voidReason === "workspace_gone" || voidReason === "buyer_gone") {
      logger.error(
        `A subscription was paid for after its ${voidReason === "buyer_gone" ? "buyer's account" : "workspace"} was deleted — cancelling it; refund it in the provider's dashboard`,
        { event: "billing.orphan_subscription", eventId: ctx.eventId, subscriptionId: sub.subscription_id, voidReason },
      );
    } else if (voidReason === "unearned_trial") {
      logger.error("A subscription started a trial its checkout didn't grant — refused it and cancelled it", {
        event: "billing.unearned_trial",
        eventId: ctx.eventId,
        subscriptionId: sub.subscription_id,
        trialDays: sub.trial_period_days,
      });
    } else if (voidReason === "duplicate") {
      logger.error("A workspace got a second subscription — cancelling it; refund it in the provider's dashboard", {
        event: "billing.duplicate_subscription",
        eventId: ctx.eventId,
        subscriptionId: sub.subscription_id,
      });
    }
  }

  // A cancellation we owe for this subscription — void, account deleted, a
  // lost dispute — retried on every event until it's no longer live.
  if (row.cancelWanted && isLiveStatus(status)) {
    const mode = cancelModeFor(status, row.cancelWanted as CancelWanted);
    if (mode === "now" || !sub.cancel_at_next_billing_date) {
      cancelLater(sub.subscription_id, mode, row.voidReason ?? "a cancellation still owed");
    }
  }
  if (row.supersededAt) return;

  if (entitlesPlan(status) && row.checkoutSessionId) {
    await tx
      .update(billingCheckoutSessions)
      .set({ completedAt: sql`coalesce(${billingCheckoutSessions.completedAt}, now())` })
      .where(eq(billingCheckoutSessions.sessionId, row.checkoutSessionId));
  }
  // B1: every trial that started goes in the ledger the account can't delete.
  if (entitlesPlan(status) && row.trialDays > 0 && !current?.activatedAt) {
    await recordTrial(tx, row);
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

/** Write a started trial to the ledger, by the buyer's hashed email (B1). */
async function recordTrial(tx: Tx, row: WorkspaceSubscription): Promise<void> {
  if (!row.buyerUserId) return;
  const [buyer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, row.buyerUserId)).limit(1);
  if (!buyer?.email) return;
  await tx
    .insert(billingTrialLedger)
    .values({
      emailKey: await trialLedgerKey(buyer.email),
      workspaceId: row.workspaceId,
      subscriptionId: row.subscriptionId,
      customerId: row.customerId,
    })
    .onConflictDoNothing();
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
    logger.info("A billing event names a workspace that no longer exists — nothing to change", {
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
  // A renewal of a subscription we haven't placed yet becomes placeable once
  // its subscription event lands; anything else may be a checkout of ours
  // whose row is late, or a stranger — either way, not recorded, so a retry
  // or a replay can still apply it.
  if (!placed) throw new RetryLater("no checkout, subscription or payment of ours matches it");
  setLogContext({ workspaceId: placed.workspaceId });
  await lockWorkspace(tx, placed.workspaceId);

  // A cancellation we owe for its subscription is retried here too — a
  // subscription may send payment events and no subscription event for a while.
  if (p.subscription_id) {
    const [owed] = await tx
      .select({ status: workspaceSubscriptions.status, cancelWanted: workspaceSubscriptions.cancelWanted, cancelAtPeriodEnd: workspaceSubscriptions.cancelAtPeriodEnd })
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.subscriptionId, p.subscription_id))
      .limit(1);
    if (owed?.cancelWanted && isLiveStatus(owed.status)) {
      const mode = cancelModeFor(owed.status, owed.cancelWanted as CancelWanted);
      if (mode === "now" || !owed.cancelAtPeriodEnd) cancelLater(p.subscription_id, mode, "a cancellation still owed");
    }
  }

  const paidAt = dateOrNull(p.created_at) ?? ctx.eventAt;
  // An older event than the newest applied never rolls the status back
  // (deliveries arrive out of order, and a replay may be days late).
  const [known] = await tx
    .select({ statusEventAt: billingPayments.statusEventAt })
    .from(billingPayments)
    .where(eq(billingPayments.paymentId, p.payment_id))
    .limit(1);
  if (known?.statusEventAt && ctx.eventAt.getTime() < known.statusEventAt.getTime()) {
    logger.info(`Skipped an out-of-order ${event.type} — a newer payment state is already applied`, {
      event: "billing.webhook_stale",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
    });
    return;
  }
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
    statusEventAt: ctx.eventAt,
  };
  await tx
    .insert(billingPayments)
    .values(values)
    .onConflictDoUpdate({
      target: billingPayments.paymentId,
      set: {
        status: values.status,
        statusEventAt: values.statusEventAt,
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
  if (placed.kind === "topup") {
    await grantTopUp(ctx, p, placed.workspaceId, session, paidAt);
    return;
  }
  // A plan charge inside the trial (an upgrade ends it — it's charged now):
  // the trial is over from this payment, so nothing still says "trial".
  if (p.total_amount > 0 && p.subscription_id) {
    await tx
      .update(workspaceSubscriptions)
      .set({ trialEndsAt: paidAt, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceSubscriptions.subscriptionId, p.subscription_id),
          sql`${workspaceSubscriptions.trialEndsAt} > ${paidAt}`,
        ),
      );
  }
}

/**
 * A top-up's payment succeeded: grant `TOPUP.actions` for `TOPUP.validityMonths`
 * — but only if it's for the checkout we opened, for this workspace, and at
 * least the amount we priced (A3). Otherwise nothing is granted and a warning
 * says why. Once per payment (`ai_topups.payment_id` is unique). Top-up
 * checkouts take no discount code (`lib/payments.ts`), so a lower amount is
 * never legitimate; plans are granted by product, not by amount, so a student
 * discount on a plan is untouched by this check.
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
  await ctx.tx
    .update(billingCheckoutSessions)
    .set({ completedAt: sql`coalesce(${billingCheckoutSessions.completedAt}, now())` })
    .where(eq(billingCheckoutSessions.id, session.id));
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
  const [ws] = await ctx.tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) {
    logger.error("A top-up was paid for a workspace that's been deleted — nothing granted; refund it in the provider's dashboard", {
      event: "billing.topup_rejected",
      eventId: ctx.eventId,
      paymentId: p.payment_id,
      reason: "workspace_gone",
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
 * payment by refund id, so a replayed event can't count twice; a refunded
 * top-up loses whatever is left of it. A refunded plan payment changes nothing
 * by itself: the plan ends only when the subscription is cancelled (its own
 * webhook), so a goodwill refund doesn't silently downgrade anyone.
 */
async function applyRefund(ctx: Ctx): Promise<void> {
  const r = refundSchema.parse(ctx.event.data);
  const [payment] = await ctx.tx
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.paymentId, r.payment_id))
    .limit(1);
  // Its payment's own event may still be on the way.
  if (!payment) throw new RetryLater("its payment isn't recorded yet");
  setLogContext({ workspaceId: payment.workspaceId });
  await lockWorkspace(ctx.tx, payment.workspaceId);
  const refunds = { ...payment.refunds, [r.refund_id]: r.amount ?? payment.totalAmountMinor };
  const total = Object.values(refunds).reduce((n, v) => n + v, 0);
  await ctx.tx
    .update(billingPayments)
    .set({ refunds, refundedMinor: Math.min(total, payment.totalAmountMinor), updatedAt: new Date() })
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
 * good ("contact support"). A dispute **lost or accepted** means the money
 * went back: the plan it paid for is cancelled at once, so a workspace that
 * stays view-only isn't charged again. Won or cancelled lifts the workspace's
 * hold once none of its payments is still disputed.
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
  // A late or replayed dispute event never rolls a newer outcome back.
  if (payment.disputeEventAt && ctx.eventAt.getTime() < payment.disputeEventAt.getTime()) {
    logger.info(`Skipped an out-of-order ${ctx.event.type} — a newer dispute state is already applied`, {
      event: "billing.webhook_stale",
      eventId: ctx.eventId,
      paymentId: d.payment_id,
    });
    return;
  }

  const status =
    ctx.event.type === "dispute.won"
      ? "dispute_won"
      : ctx.event.type === "dispute.cancelled"
        ? "dispute_cancelled"
        : ctx.event.type === "dispute.lost"
          ? "dispute_lost"
          : ctx.event.type === "dispute.accepted"
            ? "dispute_accepted"
            : d.dispute_status;
  const holds = disputeHolds(status);
  const firstTime = !payment.disputedAt;
  await tx
    .update(billingPayments)
    .set({
      disputedAt: payment.disputedAt ?? ctx.eventAt,
      disputeStatus: status,
      disputeEventAt: ctx.eventAt,
      updatedAt: new Date(),
    })
    .where(eq(billingPayments.id, payment.id));

  if (holds) {
    await tx
      .update(workspaces)
      .set({ billingHold: "dispute", billingHoldFrom: ctx.eventAt, updatedAt: new Date() })
      .where(and(eq(workspaces.id, payment.workspaceId), sql`${workspaces.billingHold} is distinct from 'dispute'`));
    if (payment.kind === "topup") await revokeTopUp(ctx, payment.paymentId, "dispute");
    if (disputeEndsPlan(status) && payment.subscriptionId) await cancelForDispute(ctx, payment.subscriptionId);
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
    logger.warn(`A payment was disputed (${status}) — the workspace is view-only`, {
      event: "billing.dispute_hold",
      eventId: ctx.eventId,
      paymentId: d.payment_id,
      disputeStatus: status,
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
  logger.info(`A dispute ended (${status}) — the workspace's dispute hold is lifted`, {
    event: "billing.dispute_lifted",
    eventId: ctx.eventId,
    paymentId: d.payment_id,
  });
}

/** A lost or accepted dispute: the plan it paid for is cancelled now, and retried until it ends. */
async function cancelForDispute(ctx: Ctx, subscriptionId: string): Promise<void> {
  const [sub] = await ctx.tx
    .update(workspaceSubscriptions)
    .set({ cancelWanted: "now", updatedAt: new Date() })
    .where(
      and(eq(workspaceSubscriptions.subscriptionId, subscriptionId), inArray(workspaceSubscriptions.status, [...LIVE_STATUSES])),
    )
    .returning({ id: workspaceSubscriptions.id });
  if (!sub) return;
  cancelLater(subscriptionId, "now", "a lost or accepted dispute");
  logger.warn("A dispute was lost or accepted — cancelling the plan it paid for", {
    event: "billing.dispute_cancel",
    eventId: ctx.eventId,
    subscriptionId,
  });
}
