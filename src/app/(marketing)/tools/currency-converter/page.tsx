import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { CurrencyTool } from "./_components/currency-tool";

const SLUG = "currency-converter";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "Why is my bank's exchange rate different?",
    a: "This converter shows reference rates — the mid-point between what currencies are bought and sold for. Banks, card networks and exchange counters convert at their own rate, a little worse than that, and many add a fee on top. The gap is how they earn on the exchange. Convert $1,000 at a reference rate of 0.88 and you'd get €880; a counter whose rate is 2.5% worse hands you €858.",
  },
  {
    q: "How often are the exchange rates updated?",
    a: "Once a day. The rates are official reference rates that central banks publish once each working day, so weekends and public holidays keep the last published rate. The converter downloads the latest list when you open it, keeps it on your device for up to 12 hours, and always shows the date the rates are from.",
  },
  {
    q: "Are these live exchange rates?",
    a: "No — they're daily reference rates, not live market prices. Currencies trade around the clock on weekdays, so the rate at this minute can differ slightly from the day's reference. That's close enough for budgeting a trip, pricing an invoice or checking a quote, but not for trading.",
  },
  {
    q: "What is the mid-market rate?",
    a: "The halfway point between the price buyers pay for a currency and the price sellers get. It's the fairest single number for what one currency is worth in another, which is why reference rates are used here. Nobody sells currency to the public at exactly that rate — the difference between it and the rate you're offered is the provider's margin.",
  },
  {
    q: "Should I pay in the local currency or my own when abroad?",
    a: "Usually the local currency. When a card machine or cash machine abroad offers to charge you in your home currency, it's called dynamic currency conversion, and the rate it uses is typically worse than your own card's. Choosing the local currency lets your card issuer convert it instead.",
  },
  {
    q: "Why does a currency say \"rate not available\"?",
    a: "The rate source didn't publish that currency in today's list. The Bulgarian lev, for example, was replaced by the euro in January 2026, so central banks no longer quote it. Pick a different currency, or check back another day for one that's only missing for now.",
  },
];

export default function CurrencyConverterPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Spending abroad? Log each expense as you go and see where the trip money went."
      faqs={faqs}
      intro={
        <p>
          Convert one amount into several currencies at once at today&apos;s reference exchange
          rates — or list a trip&apos;s expenses in the local currency and see the total in yours,
          with your card&apos;s fee if you like.
        </p>
      }
      tool={<CurrencyTool />}
    >
      <ToolSection title="How to use the currency converter">
        <p>
          Type an amount and pick the currency it&apos;s in. Every currency in your list converts at
          once — USD to INR, euros and pounds side by side — each with its unit rate, so you can see
          that 1 USD buys, say, 96 rupees. Add up to eight currencies, remove the ones you don&apos;t
          need, and tap the swap button on any of them to convert from that currency instead.
        </p>
        <p>
          Switch to <strong className="font-medium text-foreground">Trip expenses</strong> to add up
          a list — the hotel, food, train tickets — in the trip&apos;s currency and see the total in
          your home currency. If your card charges a fee on foreign spending, add it under More
          options to see what the trip really costs you. Copy link saves the whole list.
        </p>
        <p>
          The rates are downloaded by your browser straight from Frankfurter, a free, open-source
          service that collects official reference rates from central banks (with the open
          currency-api dataset as a backup). Only the rate list is requested — the amounts you
          type are never sent anywhere.
        </p>
      </ToolSection>

      <ToolSection title="The formula">
        <Formula>
          1 A in B = (B per 1 USD) ÷ (A per 1 USD)
          <br />
          amount in B = amount in A × rate from A to B
          <br />
          trip total at home = sum of expenses × rate from trip to home
          <br />
          with a card fee = trip total at home × (1 + fee ÷ 100)
        </Formula>
        <p>
          Every rate is quoted against the US dollar, so any other pair is worked out through it. If
          1 USD buys 0.88 EUR and 96 INR, then 1 EUR = 96 ÷ 0.88 = 109.09 INR, and €500 is
          ₹54,545.45. Results are rounded to the currency&apos;s own decimals — whole yen, cents
          for dollars and euros, three decimals for the Kuwaiti dinar — and the trip&apos;s
          converted expenses always add up to its converted total.
        </p>
      </ToolSection>

      <ToolSection title="A worked example: a weekend in Paris, paid by card">
        <p>
          You spend €360 on a hotel for three nights, €180 on food, €95 on train tickets and €48 on
          museum passes — €683 in all. Say the reference rate is 1 EUR = 1.14 USD, close to the
          rate in September 2026:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-foreground">At the reference rate:</strong> €683 ×
            1.14 = $778.62 (hotel $410.40, food $205.20, trains $108.30, museums $54.72).
          </li>
          <li>
            <strong className="font-medium text-foreground">On a card with a 3% foreign fee:</strong>{" "}
            $778.62 × 1.03 = $801.98 — $23.36 more for the same weekend.
          </li>
        </ul>
        <p>
          Enter the same four expenses in trip mode, with 3% under More options, to see the split
          at today&apos;s rate.
        </p>
      </ToolSection>

      <ToolSection title="Why the rate you get is worse than this one">
        <p>
          The rates here are mid-market reference rates: halfway between the buying and selling
          price of a currency. Nobody exchanges money for the public at exactly that rate. A bank or
          exchange counter sells you currency a little above it and buys it back a little below —
          that gap is the spread — and cards often add a foreign transaction fee on top. Many debit
          and credit cards add about 2–3.5% to spending abroad; some travel cards and accounts add
          nothing.
        </p>
        <p>
          It adds up quickly. At a reference rate of 1 USD = 0.88 EUR, $1,000 is €880. A counter
          whose rate is 2.5% worse gives you €858 — €22 less, before any commission. So use this
          converter to check a quote: work out what the reference rate says, then compare it with
          what you&apos;re offered. And when a card machine abroad asks whether to charge you in
          your home currency, choose the local one — that on-the-spot conversion usually costs more
          than your card&apos;s own.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
