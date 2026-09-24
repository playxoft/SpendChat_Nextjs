import { notFound } from "next/navigation";
import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { STUDENT_DISCOUNT, TRIAL_DAYS } from "../pricing/_data/pricing";

/**
 * Draft billing & refund policy that goes with the draft pricing page. Local
 * only, like it. When paid plans launch, these sections move into `/terms`
 * (which today still describes a free service) — this is the text to paste.
 */
export const metadata = createMetadata({
  title: "Billing & refund policy (draft)",
  description: `How ${siteConfig.name} trials, renewals, cancellations and refunds work on paid plans — draft, not yet in effect.`,
  path: "/local-only/billing-policy",
  noIndex: true,
});

const sections: { h: string; p: string[] }[] = [
  {
    h: "Free trial",
    p: [
      `Every paid plan starts with a ${TRIAL_DAYS}-day free trial with all of that plan's features. We email you before the trial ends. If you cancel before it ends, you are not charged.`,
      "Trials are one per person (and one per household on Family, one per team on business plans). We may decline or end a trial that is being used to get around this.",
    ],
  },
  {
    h: "Billing and renewal",
    p: [
      "When the trial ends, the plan is charged in advance for the billing period you chose — one month, 3 months or a year on personal plans; one month or a year on business plans — and renews automatically for the same period until you cancel.",
      "Plans are priced in six currencies — INR, USD, EUR, GBP, AUD and JPY — and you are charged in the one you choose at checkout. Applicable taxes are added at checkout. Our payment provider acts as merchant of record.",
    ],
  },
  {
    h: "Cancellation",
    p: [
      "You can cancel any time from your account settings. Cancellation stops the next renewal; you keep the plan until the end of the period you have already paid for, then move to the Free plan. Your data is never deleted because a plan ends, and you can always export it.",
    ],
  },
  {
    h: "Refunds",
    p: [
      `Because every plan begins with a free trial, payments are non-refundable, including for partially used periods and unused AI actions or storage. Any refund, credit or exception is made solely at ${siteConfig.name}'s discretion, and granting one does not create an obligation to do so again.`,
      "Where the law in your country gives you a right to a refund that cannot be waived, that right applies.",
    ],
  },
  {
    h: "Discounts",
    p: [
      `The student discount (${Math.round(STUDENT_DISCOUNT * 100)}% off Plus and Pro) requires proof of current enrolment and may be re-verified yearly. Prices are set per currency; using another country's payment method or details to obtain a different price may lead to the plan being repriced or cancelled.`,
    ],
  },
  {
    h: "Price changes",
    p: [
      "If we change a plan's price, we tell you at least 30 days before it applies to your next renewal. Early subscribers keep the price they first paid for as long as their subscription stays active.",
    ],
  },
];

export default function BillingPolicyPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Draft — not yet in effect
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Billing &amp; refund policy</h1>
      <div className="mt-10 space-y-8 text-muted-foreground">
        {sections.map((s) => (
          <section key={s.h} className="space-y-3">
            <h2 className="text-xl font-medium text-foreground">{s.h}</h2>
            {s.p.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
        ))}
        <p className="text-sm">
          Questions about a charge? Write to{" "}
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            {siteConfig.supportEmail}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
