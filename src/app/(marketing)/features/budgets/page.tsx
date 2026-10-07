import Link from "next/link";
import { BudgetsDemo } from "@/components/marketing/demo/budgets-demo";
import {
  FeatureAudience,
  FeaturePage,
  FeatureSection,
  FeatureSteps,
} from "@/components/marketing/feature-page";
import { BUDGET_THRESHOLDS } from "@/lib/budgets";
import { featureLink, getFeature } from "@/lib/features";
import { budgetsAllowance } from "@/lib/plan-limit";
import { PLAN_NAMES } from "@/lib/plans";
import { createMetadata } from "@/lib/seo";

const SLUG = "budgets";
const feature = getFeature(SLUG)!;

export const metadata = createMetadata({
  title: feature.title,
  description: feature.description,
  path: `/features/${SLUG}`,
});

// The thresholds and the plan allowances are read from the code that enforces
// them, never typed out, so the page can't promise what the app doesn't do.
const [WARN, OVER] = BUDGET_THRESHOLDS;
const allowances = `${PLAN_NAMES.free} includes ${budgetsAllowance("free")} per workspace, ${PLAN_NAMES.plus} ${budgetsAllowance("plus")}, and ${PLAN_NAMES.pro} ${budgetsAllowance("pro")}`;

const faqs = [
  {
    q: "Can I set a budget for just one category, like eating out?",
    a: "Yes. A category budget counts that category across every profile in the workspace, so “Dining out” catches the dinner on your Personal profile and the takeaway on Home alike. You can also budget the whole workspace, or a single profile.",
  },
  {
    q: "Who gets the alert emails?",
    a: `The workspace's admins, and the person who set the budget as long as they can still change it. Each budget emails once when it reaches ${WARN}% and once at ${OVER}% in a month — never again for the same mark, unless someone raises the amount and spending passes the new one. Several budgets crossing at once arrive as one email. Each budget has its own switch to turn the emails off; the alerts in the app stay.`,
  },
  {
    q: "Does income count against a budget?",
    a: "No. Only expenses count. A refund you record as income doesn't lower what a budget has used — if you want the spending to go down, edit or delete the expense instead.",
  },
  {
    q: "What happens when I go over?",
    a: `Nothing is blocked. You can keep logging as usual; the bar turns red, the budget is marked “Over”, and the email at ${OVER}% goes out. A budget is there to tell you, not to stop you.`,
  },
  {
    q: "Does an unused budget roll over to next month?",
    a: "No. A budget is a monthly limit, and every calendar month starts again from zero. The month an expense counts in is the month of its date — the same months Analytics shows.",
  },
  {
    q: "How many budgets can I have?",
    a: `${allowances}. The limit is per workspace and shared by everyone in it. Reaching it never deletes anything; deleting a budget you don't need frees a place.`,
  },
  {
    q: "Can everyone in a shared workspace see the budgets?",
    a: "Anyone who can see every profile a budget covers. A whole-workspace or category budget adds up spending across all profiles, so it only shows to people who can read all of them — otherwise its total would give away spending they're not meant to see. Admins and editors set and change budgets; people with Read only look.",
  },
];

