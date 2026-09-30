import Link from "next/link";
import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { FireTool } from "./_components/fire-tool";

const SLUG = "fire-calculator";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "What is a FIRE number?",
    a: "It's how much you need invested to live off your investments for good — financial independence. Divide a year's spending by your withdrawal rate: at the classic 4%, that's 25 times your yearly spending, so spending 40,000 a year needs 1,000,000 invested.",
  },
  {
    q: "What is the 4% rule?",
    a: "A rule of thumb from US research in the 1990s: withdrawing 4% of your savings in the first year of retirement, then the same amount rising with inflation, lasted at least 30 years in almost every historical period tested. Early retirees planning for 40 years or more often use 3–3.5% to be safer, which raises the FIRE number to about 29–33 times spending.",
  },
  {
    q: "What is Coast FIRE?",
    a: "Coast FIRE is when you've invested enough that growth alone will reach your FIRE number by a later age — say 60 — even if you never save another penny. From then on your earnings only need to cover your living costs. The Coast FIRE number is your FIRE number divided by (1 + return) for each year until that age.",
  },
  {
    q: "What's the difference between Lean FIRE and Fat FIRE?",
    a: "Lean FIRE means retiring on a frugal budget; Fat FIRE on a comfortable one. There's no official line, so this calculator reads them as 70% and 150% of the spending you enter, and shows each one's FIRE number and when you could reach it. Change the yearly spending to test your own figure.",
  },
  {
    q: "Why does the calculator use a return after inflation?",
    a: "So every figure is in today's money. With a real return — say 7% growth minus 2% inflation, about 5% — the FIRE number stays the same in today's prices, and \"age 46\" needs no footnote about what money will be worth then. If you enter a return before inflation instead, the answer will look much closer than it really is.",
  },
  {
    q: "Should my home or pension count towards my FIRE number?",
    a: "Count only investments you'll draw an income from. Your home doesn't count unless you plan to sell it. A pension or state pension that starts later lowers what your investments must cover from that age — this calculator doesn't model it, so treat the result as the cautious case.",
  },
];

export default function FireCalculatorPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Your FIRE number rests on your real yearly spending. Track it."
      faqs={faqs}
      intro={
        <p>
          Find your FIRE number — what you need invested to retire early — and when you could get
          there. Coast FIRE, Lean and Fat FIRE and the 4% rule on one page, all in today&apos;s
          money.
        </p>
      }
      tool={<FireTool />}
    >
      <ToolSection title="How to use the FIRE calculator">
        <p>
          Pick a question at the top. <strong className="font-medium text-foreground">Years to
          FIRE</strong> shows the age you could reach your FIRE number, with the path year by year.{" "}
          <strong className="font-medium text-foreground">FIRE number</strong> needs only your
          spending and withdrawal rate. <strong className="font-medium text-foreground">Coast
          FIRE</strong> shows what you need invested today to stop saving and still get there by
          a later age. <strong className="font-medium text-foreground">Lean &amp; Fat</strong>{" "}
          compares a frugal and a comfortable retirement.
        </p>
        <p>
          Enter your yearly spending in retirement, what you have invested, and what you invest
          each month or each year. The expected return is <em>after inflation</em> — a real return
          — so every result is in today&apos;s money. It&apos;s an estimate built on a steady
          return, not financial advice: markets don&apos;t move in straight lines. Copy link
          shares the exact numbers.
        </p>
      </ToolSection>

      <ToolSection title="The FIRE formulas">
        <p>The FIRE number is your yearly spending divided by your withdrawal rate:</p>
        <Formula>FIRE number = yearly spending ÷ withdrawal rate &nbsp;(× 25 at 4%)</Formula>
        <p>
          The years to FIRE come from growing what you have plus a monthly saving M until it
          reaches that number. With P invested and a real yearly return r, compounded monthly:
        </p>
        <Formula>
          i = (1 + r)^(1/12) − 1
          <br />
          months = ln((FIRE number × i + M) ÷ (P × i + M)) ÷ ln(1 + i)
        </Formula>
        <p>Coast FIRE is the FIRE number discounted back to today:</p>
        <Formula>Coast FIRE number = FIRE number ÷ (1 + r)^(years until your chosen age)</Formula>
        <p>
          The calculator steps through the months instead of using the formula — it lands on the
          same answer, and gives the balance at every age on the way.
        </p>
      </ToolSection>

      <ToolSection title="A worked example">
        <p>
          You&apos;re 30, expect to spend $40,000 a year, have $100,000 invested, and invest $2,500
          a month at a 5% real return. At a 4% withdrawal rate:
        </p>
        <Formula>
          40,000 ÷ 0.04 = $1,000,000 FIRE number
          <br />
          $100,000 + $2,500 a month at 5% → $1,000,000 in 16 years 9 months, at age 46
        </Formula>
        <p>
          By then you&apos;ve paid in $602,500 and growth has added about $399,700. Save $3,000 a
          month instead and you&apos;re there at 45; save $1,500 and it&apos;s 52. Lean FIRE at
          $28,000 a year needs $700,000 (age 42); Fat FIRE at $60,000 needs $1,500,000 (age 52).
        </p>
        <p>
          For Coast FIRE by 60, you&apos;d need 1,000,000 ÷ 1.05^30 = $231,377 invested today. With
          $100,000 you&apos;re $131,377 short — but keep investing $2,500 a month for five more
          years, until about 35, and growth alone could carry it to $1,000,000 by 60.
        </p>
      </ToolSection>

      <ToolSection title="The withdrawal rate is the assumption to test">
        <p>
          The 4% rule was tested on 30-year retirements. Retire at 45 and your money may need to
          last 50 years, so many early retirees plan on 3–3.5%. In the example, 3.5% raises the
          FIRE number to $1,142,857 and pushes FIRE from 46 to 48. The FIRE number mode shows the
          number at several rates side by side.
        </p>
        <p>
          The other lever is the spending figure itself — it sets the whole target, and most
          people guess it low. A year of{" "}
          <Link href="/features/analytics" className="font-medium text-foreground underline underline-offset-4">
            seeing where your money actually goes
          </Link>{" "}
          turns it from a guess into a number you can plan on.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
