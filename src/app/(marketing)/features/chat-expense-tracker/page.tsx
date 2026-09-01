import Link from "next/link";
import { ChatDemo } from "@/components/marketing/demo/chat-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "chat-expense-tracker";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "What is a chat expense tracker?",
    a: "It's an expense tracker where each transaction is a message in a feed rather than a row in a form. You type an amount, pick a category and send, and the entry appears in a timeline with your running balance above it. The point is that logging money takes about as long as sending a text, so you actually do it.",
  },
  {
    q: "How long does it take to add a transaction?",
    a: "A few seconds. The amount field is focused when the composer opens, the category is one click or a # tag away, and Cmd/Ctrl + Enter sends. There is no save dialog, no page change, and no confirmation step to dismiss.",
  },
  {
    q: "Do I have to connect my bank account?",
    a: "No. SpendChat never asks for banking credentials and has no bank integration at all. You enter transactions yourself, which is what makes it work for cash, for accounts no aggregator supports, and for people who would rather not hand their login to a third party.",
  },
  {
    q: "Can I edit or delete a transaction after sending it?",
    a: "Yes. Tap any bubble in the feed to open it, change any field, or delete it. The balance above updates immediately.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. The layout adapts at every width — a bottom navigation bar and a full-width send button on phones, a sidebar and an inline send button on desktop. It runs in the browser, so there is nothing to install.",
  },
  {
    q: "Is the chat expense tracker free?",
    a: "Yes, and there is no paid tier holding features back. SpendChat is open source under the AGPL, has no ads, and does not sell data.",
  },
];

export default function ChatExpenseTrackerPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<ChatDemo />}
      demoAction="type an amount, pick a category, and hit send"
      faqs={faqs}
      intro={
        <>
          <p>
            Most expense trackers ask you to fill in a form. A chat expense
            tracker asks you to send a message. You type what you spent, choose
            a category, and it lands in a feed with your balance updating above
            it — the same motion as texting someone, applied to money.
          </p>
          <p>
            The demo below is the real thing, running on this page. Nothing is
            saved and you don&apos;t need an account.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Type the amount",
            body: "The amount field has focus the moment the composer opens, so you can start typing without clicking anything first.",
          },
          {
            title: "Pick a category",
            body: "Click a chip, or type # in the title field and keep typing to filter — the category is chosen without your hands leaving the keyboard.",
          },
          {
            title: "Send",
            body: "Cmd/Ctrl + Enter, or the send button. The bubble appears in the feed and the balance above it moves. No save dialog, no page change.",
          },
        ]}
      />

      <FeatureSection title="Why a feed beats a form">
        <p>
          The reason most people abandon expense tracking isn&apos;t that they
          stopped caring. It&apos;s that logging a $4 coffee costs more effort
          than the $4 is worth thinking about. A form with six fields, three of
          which are optional and one of which is a date picker defaulting to
          today, turns a two-second thought into a twenty-second chore. Do that
          five times a day and you quit in a fortnight.
        </p>
        <p>
          A feed inverts the trade. The only two things you have to supply are
          the amount and roughly what it was — everything else has a sensible
          default sitting behind it. The date is today unless you say otherwise.
          The profile is the one you&apos;re already looking at. The type is
          expense, because it almost always is. What you get back is immediate:
          the bubble appears, the balance moves, and the feed reads like a
          record of your day rather than a table you&apos;ll have to interpret
          later.
        </p>
        <p>
          It also changes what the history is <em>for</em>. A spreadsheet of
          transactions is something you audit. A conversation is something you
          scroll. Looking back over a week in SpendChat feels closer to
          re-reading a chat thread than reconciling an account — and that turns
          out to be the difference between a record you keep and a record you
          actually read.
        </p>
      </FeatureSection>

      <FeatureSection title="Tag a category without reaching for the mouse">
        <p>
          Categories sit in a scrollable row above the composer, so the ones you
          use constantly are one click away. But the faster path is the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">#</code> tag:
          start typing <code className="rounded bg-muted px-1 py-0.5 text-sm">#gro</code>{" "}
          in the title field and the category list filters as you go, arrow keys
          move through it, Enter picks one. The tag disappears from the title
          once it&apos;s applied, so the note stays clean.
        </p>
        <p>
          That matters more than it sounds. Categorising is the step people skip
          when they&apos;re in a hurry, and an uncategorised transaction is
          worth very little later — it counts toward your balance but tells you
          nothing about where the money went. Making the category cheap to
          attach is what keeps the analytics honest.
        </p>
        <p>
          The categories themselves are yours to shape. Every workspace starts
          from a sensible default set and you can rename them, change their
          icons, or add your own — see{" "}
          <Link href={featureLink("categories")} className="underline underline-offset-4">
            custom categories
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureSection title="The balance is always the last thing you read">
        <p>
          The header carries three numbers for the month you&apos;re looking at:
          what came in, what went out, and the balance between them. As you
          scroll back through the feed it follows you, so the numbers always
          describe the month currently under your eyes rather than the current
          calendar month.
        </p>
        <p>
          Inside the feed, entries are grouped by day and separated by month, so
          a year of history reads top to bottom without any filtering. Income
          aligns to the left and carries a green plus; expenses align right in
          neutral text. You can tell what kind of month you had from the shape
          of the thread before you read a single number.
        </p>
      </FeatureSection>

      <FeatureSection title="Compact density, when you want more on screen">
        <p>
          The default layout is roomy — it&apos;s built for a phone held in one
          hand. If you&apos;re at a desk and would rather see more rows at once,
          compact density gathers the whole control strip into a single line and
          tightens the feed. It&apos;s a per-person preference that follows you
          between devices, not a per-workspace setting, so switching it on
          doesn&apos;t change what anyone else sees.
        </p>
      </FeatureSection>

      <FeatureSection title="Why not just use notes, or a spreadsheet?">
        <p>
          A notes app is genuinely faster to open, and if all you want is a list
          of numbers it&apos;s hard to beat. What it can&apos;t do is add them
          up by category, tell you this month from last, or give you a filtered
          export when your accountant asks. You end up transcribing the note
          into a spreadsheet, which is the work you were avoiding.
        </p>
        <p>
          A spreadsheet solves the arithmetic and is still the right tool if you
          want full control of the model. The cost is entry: on a phone, adding
          a row to a spreadsheet is genuinely unpleasant, which is why most
          people&apos;s spreadsheets are updated in one painful sitting at the
          end of the month, from memory. SpendChat is trying to be as quick as
          the note and as useful as the spreadsheet — and if you decide
          otherwise, every view exports to{" "}
          <Link href={featureLink("export-and-print")} className="underline underline-offset-4">
            CSV
          </Link>
          , so nothing is trapped here.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People who track cash",
            body: "Bank-linked apps simply can't see cash. If a meaningful share of your spending is notes and coins, manual entry isn't a limitation — it's the only thing that works.",
          },
          {
            title: "People who won't share bank logins",
            body: "Handing your banking credentials to an aggregator is a real risk with a real history of incidents. SpendChat never asks, because it has nothing to ask for.",
          },
          {
            title: "People who've quit three trackers already",
            body: "If the reason you stopped was friction rather than intent, the thing to change is how long an entry takes. That's the whole design premise here.",
          },
        ]}
      />
    </FeaturePage>
  );
}
