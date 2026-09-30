import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { NetWorthTool } from "./_components/net-worth-tool";

const SLUG = "net-worth-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do I calculate my net worth?",
    a: "Add up the value of everything you own — cash, investments, retirement accounts, property, vehicles — then subtract everything you owe: mortgage, loans, credit card balances and any other debts. What's left is your net worth. The calculator above does the adding for you, one row per account.",
  },
  {
    q: "Should I include my house in my net worth?",
    a: "Yes — at what it would sell for today, not what you paid — and include the mortgage on the liabilities side. Only the difference, your equity, adds to your net worth. Some people also track a second figure without the home, because you can't spend your house without selling it or borrowing against it.",
  },
  {
    q: "Is a car an asset?",
    a: "It is, but a shrinking one. Put in what it would sell for now, which is usually well below the price you paid, and put any car loan under What you owe. Leave out things like furniture and electronics unless they would genuinely sell for something.",
  },
  {
    q: "Is a negative net worth bad?",
    a: "It's common, especially early on: student loans or a new mortgage can outweigh everything you own for years. What matters is the direction. Paying down debt and saving both raise it, so saving a snapshot every month or two and watching the change is more useful than the number on any one day.",
  },
  {
    q: "What is a good debt-to-asset ratio?",
    a: "It's your total debts divided by your total assets. Lower means more of what you own is actually yours: 25% means a quarter of your assets are owed to lenders. There's no single right number — a new homeowner may be at 80% and be fine — but the ratio falling over time is a good sign.",
  },
  {
    q: "Are my numbers saved or sent anywhere?",
    a: "No. The calculator runs in your browser, and nothing you type is sent to SpendChat or anyone else. Save a snapshot keeps just that day's totals and your rows in this browser's own storage, so you can compare next time; Clear history removes them.",
  },
];

export default function NetWorthCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Your net worth moves with what you spend. Track the spending side."
      faqs={faqs}
      intro={
        <p>
          Add up what you own and what you owe to see your net worth — then save a snapshot and
          come back to see how it changes. Everything stays in your browser.
        </p>
      }
      tool={<NetWorthTool />}
    >
      <ToolSection title="How to use the net worth calculator">
        <p>
          The rows start with an example. Replace the names and amounts with your own, remove
          the rows you don&apos;t need, and use the Add buttons for more accounts — each group
          holds up to ten. Your total assets, total liabilities and net worth update as you
          type, with a bar showing how much of what you own is still owed.
        </p>
        <p>
          <strong className="font-medium text-foreground">Save a snapshot</strong> keeps
          today&apos;s totals in this browser. Next time you open the calculator, it offers to
          load those numbers so you only have to update what changed — and it shows how far your
          net worth has moved since. Copy link shares the exact figures, if you want to.
        </p>
      </ToolSection>

      <ToolSection title="The net worth formula">
        <Formula>Net worth = total assets − total liabilities</Formula>
        <p>
          Assets are what you own at today&apos;s value: cash and bank balances, investments,
          retirement accounts, property, vehicles and anything else you could sell. Liabilities
          are what you owe: the mortgage, other loans, credit card balances and any other debts.
          The debt-to-asset ratio shows how much of what you own is borrowed:
        </p>
        <Formula>Debt-to-asset ratio = total liabilities ÷ total assets × 100</Formula>
      </ToolSection>

      <ToolSection title="A worked example">
        <p>
          The example in the calculator owns $15,000 in bank accounts, $25,000 in index funds,
          $40,000 in a pension, a $300,000 home and a $12,000 car — $392,000 of assets. It owes
          $220,000 on the mortgage, $8,000 on a car loan and $2,500 on a credit card — $230,500
          of liabilities.
        </p>
        <Formula>
          392,000 − 230,500 = $161,500 net worth
          <br />
          230,500 ÷ 392,000 = 58.8% debt-to-asset ratio
        </Formula>
        <p>
          Most of this net worth is home equity: $300,000 − $220,000 = $80,000. Every mortgage
          payment moves a little from the liabilities side to equity, which is why a net worth
          that grows slowly can still be growing steadily.
        </p>
      </ToolSection>

      <ToolSection title="What to count, and how often">
        <p>
          Use what things would sell for today, not what you paid: the market value of your
          home, the current balance of each investment and retirement account, the trade-in
          value of a car. Leave out future income, like next month&apos;s salary. Count every
          debt at its full outstanding balance, including a credit card you&apos;ll clear this
          month — the cash to clear it is already counted on the other side.
        </p>
        <p>
          Once a month or once a quarter is plenty. Net worth moves with markets and house
          prices, so the trend over a year says far more than any single month. What you can
          control is the gap between what comes in and what goes out —{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            seeing where your money goes each month
          </Link>{" "}
          is where most people find it.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
