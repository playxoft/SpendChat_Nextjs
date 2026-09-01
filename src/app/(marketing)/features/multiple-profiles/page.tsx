import Link from "next/link";
import { ProfilesDemo } from "@/components/marketing/demo/profiles-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "multiple-profiles";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "How do I separate business and personal expenses?",
    a: "Create a profile for each. Every profile has its own feed, its own balance and its own reports, so a business expense never lands in your personal totals. Switching between them is a click in the sidebar, a swipe on mobile, or Shift and a number.",
  },
  {
    q: "How many profiles can I have?",
    a: "As many as you need. Most people settle on two or three — Personal, Home, and one for freelance or business — but nothing stops you adding a profile for a trip, a renovation, or a side project. There is no archive: when one is finished you either leave it where it is, which costs nothing but a line in the sidebar, drag it to the bottom of the list, or delete it and say whether its transactions should move to another profile or go with it.",
  },
  {
    q: "What's the difference between a profile and a workspace?",
    a: "A profile is a set of books. A workspace is who can see them. Profiles divide your own money into separate ledgers; workspaces decide which people have access and at what level. A solo user needs only profiles; a household or a business needs both.",
  },
  {
    q: "Can I see everything at once?",
    a: "Yes. The \"All profiles\" view combines every profile you can access into one feed and one balance, so you can look at a single number for the month without giving up the separation underneath it.",
  },
  {
    q: "What happens to my transactions if I delete a profile?",
    a: "You choose. Before anything is removed you're shown how many transactions and files the profile holds, and you decide whether to move them to another profile, delete them with it, or cancel. Deleting a profile never silently takes records with it.",
  },
  {
    q: "Do profiles share categories and currency?",
    a: "Yes — those belong to the workspace, not the profile, so reports across profiles line up and a shared household is always using the same buckets and the same currency.",
  },
];

export default function MultipleProfilesPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<ProfilesDemo />}
      demoAction="switch between Personal, Home and Business in the sidebar"
      faqs={faqs}
      intro={
        <>
          <p>
            Your salary and your side project shouldn&apos;t share a balance. In
            SpendChat each part of your life gets its own profile — its own
            feed, its own running total, its own reports — and switching between
            them takes one keystroke.
          </p>
          <p>
            Try it below. The three profiles hold genuinely different
            transactions, and the balance changes with them.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Create a profile per set of books",
            body: "Personal, Home, Business — whatever divisions you actually think in. Each gets a name and an icon so it's recognisable at a glance.",
          },
          {
            title: "Pick one before you log",
            body: "The composer always shows which profile a transaction is going to, and it stays on your choice until you change it.",
          },
          {
            title: "Switch, or see everything",
            body: "Click in the sidebar, swipe on mobile, or press Shift and a number. \"All profiles\" combines them when you want one number.",
          },
        ]}
      />

      <FeatureSection title="Why separate profiles beat tagging everything">
        <p>
          The obvious alternative is a &ldquo;Business&rdquo; category, or a tag
          you attach to the relevant transactions. It works right up until you
          want an answer. What did the business spend this month? Now every
          report needs a filter applied before it means anything, every export
          needs the same filter remembered, and every total you glance at is
          quietly wrong until you do.
        </p>
        <p>
          Worse, tags are opt-in per transaction. The one you forget is the one
          that pollutes both sets of numbers, and you find out at the point when
          it matters most — usually while assembling something for an
          accountant.
        </p>
        <p>
          A profile inverts the default. The separation is the container rather
          than an attribute of what&apos;s inside it, so the numbers are right
          without anyone having to remember anything. You choose the profile once,
          when you switch to it, instead of choosing correctly on every single
          entry.
        </p>
      </FeatureSection>

      <FeatureSection title="Three shapes this usually takes">
        <p>
          <strong>Personal and business.</strong> The most common split, and the
          one with real consequences: a freelancer needs to hand over business
          numbers without their grocery shopping in them. Two profiles, one
          export each, done.
        </p>
        <p>
          <strong>Household and personal.</strong> Rent, bills and the weekly
          shop in one; your own coffee and books in another. It answers &ldquo;what
          does running this house cost?&rdquo; without you having to
          disentangle it from &ldquo;what do I spend?&rdquo;
        </p>
        <p>
          <strong>A project with an end date.</strong> A renovation, a wedding,
          a three-month trip. A profile keeps the whole thing in one place while
          it&apos;s live, and leaves a clean record afterwards instead of a smear
          across six months of ordinary spending.
        </p>
      </FeatureSection>

      <FeatureSection title="Switching is meant to be free">
        <p>
          A separation you have to think about is one you stop using. Switching
          profiles is a single click in the sidebar on desktop, a swipe left or
          right on mobile, and <strong>Shift + 1…9</strong> anywhere — the
          number chips in the sidebar are the shortcut, so you learn them by
          seeing them rather than by reading documentation.
        </p>
        <p>
          Your choice persists across pages too. Move from the tracker to{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            analytics
          </Link>{" "}
          or the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>{" "}
          and you&apos;re still in the same profile, so the report you land on is
          the one you were expecting.
        </p>
      </FeatureSection>

      <FeatureSection title="Profiles are your books; workspaces are your people">
        <p>
          These two are easy to confuse, so: a <strong>profile</strong> divides
          money. A <strong>workspace</strong> divides access. You might have one
          workspace containing three profiles, all yours. Or a household
          workspace where your partner can edit the Home profile and view
          nothing else.
        </p>
        <p>
          Access can be granted per workspace or per profile, and where both
          apply the more permissive one wins. That&apos;s what lets an accountant
          see the Business profile and nothing else, in the same account where
          your personal spending lives. The details are on{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspaces and sharing
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureSection title="Deleting a profile never silently deletes records">
        <p>
          Removing a profile that holds a year of transactions is a genuinely
          destructive act, so it doesn&apos;t happen behind a single confirm
          button. You&apos;re shown exactly what the profile contains — how many
          transactions, how many attached files — and then asked what should
          happen to them: move them to another profile, delete them along with
          it, or stop.
        </p>
        <p>
          If that count can&apos;t be read for any reason, the deletion is
          refused rather than proceeding on an assumption. It is always better
          to make someone try again than to guess wrong about their records.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Freelancers and sole traders",
            body: "Keep business books separate all year, then export just those when it's time to file — without unpicking them from your own spending.",
          },
          {
            title: "Households",
            body: "Shared costs in one profile, personal spending in another. Everyone can see what the house costs without seeing each other's coffee habit.",
          },
          {
            title: "Anyone running a project",
            body: "A renovation or a trip gets its own set of books for as long as it needs, and a clean total at the end.",
          },
        ]}
      />
    </FeaturePage>
  );
}
