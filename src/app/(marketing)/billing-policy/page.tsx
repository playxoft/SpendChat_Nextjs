import Link from "next/link";
import { PAYMENT_GRACE_DAYS, PAYMENT_GRACE_EVERY_DAYS, TRIALS_PER_PERSON } from "@/lib/billing-rules";
import { PLAN_NAMES, TOPUP } from "@/lib/plans";
import { CURRENCIES, STUDENT_DISCOUNT, TRIAL_DAYS } from "@/lib/pricing";
import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Billing & refund policy",
  description: `How ${siteConfig.name}'s paid plans bill: per workspace, the ${TRIAL_DAYS}-day trial, renewals, cancelling, failed payments, AI top-ups and refunds.`,
  path: "/billing-policy",
});

const LAST_UPDATED = "October 9, 2026";

const paid = `${PLAN_NAMES.plus} and ${PLAN_NAMES.pro}`;
const currencies = CURRENCIES.map((c) => c.code).join(", ");

/**
 * The billing & refund policy — what the payment provider's reviewer reads,
 * and what Settings → Billing links to. Every number comes from the same
 * modules the app enforces (`plans.ts`, `pricing.ts`, `billing-rules.ts`), so
 * the policy can't promise something the code doesn't do.
 */
const sections: { id: string; h: string; p: React.ReactNode[] }[] = [
  {
    id: "per-workspace",
    h: "Plans are per workspace",
    p: [
      `Every workspace has its own plan — Free, ${PLAN_NAMES.plus} or ${PLAN_NAMES.pro} — with its own billing date and its own invoices. Everyone gets one free workspace; each extra workspace needs its own paid plan, and until it has one it's view-only.`,
      "Only a workspace admin can buy a plan. The admin who buys it pays for it with their own payment method, and only they see its invoices and payment details and can move it to a bigger plan; any admin can move it to a smaller one or cancel it. Payments are processed by Dodo Payments, our merchant of record: they handle the payment, the invoice and the sales tax (GST or VAT) for your country, which is added at checkout.",
      "If you're removed from a workspace whose plan you pay for, the workspace keeps its plan and you keep paying until you cancel it — it stays listed on your Billing page. If you delete your account, every plan you pay for is cancelled at the end of its paid period.",
    ],
  },
  {
    id: "trial",
    h: "Free trial",
    p: [
      `A workspace's first ${paid} plan starts with a ${TRIAL_DAYS}-day free trial. Starting it needs a card or UPI mandate, but nothing is charged until the trial ends. Cancel before then and you're never charged.`,
      `Each workspace gets one trial, and one person can start at most ${TRIALS_PER_PERSON} trials in 12 months. Checkout tells you before you pay whether this purchase comes with a trial.`,
      "To count trials, we keep a one-way hash of the email address that started each one (never the address itself), the date and the workspace, for about 13 months — including after the account is deleted, so deleting and re-creating an account doesn't reset the count.",
      "Upgrading during a trial (to a bigger plan, or a longer billing period) ends the trial: the new plan is charged that day.",
    ],
  },
  {
    id: "billing",
    h: "Billing and renewal",
    p: [
      `Plans are paid in advance for the period you choose — 1 month, 3 months or 1 year — and renew automatically on the same date until you cancel. Prices are set in ${currencies}; rupee prices are available to buyers in India and its rupee-priced neighbours. Checkout shows the exact amount, tax included, before you pay, and your currency stays the same for the life of the plan.`,
      "Payments by UPI or an Indian card can take up to two days to be debited after a renewal starts; the workspace keeps working meanwhile.",
    ],
  },
  {
    id: "changes",
    h: "Changing plans",
    p: [
      "Moving up — to a bigger plan, or to a longer billing period — happens straight away. You're charged for the new plan that day, less a credit for the unused part of the old one, and your billing date moves to that day.",
      "Moving down — to a smaller plan, or a shorter period — happens at your next renewal. You keep the plan you've paid for until then, nothing is refunded for the rest of the period, and the AI actions already used that month carry over.",
    ],
  },
  {
    id: "cancel",
    h: "Cancelling",
    p: [
      "Cancel any time from Settings → Billing. The plan runs to the end of the period you've paid for, then the workspace moves to Free; the person who pays for it can change their mind and keep the plan until that date. A plan whose payment has failed (or that isn't running) has no paid time left, so cancelling it ends it straight away.",
      "Nothing is deleted when a plan ends. Anything over Free's limits stays and can still be viewed and exported — you just can't add more of it — and an extra workspace beyond your free one becomes view-only.",
    ],
  },
  {
    id: "failed-payments",
    h: "Failed payments",
    p: [
      "If a renewal payment fails, the workspace keeps working while the payment is retried. You'll get a link to update the payment method; Settings → Billing has one too.",
      `If the payment still hasn't gone through when the retries end, the workspace stays open for ${PAYMENT_GRACE_DAYS} more days, then becomes view-only until it's paid. That ${PAYMENT_GRACE_DAYS}-day grace is given once every ${Math.round(PAYMENT_GRACE_EVERY_DAYS / 30)} months per workspace; after another failure inside that window, the workspace is view-only as soon as the retries end. Nothing is ever deleted, and paying opens it up again.`,
    ],
  },
  {
    id: "top-ups",
    h: "AI top-ups",
    p: [
      `On ${paid}, a one-time AI top-up adds ${TOPUP.actions.toLocaleString("en-US")} AI actions to a workspace. They're used only after the workspace's monthly allowance runs out, and they're valid for ${TOPUP.validityMonths} months from purchase.`,
      "Top-ups belong to the workspace they were bought for: they can't be moved to another workspace, and they're lost if the workspace is deleted. If the workspace's plan later ends, unused top-up actions stay with it until they expire.",
      "Top-ups aren't refundable once any of their actions have been used. A top-up that's refunded or disputed loses the actions it has left.",
    ],
  },
  {
    id: "refunds",
    h: "Refunds",
    p: [
      `Because every plan can start with a free trial, payments are non-refundable — including for the unused part of a period, a downgrade, a cancellation, or unused AI actions or storage. Any refund, credit or exception is made solely at ${siteConfig.name}'s discretion, and granting one doesn't oblige us to do it again.`,
      "Refunding a plan payment doesn't end the plan by itself; if we end a plan as part of a refund, we tell you.",
      "Where the law in your country gives you a right to a refund that can't be waived, that right applies.",
    ],
  },
  {
    id: "disputes",
    h: "Disputes and chargebacks",
    p: [
      "If a charge looks wrong, please write to us first — we'll sort it out faster than a bank can.",
      "While a payment is disputed with your bank, the workspace it paid for is view-only (nothing is deleted). If the dispute ends with the money returned to you, the plan it paid for is cancelled, and the workspace stays view-only until you contact us. An account with repeated disputes can't make further purchases until it's resolved with us.",
    ],
  },
  {
    id: "discounts",
    h: "Discounts",
    p: [
      `Students get ${Math.round(STUDENT_DISCOUNT * 100)}% off ${paid} after we verify a college email: we send a code to enter at checkout. Each code is for one person and one use, works on plans only (not top-ups), and applies for up to 12 billing periods, including after a change of plan. Using another country's payment details to get a different price may lead to the plan being repriced or cancelled.`,
    ],
  },
  {
    id: "price-changes",
    h: "Price changes",
    p: [
      "If we change a plan's price, we tell you at least 30 days before it applies to your next renewal. A price change never alters a period you've already paid for.",
    ],
  },
];

export default function BillingPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Billing &amp; refund policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      <div className="mt-10 space-y-8 text-muted-foreground">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20 space-y-3">
            <h2 className="text-xl font-medium text-foreground">{s.h}</h2>
            {s.p.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </section>
        ))}
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p>
            Questions about a charge, a refund or an invoice? Write to{" "}
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="text-foreground underline underline-offset-4 hover:no-underline"
            >
              {siteConfig.supportEmail}
            </a>
            . See also our{" "}
            <Link href="/terms" className="text-foreground underline underline-offset-4 hover:no-underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:no-underline">
              pricing
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
