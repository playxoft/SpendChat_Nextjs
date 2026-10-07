import Link from "next/link";
import { SplitDemo } from "@/components/marketing/demo/split-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";
import { toolPath } from "@/lib/tools";

const SLUG = "split";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

/** The free no-account calculator — the same maths, in the browser. */
const TOOL = toolPath("split-bill-calculator");
const MAX = SPLIT_GROUP_MAX_PEOPLE;

const faqs = [
  {
    q: "Is Split free?",
    a: "Yes, on every plan, with nothing to unlock. A split group doesn't belong to a workspace, so it doesn't use any of your plan's limits, and the people you add don't need a paid plan either.",
  },
  {
    q: "How many people can be in a group?",
    a: `Up to ${MAX}, you included — enough for a wedding weekend or a big trip. People who've been invited but haven't joined yet count too. Someone who's settled up can be removed to make room.`,
  },
  {
    q: "Do the people I add need an account?",
    a: "To see the group, yes — a free one, with the email address you added them by. Someone who already has an account sees an invitation in the app; anyone else gets one email with a link to join. You can add expenses that include them before they join, so nobody waits on anybody.",
  },
  {
    q: "Can I split a bill unequally?",
    a: "Yes. Split equally between whoever was there, by exact amounts that must add up to the total, or by percent (to two decimals, adding up to 100). Someone who had nothing can be left out of an expense entirely.",
  },
  {
    q: "Does SpendChat send the money?",
    a: "No. It works out who owes whom and the fewest payments that settle everyone. You pay each other however you normally do — cash, UPI, a bank transfer — and press “Mark as paid”, and the balances update for everyone.",
  },
  {
    q: "Can a group use a different currency from my workspace?",
    a: "Yes. Each group has its own currency, set when you start it and fixed once the first expense or payment is in. When you add your share to a workspace that uses another currency, you type what it cost you there — SpendChat never guesses an exchange rate.",
  },
  {
    q: "Who can see the email addresses in a group?",
    a: "The person who started the group sees the addresses they typed; everyone else sees names, and their own address. A stranger on a fifty-person trip doesn't get forty-nine emails.",
  },
  {
    q: "Can I try it without signing up?",
    a: "Yes — the free split bill calculator runs the same maths in your browser, no account needed. When you want everyone to see the balance, sign up and bring the group with you.",
  },
];

