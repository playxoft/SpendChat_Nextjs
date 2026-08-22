import Link from "next/link";
import { CategoriesDemo } from "@/components/marketing/demo/categories-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { featureLink, getFeature } from "@/lib/features";
import { createMetadata } from "@/lib/seo";

const SLUG = "categories";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

const faqs = [
  {
    q: "Can I create my own expense categories?",
    a: "Yes. Every workspace starts with fifteen defaults — ten for expenses, five for income — and you can rename any of them, change the emoji, delete the ones you'll never use, and add your own. A name is up to 20 characters, because it has to stay readable as a chip in the composer.",
  },
  {
    q: "What happens to transactions if I delete a category?",
    a: "The transactions stay; they just become uncategorised. Nothing is deleted along with the category, and your balance doesn't move. Those transactions do drop out of the category breakdown in analytics, though, and re-creating a category with the same name won't reattach them — it's a new category as far as the database is concerned.",
  },
  {
    q: "Do categories sync across my devices?",
    a: "Yes. Categories belong to the workspace and live on the server, so the list is identical on your laptop, your phone browser and the mobile app. There's nothing to import or keep in step by hand.",
  },
  {
    q: "Does everyone in a shared workspace see the same categories?",
    a: "Yes, and that's deliberate — it's what makes a shared report meaningful. Members with the editor or admin role can add, rename and delete categories; viewers see the list read-only.",
  },
  {
    q: "Can I have different categories for each profile?",
    a: "No. Profiles inside a workspace share one category list, so Personal, Home and Business are all described in the same vocabulary and their reports can be compared. If you genuinely need two unrelated lists, create a second workspace — each one gets its own set, seeded from the defaults.",
  },
  {
    q: "Can I use my own emoji as a category icon?",
    a: "Any emoji you can type. The icon is what your eye actually uses to scan the feed and the chip row, so picking something you recognise instantly matters more than picking something tidy. A category without an icon falls back to a plain tag.",
  },
];

