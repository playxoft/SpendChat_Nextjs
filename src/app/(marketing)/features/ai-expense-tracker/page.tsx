import Link from "next/link";
import { AiDemo } from "@/components/marketing/demo/ai-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "ai-expense-tracker";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "What does the AI actually do?",
    a: "It reads a sentence you type and turns it into draft transactions — splitting multiple items apart, pulling out each amount, guessing a category from your own category list, working out whether something is income or an expense, and resolving dates like \"yesterday\". It produces drafts. It does not save anything.",
  },
  {
    q: "Does it save transactions automatically?",
    a: "No, and that is deliberate. Every parse lands in a review step where each draft is an editable row. Nothing reaches your feed until you press the confirm button. A model that writes directly to your records is a model that quietly corrupts them.",
  },
  {
    q: "Can it handle several transactions in one sentence?",
    a: "Yes. \"lunch 12.50, groceries 62, and 40 for the taxi home\" becomes three separate drafts. You can delete any of them before confirming, or add a row the sentence missed.",
  },
  {
    q: "Is the AI expense tracker free?",
    a: "Yes. AI entry is included at no cost, with a fair-use limit on how many parses one account can run in a period so a single user can't exhaust the shared allowance.",
  },
  {
    q: "What happens to what I type?",
    a: "The text of your note is sent to the configured model provider to be parsed, and the drafts come back. It is not used to train anything, and the rest of your data — your history, balances, other profiles — is never part of the request. If you'd rather not use it at all, the AI toggle is optional and manual entry is always there.",
  },
  {
    q: "Which AI model does it use?",
    a: "The model is configuration, not code — it's set per deployment rather than hard-coded, so it can be changed without an app update. That also means a self-hosted instance can point at whichever provider it prefers.",
  },
];

export default function AiExpenseTrackerPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<AiDemo />}
      demoAction="edit a draft, delete one, then press Add"
      faqs={faqs}
      intro={
        <>
          <p>
            Most AI expense trackers promise to do the work for you and then
            quietly file a $40 taxi under &ldquo;Entertainment&rdquo;. SpendChat
            takes the sentence you typed, turns it into draft transactions, and
            then stops — showing you exactly what it understood so you can fix
            the one it got wrong before anything is saved.
          </p>
          <p>
            The demo below runs the whole sequence: a messy sentence, a parse,
            three editable drafts, and a confirm. It doesn&apos;t call a model
            and nothing is saved.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Write it however you'd say it",
            body: "One item or five, in whatever order. Amounts, merchants, dates and income all in the same sentence — no syntax to learn.",
          },
          {
            title: "Check the drafts",
            body: "Each item comes back as a row: type, amount, title, category, date. Every field is editable, and any row can be deleted.",
          },
          {
            title: "Confirm",
            body: "One button writes them to your feed. Until you press it, nothing has been saved.",
          },
        ]}
      />

      <FeatureSection title="Parse, review, confirm — never straight to saved">
        <p>
          This is the part worth being pedantic about. Language models are very
          good at extracting structure from a sentence and reliably imperfect at
          it. Ask one to read &ldquo;40 for the taxi home&rdquo; a hundred times
          and it will occasionally decide the amount is 40 cents, or that
          &ldquo;home&rdquo; is the merchant, or that it belongs in a category
          you&apos;d never have picked.
        </p>
        <p>
          If those parses write straight into your records, you don&apos;t find
          out. The transaction is plausible, it&apos;s roughly the right size,
          and it sits in your history being subtly wrong until three months
          later when your category totals don&apos;t match anything you
          remember. Financial records fail quietly, which is exactly the failure
          mode automation is worst at.
        </p>
        <p>
          So the AI produces drafts and hands them to you. The review step costs
          about two seconds and it is the entire reason you can trust what comes
          out of it. It also means a bad parse is a five-second correction
          rather than a data-integrity problem — you fix the row in front of
          you, confirm, and move on.
        </p>
      </FeatureSection>

      <FeatureSection title="What it understands">
        <p>
          <strong>Several things at once.</strong> A sentence listing four
          purchases becomes four drafts, split on the natural boundaries rather
          than on commas alone.
        </p>
        <p>
          <strong>Income as well as spending.</strong> &ldquo;got 2000
          salary&rdquo; comes back as income, with the row&apos;s type already
          switched — you don&apos;t have to tell it which direction the money
          went.
        </p>
        <p>
          <strong>Dates in ordinary words.</strong> &ldquo;yesterday&rdquo;,
          &ldquo;last Friday&rdquo;, &ldquo;on the 3rd&rdquo; all resolve to a
          real date on the draft, which you can still change.
        </p>
        <p>
          <strong>Explicit hints when you want them.</strong> A{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">#</code> tag
          pins a category outright, and text in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">( )</code>{" "}
          becomes the description rather than the title. Neither is required —
          they&apos;re there for when you already know what you want and would
          rather not let it guess.
        </p>
      </FeatureSection>

      <FeatureSection title="It uses your categories, not a generic list">
        <p>
          The categories offered on each draft are the ones in your workspace —
          the defaults if you never changed them, and your own names and icons
          if you did. That matters for accuracy: an AI choosing from a fixed
          taxonomy has to map &ldquo;school fees&rdquo; onto something
          approximate, whereas one choosing from{" "}
          <Link href={featureLink("categories")} className="underline underline-offset-4">
            your list
          </Link>{" "}
          can pick the category you actually created for it.
        </p>
        <p>
          In a shared workspace that list is the same for everyone, so a parse
          run by one member lands in the same buckets as a parse run by another
          — which is what keeps{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            the reports
          </Link>{" "}
          coherent when more than one person is entering transactions.
        </p>
      </FeatureSection>

      <FeatureSection title="When it gets it wrong">
        <p>
          It will, sometimes. The common failures are predictable: an ambiguous
          amount, a merchant it reads as a category, or a sentence with an item
          that isn&apos;t really a transaction at all. Each has a one-click fix
          in the review step — retype the amount, edit the title, change the
          category from the dropdown, or delete the row entirely.
        </p>
        <p>
          If the split itself was wrong — two purchases merged into one, or one
          torn into two — click the note above the rows to go back and edit the
          sentence, then parse again. You never have to retype the whole thing
          to fix a bad boundary.
        </p>
      </FeatureSection>

      <FeatureSection title="What's sent, and what isn't">
        <p>
          Only the note you typed goes to the model, along with the names of
          your categories so it can choose among them. Your transaction history
          doesn&apos;t. Your balances don&apos;t. Your other profiles, your
          files, your workspace members — none of it is part of the request,
          because none of it is needed to read one sentence.
        </p>
        <p>
          AI entry is also entirely optional. The Manual and AI panes sit behind
          one toggle, and everything the app does works with the toggle left on
          Manual. If you&apos;d rather no third party ever saw your notes,
          that&apos;s a supported way to use SpendChat rather than a degraded
          one. More on what we do and don&apos;t collect is in{" "}
          <Link
            href={featureLink("privacy-and-security")}
            className="underline underline-offset-4"
          >
            privacy and security
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "People logging a day at a time",
            body: "If you'd rather enter a day's spending in one sentence at bedtime than open the app six times, this is the fastest path there is.",
          },
          {
            title: "People who hate categorising",
            body: "The category is usually already right. Reviewing a guess is much less work than making a choice from scratch, six times a day.",
          },
          {
            title: "People burned by automation",
            body: "If you've used a tool that silently mis-filed things, the review step is the difference. Nothing enters your records without you seeing it.",
          },
        ]}
      />
    </FeaturePage>
  );
}
