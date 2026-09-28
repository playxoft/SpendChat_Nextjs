import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolPath } from "@/lib/tools";
import { PercentageTool } from "./_components/percentage-tool";

const SLUG = "percentage-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
});

const faqs = [
  {
    q: "How do I calculate a percentage of a number?",
    a: "Divide the percentage by 100 and multiply by the number. 15% of 200 is 15 ÷ 100 × 200 = 30. The first card above does it as you type.",
  },
  {
    q: "How do I work out a percentage increase?",
    a: "Subtract the old value from the new one, divide by the old value, and multiply by 100. Going from 80 to 100 is (100 − 80) ÷ 80 × 100 = 25%. A negative answer means it fell.",
  },
  {
    q: "What's the difference between percentage change and percent difference?",
    a: "Percentage change has a direction: it measures from an original value to a new one, so 80 → 100 is +25% but 100 → 80 is −20%. Percent difference compares two values neither of which is the original, relative to their average, so it's the same whichever way round you enter them.",
  },
  {
    q: "Why isn't a 10% rise followed by a 10% fall back to the start?",
    a: "Because the second 10% is taken from a bigger number. 100 up 10% is 110; 110 down 10% is 99. Percentages compound — which is also why a 50% loss needs a 100% gain to recover.",
  },
  {
    q: "How do I calculate a discount?",
    a: "Multiply the price by the discount percentage and divide by 100 to get the saving, then subtract it from the price. 25% off 1,200 saves 300, so you pay 900.",
  },
  {
    q: "Can I type numbers with commas?",
    a: "Yes. Type them the way you normally write them — 1,200, 1,00,000 or 1.200,50 — and the calculator reads them in your browser's number format.",
  },
];

export default function PercentageCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      faqs={faqs}
      intro={
        <p>
          Six everyday percentage questions, answered as you type — with the
          working shown, so you can check it or copy the method.
        </p>
      }
      tool={<PercentageTool />}
    >
      <ToolSection title="How to use the percentage calculator">
        <p>
          Find the card that matches your question and type your numbers. The
          answer updates instantly, the line underneath shows how it was worked
          out, and the copy button puts the answer on your clipboard as a
          sentence. Copy link saves every number you entered, so you can send
          the exact calculation to someone else.
        </p>
      </ToolSection>

      <ToolSection title="Percentage formulas">
        <p>Every card uses one of these. P is the percentage, written as a plain number (15, not 0.15).</p>
        <Formula>
          P% of Y = P ÷ 100 × Y
          <br />X as a % of Y = X ÷ Y × 100
          <br />% change = (B − A) ÷ |A| × 100
          <br />Increase by P% = A × (1 + P ÷ 100)
          <br />Decrease by P% = A × (1 − P ÷ 100)
          <br />% difference = |A − B| ÷ ((|A| + |B|) ÷ 2) × 100
        </Formula>
      </ToolSection>

      <ToolSection title="A worked example: the price went up — by how much?">
        <p>
          Your phone plan went from 499 to 599 a month. The change is 599 − 499 =
          100, and 100 ÷ 499 × 100 = 20.04%, so the price rose by about 20%. Over
          a year that&apos;s 1,200 more — the kind of quiet increase that only
          shows up when you track what you spend.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