export default function SplitPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<SplitDemo />}
      demoAction="switch how the dinner is split, then press Mark as paid until the trip is Settled Up"
      faqs={faqs}
      intro={
        <>
          <p>
            Someone pays for the cab, someone else gets dinner, and by the last
            day nobody remembers who owes what. A split group keeps that list
            for everyone: add what was spent and how it&apos;s divided, and
            SpendChat works out each person&apos;s balance and the fewest
            payments that settle it.
          </p>
          <p>
            Free on every plan, for up to {MAX} people. The demo below runs the
            app&apos;s own maths — or try the{" "}
            <Link
              href={TOOL}
              className="font-medium text-foreground underline underline-offset-4"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({ location: "split_intro", label: "split_tool" })}
            >
              free split bill calculator
            </Link>{" "}
            on your own trip, no account needed.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Start a group",
            body: `Name it, pick its currency, and add people by name and email — up to ${MAX}, you included. They get a link to join.`,
          },
          {
            title: "Add what was spent",
            body: "Who paid, how much, and how it's split: equally, by exact amounts or by percent. Anyone in the group can add an expense.",
          },
          {
            title: "Settle up",
            body: "SpendChat lists who pays whom, in as few payments as possible. When one happens, Mark as paid — and everyone's balance moves.",
          },
        ]}
      />

      <FeatureSection title="One balance, and everyone sees it">
        <p>
          The trouble with splitting costs isn&apos;t the arithmetic. It&apos;s
          that the record lives in one person&apos;s notes app, so they become
          the one who has to chase. In a split group, the record is shared:
          everyone sees the same expenses, the same balances and the same list
          of who pays whom, worked out from the same rows.
        </p>
        <p>
          Nobody has to send a reminder, because nobody has to ask. Your own
          balance reads &ldquo;you&apos;re owed&rdquo; or &ldquo;you owe&rdquo;
          at the top of the group, and each group in your list shows where you
          stand in it.
        </p>
      </FeatureSection>

      <FeatureSection title="Equal, exact or by percent">
        <p>
          <strong>Equal</strong> divides the total between whoever was there,
          and the odd cent goes first to the person who paid — ₹100 three ways
          is ₹33.34, ₹33.33 and ₹33.33, so nobody else is asked for more than an
          even share. <strong>Exact</strong> is for the bill where the starters
          were shared and the drinks weren&apos;t: type each person&apos;s
          amount, and it has to add up to the total. <strong>Percent</strong>{" "}
          suits rent by room size: percentages to two decimals that make 100.
        </p>
        <p>
          The server works out every share from what you typed, with the same
          integer maths the expense dialog previews — so what you see before you
          save is exactly what everyone sees after.
        </p>
      </FeatureSection>

      <FeatureSection title="Settle up in the fewest payments">
        <p>
          Four people and a dozen expenses could mean a dozen transfers. They
          don&apos;t have to: SpendChat matches the biggest debt with the
          biggest credit, then the next, so a group of n people never needs more
          than n − 1 payments. The list is the same for everyone, every time
          they open it.
        </p>
        <p>
          SpendChat doesn&apos;t move money. When someone pays — cash, UPI, a
          bank transfer — they press Mark as paid and the balances update for
          the whole group. A group where every balance is zero reads Settled Up.
          People can leave, or be removed, once they&apos;re settled up, so a
          debt can&apos;t walk out of the group.
        </p>
      </FeatureSection>

      <FeatureSection title="Invite anyone with an email address">
        <p>
          Add people by name and email. Someone who already has a SpendChat
          account sees an invitation in the app; anyone else gets one email with
          a link to join, and joining is tied to the address you invited. Until
          they join, you can still add expenses that include them.
        </p>
        <p>
          The person who starts the group runs it: they rename it, add and
          remove people, and can change the currency until the first expense or
          payment.
          Everyone else adds expenses, edits their own, and records the payments
          they made or received. Names are shared; email addresses aren&apos;t —
          only the organiser sees the ones they typed.
        </p>
      </FeatureSection>

      <FeatureSection title="Your share, in your own books">
        <p>
          Split groups live outside your{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspace
          </Link>
          , on purpose: the people on a trip see the trip, never your household
          budget. When you want an expense in your own tracking, press &ldquo;Add
          my share to my workspace&rdquo; and your part of it — not the whole
          bill — becomes one expense in the profile you choose, where it counts
          towards your{" "}
          <Link href={featureLink("budgets")} className="underline underline-offset-4">
            budgets
          </Link>{" "}
          like anything else.
        </p>
        <p>
          If the group uses another currency, you type what your share cost you
          in yours; SpendChat never guesses an exchange rate. If someone edits
          the expense afterwards, it tells you, and &ldquo;Update my entry&rdquo;
          brings yours in line.
        </p>
      </FeatureSection>

      <FeatureSection title="Try it before you sign up">
        <p>
          The{" "}
          <Link
            href={TOOL}
            className="underline underline-offset-4"
            data-track-event="cta_click"
            data-track-params={JSON.stringify({ location: "split_try_section", label: "split_tool" })}
          >
            split bill calculator
          </Link>{" "}
          is free and needs no account: name the group, add people, add
          expenses, and it shows the balances and who pays whom, with the same
          maths as the app. It keeps your draft in your browser. When you want
          everyone to have the link and see the balance live, create an account
          and the group comes with you.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Trips with friends",
            body: "Whoever has a card out pays, everyone adds what they paid as it happens, and on the last day the group shows the handful of payments that settle it.",
          },
          {
            title: "Flatmates",
            body: "Rent by room size, bills split evenly, groceries whenever. One running balance per person, so the end of the month is a number rather than an argument.",
          },
          {
            title: "Couples who split some things",
            body: "Dinners and holidays go in a group; the rest of your money stays in your own books. For shared books, there's a shared workspace instead.",
          },
        ]}
      />
    </FeaturePage>
  );
}