export default function BudgetsPage() {
  return (
    <FeaturePage
      slug={SLUG}
      demo={<BudgetsDemo />}
      demoAction={`log a couple of dinners and watch the budget turn amber at ${WARN}% and red at ${OVER}%`}
      faqs={faqs}
      intro={
        <>
          <p>
            Most months don&apos;t go wrong on the last day. They go wrong in
            week three, quietly, and you find out on the statement. A budget in
            SpendChat is a monthly limit that speaks up while there&apos;s still
            time to do something — at {WARN}% and again at {OVER}%, in the app
            and by email.
          </p>
          <p>
            Set one for everything the workspace spends, for one profile, or
            for one category like eating out. The demo below uses the app&apos;s
            own budget bar and its own maths.
          </p>
        </>
      }
    >
      <FeatureSteps
        steps={[
          {
            title: "Pick what to watch",
            body: "The whole workspace, one profile such as Home, or one category such as Dining out across every profile. Give it a monthly amount.",
          },
          {
            title: "Log the way you already do",
            body: "Every expense counts towards this month's budgets the moment it's saved — typed, spoken, pasted or imported. There's nothing to reconcile.",
          },
          {
            title: "Hear about it in time",
            body: `At ${WARN}% the bar turns amber, at ${OVER}% it turns red, and an email goes to the people who look after the money. Once per mark, per month.`,
          },
        ]}
      />

      <FeatureSection title={`A warning at ${WARN}%, not a verdict at the end`}>
        <p>
          Looking back at a month tells you what happened. It doesn&apos;t give
          you any of it back. The point of a budget is the moment before the
          line, when a week of slightly cheaper dinners still fixes it.
        </p>
        <p>
          So the budget speaks up at {WARN}%. Its bar turns amber and it&apos;s
          marked &ldquo;{WARN}%+&rdquo;; a count appears beside Budgets in the
          menu, on every page of the app, so you see it without going looking.
          At {OVER}% the bar and the count turn red and the budget reads
          &ldquo;Over&rdquo;. The same budgets show on{" "}
          <Link href={featureLink("analytics")} className="underline underline-offset-4">
            Analytics
          </Link>
          , next to where the money went.
        </p>
        <p>
          Nothing is ever blocked. You can keep logging past a budget — a
          tracker that refuses a real expense is a tracker that stops being
          accurate.
        </p>
      </FeatureSection>

      <FeatureSection title="Three ways to draw the line">
        <p>
          <strong>The whole workspace</strong> is one number for everything:
          the household&apos;s month, or the business&apos;s. <strong>One profile</strong>{" "}
          watches a single set of books — Home, say, while Personal stays
          unbudgeted. <strong>One category</strong> follows that category across
          every{" "}
          <Link href={featureLink("multiple-profiles")} className="underline underline-offset-4">
            profile
          </Link>
          , which is what you want for the two or three things that drift:
          eating out, shopping, taxis.
        </p>
        <p>
          Only expenses count, and only by their own date. A refund recorded as
          income doesn&apos;t quietly make room, and an expense dated in
          September counts in September even if you log it in October. Each
          calendar month starts from zero.
        </p>
      </FeatureSection>

      <FeatureSection title="Emails that tell you once">
        <p>
          An alert that arrives every time you buy a coffee gets filtered within
          a week. So each budget emails once when it reaches {WARN}% and once at{" "}
          {OVER}% in a month, and never again for the same mark. If you raise the
          amount and spending passes the new line, you hear about it again —
          that&apos;s new information. Several budgets crossing in one go arrive
          as a single email.
        </p>
        <p>
          The emails go to the workspace&apos;s admins and to whoever set the
          budget, while they can still change it. Each budget has its own switch
          to turn its emails off; the alerts in the app stay either way. And only
          the current month ever emails — importing last quarter&apos;s receipts
          won&apos;t tell you that July went over.
        </p>
      </FeatureSection>

      <FeatureSection title="Shared budgets that respect who sees what">
        <p>
          In a{" "}
          <Link href={featureLink("workspaces")} className="underline underline-offset-4">
            shared workspace
          </Link>
          , a budget is the same budget for everyone — one bar, one number,
          nobody keeping a private spreadsheet of how the month is going.
        </p>
        <p>
          But a total can give away what it adds up. A whole-workspace or
          category budget covers every profile, so it only shows to people who
          can read all of them; a profile budget shows to whoever can read that
          profile. Admins and people with Read + write set and change budgets;
          people with Read only look.
        </p>
        <p>
          {allowances}. Reaching the limit never deletes anything — and a
          budget is just as useful on{" "}
          <Link href="/pricing" className="underline underline-offset-4">
            any plan
          </Link>
          .
        </p>
      </FeatureSection>

      <FeatureAudience
        items={[
          {
            title: "Households",
            body: "One budget on the whole workspace, seen by both of you. The month's number is the same on both phones, and nobody has to be the one who asks.",
          },
          {
            title: "The one category that drifts",
            body: "Eating out, shopping, rides home. A category budget across every profile catches it wherever it was logged, and warns you while there's a week left.",
          },
          {
            title: "Freelancers and side businesses",
            body: "A budget on the business profile keeps costs in line without touching your personal spending. An accountant with Read sees the bar; the emails come to you.",
          },
        ]}
      />
    </FeaturePage>
  );
}
