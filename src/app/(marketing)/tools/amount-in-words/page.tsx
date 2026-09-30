import { Formula, ToolPage, ToolSection } from "@/components/tools/tool-page";
import { createMetadata } from "@/lib/seo";
import { getTool, toolOgImage, toolPath } from "@/lib/tools";
import { AmountInWordsTool } from "./_components/amount-in-words-tool";

const SLUG = "amount-in-words";
const tool = getTool(SLUG)!;

export const metadata = createMetadata({
  title: tool.title,
  description: tool.description,
  path: toolPath(SLUG),
  image: toolOgImage(SLUG),
});

const faqs = [
  {
    q: "How do you write 1,50,000 in words?",
    a: "One lakh fifty thousand. As rupees on an Indian cheque: \"Rupees One Lakh Fifty Thousand Only\". In the international system the same number is one hundred fifty thousand.",
  },
  {
    q: "How do I write 10 lakh in words?",
    a: "Ten lakh — 10,00,000 in figures. It is the same amount as one million (1,000,000) in the international system.",
  },
  {
    q: "How do I write cents on a US check?",
    a: "Write the dollars in words, then \"and\", then the cents as a fraction of 100: $1,250.75 is \"One thousand two hundred fifty and 75/100 dollars\". On a whole-dollar amount write \"and 00/100\", and draw a line through the rest of the space so nothing can be added.",
  },
  {
    q: "Should I write \"only\" after the amount?",
    a: "On cheques in India, the UK, the Gulf and much of Africa, yes — \"only\" closes the line so no one can add words after it. US checks use the \"and xx/100\" fraction for the same purpose instead.",
  },
  {
    q: "What's the difference between a lakh and a million?",
    a: "A lakh is 1,00,000 (one hundred thousand) and a crore is 1,00,00,000 (ten million). Ten lakh make a million, and a hundred crore make a billion.",
  },
  {
    q: "Does it handle paise and cents?",
    a: "Yes. The amount is split using the currency's own decimals: two for rupees, dollars, euros and pounds, none for yen, three for the Kuwaiti dinar. Anything past that is rounded, and the tool tells you when it has.",
  },
];

export default function AmountInWordsPage() {
  return (
    <ToolPage
      slug={SLUG}
      cta="Writing out amounts for bills and invoices?"
      faqs={faqs}
      intro={
        <p>
          Type an amount and get it in words, ready for a cheque, an invoice or a
          receipt — in lakh and crore or in millions, in over 60 currencies.
        </p>
      }
      tool={<AmountInWordsTool />}
    >
      <ToolSection title="How to use it">
        <p>
          Type the amount the way you normally write it — 120000.50, 1,20,000.50
          or 120,000.50 — and pick the currency. Rupees default to the Indian
          system and everything else to millions, but you can switch either way.
          Choose the letter case your form asks for, then copy the words, the
          cheque line or the US check line.
        </p>
      </ToolSection>

      <ToolSection title="Lakh and crore vs million and billion">
        <p>
          South Asia groups large numbers differently: after the first thousand,
          digits are grouped in twos. The same amount, written both ways:
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-muted/40 text-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Figure</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Indian system</th>
                <th scope="col" className="px-4 py-2.5 font-medium">International system</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              <tr>
                <td className="px-4 py-2.5">1,00,000 = 100,000</td>
                <td className="px-4 py-2.5">one lakh</td>
                <td className="px-4 py-2.5">one hundred thousand</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">10,00,000 = 1,000,000</td>
                <td className="px-4 py-2.5">ten lakh</td>
                <td className="px-4 py-2.5">one million</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">1,00,00,000 = 10,000,000</td>
                <td className="px-4 py-2.5">one crore</td>
                <td className="px-4 py-2.5">ten million</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">100,00,00,000 = 1,000,000,000</td>
                <td className="px-4 py-2.5">one hundred crore</td>
                <td className="px-4 py-2.5">one billion</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ToolSection>

      <ToolSection title="How to write an amount in words on a cheque">
        <p>
          Two conventions cover most of the world. In India, the UK and many
          Commonwealth and Gulf countries, the line ends with &ldquo;only&rdquo;;
          Indian cheques also put the currency first:
        </p>
        <Formula>Rupees Twelve Thousand Five Hundred and Fifty Paise Only</Formula>
        <p>
          In the US, the dollars are written in words and the cents as a fraction
          of a hundred, with the currency last:
        </p>
        <Formula>Twelve thousand five hundred and 50/100 dollars</Formula>
        <p>
          Either way, start at the far left of the line and fill the space after
          the words with a line, so nothing can be squeezed in later. If the words
          and the figures disagree, banks generally treat the words as the amount.
        </p>
      </ToolSection>

      <ToolSection title="A worked example">
        <p>
          An invoice total of 2,45,300.75 rupees reads &ldquo;two lakh forty five
          thousand three hundred rupees and seventy five paise&rdquo;. The same
          figure in US dollars, 245,300.75, reads &ldquo;two hundred forty-five
          thousand three hundred dollars and seventy-five cents&rdquo; — the
          international system hyphenates the tens, the Indian one doesn&apos;t.
        </p>
      </ToolSection>
    </ToolPage>
  );
}