export default function CategoriesPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<CategoriesDemo />}
      demoAction="rename a category, change its emoji, or add one — and watch the composer below"
      faqs={faqs}
      intro={
        <>
          <p>
            Every expense tracker ships with a list of categories, and every one
            of them is slightly wrong for you. SpendChat starts with a small,
            sensible set and expects you to edit it — rename what doesn&apos;t
            fit, change the icons, delete the dead weight, add the two or three
            things you actually spend money on.
          </p>
          <p>
            The demo below is the real editor and the real picker, wired
            together. Change a name and the chip changes with it.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Start from the defaults",
            body: "A new workspace is seeded with fifteen categories — ten expense, five income — so you can log something in the first thirty seconds without setting anything up.",
          },
          {
            title: "Make them yours",
            body: "Rename in place, pick a different emoji, delete what you don't use, add what's missing. Changes apply immediately, everywhere the list is read.",
          },
          {
            title: "Use them without thinking",
            body: "Tap a chip in the composer, or type # and keep typing to filter. Analytics, filters and exports all read the same list.",
          },
        ]}
      />

      <FeatureSection title="Fifteen defaults, because zero is worse">
        <p>
          An empty category list is the most honest design and the most annoying
          one. It asks you to model your own spending before you&apos;ve logged
          anything, which is a task nobody wants at the moment they downloaded a
          money tracker. So a new workspace arrives with ten expense categories
          — food and dining, groceries, transport, housing, utilities, shopping,
          health, entertainment, education, other — and five for income: salary,
          freelance, investments, gifts, and other again.
        </p>
        <p>
          Fifteen is a deliberate number. It&apos;s enough that most people
          never need to add anything, and few enough that the chip row in the
          composer is still scannable rather than a wall. The list is a starting
          point, not a schema: the first thing plenty of people do is delete
          three of them and rename two more, and that&apos;s the intended use.
        </p>
        <p>
          Names cap at 20 characters. That&apos;s not an arbitrary database
          limit — a category name has to fit inside a chip on a phone, next to
          an emoji, without truncating into uselessness. &ldquo;Groceries&rdquo;
          works. &ldquo;Household consumables and sundries&rdquo; does not, and
          the cap is there to stop you finding that out three months in.
        </p>
      </FeatureSection>

      <FeatureSection title="The emoji is not decoration">
        <p>
          Each category carries an emoji, and it does more work than the name
          does. In the feed and in the composer&apos;s chip row, the icon is
          what your eye lands on first — you recognise a 🛒 well before you read
          the word next to it. That&apos;s the difference between glancing at a
          week of spending and reading it.
        </p>
        <p>
          Which is why the icon is fully yours to change. If your brain files
          takeaway under 🍜 rather than 🍽️, change it; the point is recognition,
          not taxonomy. Any emoji works. A category with no icon at all still
          functions — it just falls back to a generic tag, and loses that head
          start.
        </p>
      </FeatureSection>

      <FeatureSection title="Shared by the workspace, not by the person">
        <p>
          Categories belong to a workspace, so everyone in it sees one list. If
          you share books with a partner, a housemate or an accountant, you
          can&apos;t end up with your &ldquo;Groceries&rdquo;, their
          &ldquo;Food shop&rdquo;, and a report that splits one real category in
          two. Comparable numbers are the whole reason to share a workspace, and
          a shared vocabulary is what makes them comparable.
        </p>
        <p>
          Editing is scoped by role. Anyone with editor or admin can add,
          rename and delete; viewers see the list but can&apos;t change it,
          which is the sensible default for an accountant or a teenager with
          read access. The same applies to profiles: Personal, Home and Business
          are separate sets of books inside one workspace, and they draw on the
          same categories — see{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profiles
          </Link>{" "}
          and{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            workspaces
          </Link>{" "}
          for how the two differ. If you truly need two unrelated lists, a
          second workspace gives you one, seeded from the defaults again.
        </p>
      </FeatureSection>

      <FeatureSection title="Everything downstream reads this one list">
        <p>
          Categories aren&apos;t a settings page you visit once. They&apos;re
          the index for everything else the app does with your data, which is
          why editing them changes so much at once.
        </p>
        <p>
          In the{" "}
          <Link href={featureLink("chat-expense-tracker")} className="underline underline-offset-4">
            composer
          </Link>{" "}
          they&apos;re the chip row, plus a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">More</code>{" "}
          popover holding the full grid; typing{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">#</code> in the
          title field filters the same list inline, so a category can be chosen
          without leaving the keyboard. In{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            analytics
          </Link>{" "}
          they&apos;re the slices of the breakdown and the rows of the ranked
          list. In the{" "}
          <Link href={featureLink("transactions")} className="underline underline-offset-4">
            transactions table
          </Link>{" "}
          they&apos;re a filter and a sortable column, and they come along in
          every CSV export.
        </p>
        <p>
          They also constrain the{" "}
          <Link href={featureLink("ai-expense-tracker")} className="underline underline-offset-4">
            AI
          </Link>
          . When you type a sentence for the model to parse, your workspace&apos;s
          category names are handed to it as the only permitted answers, and
          anything it returns is matched back against that list on the server —
          a name that isn&apos;t yours becomes no category rather than a new one.
          So the AI can&apos;t invent &ldquo;Miscellaneous&rdquo; on a slow day,
          and it gets better at guessing the moment you rename a category to
          something that actually describes your spending.
        </p>
      </FeatureSection>

      <FeatureSection title="Renaming is free. Deleting is a decision.">
        <p>
          A transaction points at a category by id, not by name, so renaming is
          safe in a way that surprises people who&apos;ve done this in a
          spreadsheet. Change &ldquo;Food &amp; Dining&rdquo; to
          &ldquo;Eating out&rdquo; and every transaction ever filed under it
          comes with you — history, totals, charts, all of it. There&apos;s no
          migration and nothing to reconcile.
        </p>
        <p>
          Deleting behaves differently, and it&apos;s worth knowing before you
          do it. The transactions survive — they simply become uncategorised.
          Your balance doesn&apos;t change, the entries stay in the feed and in
          the table, and nothing is lost. What they lose is their place in the
          breakdown: an uncategorised transaction counts toward your totals but
          belongs to no slice, so a page full of them quietly under-reports
          every category. And because the link was by id, re-creating a category
          with the same name later won&apos;t pull the old transactions back.
        </p>
        <p>
          The practical advice: rename freely, delete rarely, and when you do
          delete, do it early — before there&apos;s a year of history filed
          under it.
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Households sharing one set of books",
            body: "One list means one vocabulary. Nobody has to remember whether the weekly shop goes under Groceries or Food, because there's only one right answer and it's on screen.",
          },
          {
            title: "Freelancers and small businesses",
            body: "Rename the defaults to match the lines you actually report on, and the year-end export arrives already grouped the way your accountant asks for it.",
          },
          {
            title: "Anyone the defaults don't describe",
            body: "Rent isn't housing everywhere, transport isn't a car everywhere, and plenty of real spending has no English word. Change the names to the ones you'd use out loud.",
          },
        ]}
      />
    </FeaturePage>
  );
}
