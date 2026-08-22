import { notFound } from "next/navigation";
import { DayDivider } from "@/components/app/day-divider";
import { TransactionBubble } from "@/components/app/transaction-bubble";
import { DemoFrame } from "@/components/marketing/demo/demo-frame";
import { TryItCaption } from "@/components/marketing/demo/demo-caption";
import {
  DEMO_CURRENCY,
  DEMO_LOCALE,
  DEMO_PROFILE_ICON,
  DEMO_SEEDS,
} from "@/components/marketing/demo/demo-data";
import { TrackerDemo } from "@/components/marketing/tracker-demo";
import { ChatDemo } from "@/components/marketing/demo/chat-demo";
import { AiDemo } from "@/components/marketing/demo/ai-demo";
import { VoiceDemo } from "@/components/marketing/demo/voice-demo";
import { ProfilesDemo } from "@/components/marketing/demo/profiles-demo";
import { formatMoney, signedMinor } from "@/lib/money";
import { createMetadata } from "@/lib/seo";

/**
 * Development-only gallery of every marketing demo, so they can be eyeballed
 * side by side in both themes.
 *
 * The demos live on separate pages but are supposed to read as one product, and
 * the only reliable way to catch drift — a stray radius here, a different
 * spacing scale there — is to see them together. It 404s in production and is
 * disallowed in `robots.ts`; `noIndex` is belt and braces.
 */
export const metadata = createMetadata({
  title: "Demo gallery",
  description:
    "Development-only gallery of the marketing demos, for checking they stay visually consistent with the app.",
  path: "/dev/demos",
  noIndex: true,
});

function StaticFeed({ profile }: { profile: keyof typeof DEMO_SEEDS }) {
  const txns = DEMO_SEEDS[profile];
  const balance = txns.reduce(
    (sum, t) => sum + signedMinor(t.type, t.amountMinor),
    0,
  );

  return (
    <DemoFrame
      label={`${profile} tracker demo`}
      header={
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div>
            <p className="text-xs text-muted-foreground">Balance this month</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(balance, DEMO_CURRENCY, DEMO_LOCALE)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
            <span aria-hidden>{DEMO_PROFILE_ICON[profile]}</span> {profile}
          </span>
        </div>
      }
      bodyClassName="space-y-2 px-4 py-4"
    >
      <DayDivider label="Today" />
      {txns.map((t) => (
        <TransactionBubble
          key={t.id}
          type={t.type}
          amountLabel={formatMoney(
            signedMinor(t.type, t.amountMinor),
            DEMO_CURRENCY,
            DEMO_LOCALE,
            { signed: true },
          )}
          title={t.title}
          categoryName={t.categoryName}
          categoryIcon={t.categoryIcon}
          timeLabel={t.timeLabel}
        />
      ))}
    </DemoFrame>
  );
}

export default function DemoGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-4 pb-24 pt-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Demo gallery</h1>
        <p className="mt-2 text-muted-foreground">
          Development only — 404s in production. Toggle the theme and check the
          demos still read as one product.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-medium">DemoFrame — app chrome</h2>
        <StaticFeed profile="Personal" />
        <TryItCaption action="this one is static, it's here to check the chrome" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">TrackerDemo — hero</h2>
        <TrackerDemo />
        <TryItCaption action="type an amount, pick a category, and hit send" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ChatDemo — /features/chat-expense-tracker</h2>
        <ChatDemo />
        <TryItCaption action="type an amount, pick a category, and hit send" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">AiDemo — /features/ai-expense-tracker</h2>
        <AiDemo />
        <TryItCaption action="edit a draft, delete one, then press Add" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">VoiceDemo — /features/voice-expense-tracker</h2>
        <VoiceDemo />
        <TryItCaption action="pick a language and hold the mic button" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium">ProfilesDemo — /features/multiple-profiles</h2>
        <ProfilesDemo />
        <TryItCaption action="switch between Personal, Home and Business" />
      </section>
    </div>
  );
}
